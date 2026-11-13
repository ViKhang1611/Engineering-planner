import { produce, setAutoFreeze } from "immer";
import {
  normalizeExecution,
  normalizeTask,
  validateExtensions,
  overallProgress,
} from "../../../domain/execution";
import { createSeed, createLargeProject } from "../data/seed";
import {
  scheduleProject,
  SchedulingError,
  parseDate,
} from "../engine/schedulingEngine";
import type {
  Baseline,
  Dependency,
  ProjectInput,
  ScheduleResult,
  Task,
} from "../engine/types";
export interface Snapshot {
  project: ProjectInput;
  baseline: Baseline | null;
}
export interface ScheduleSession extends Snapshot {
  result: ScheduleResult;
  selected: string[];
  collapsed: Set<string>;
  notice: string;
  error: string;
  history: Snapshot[];
  future: Snapshot[];
  revision: number;
  commit: (mutate: (project: ProjectInput) => void, message: string) => boolean;
  updateTask: (id: string, patch: Partial<Task>) => boolean;
  select: (id: string, multi?: boolean) => void;
  toggle: (id: string) => void;
  addTask: () => void;
  removeTask: (id: string) => boolean;
  /** Deletes the given tasks with all their descendants and links (undoable). */
  removeTasks: (ids: readonly string[]) => boolean;
  indent: (outdent: boolean) => void;
  link: (link: Omit<Dependency, "id">) => boolean;
  unlink: (id: string) => void;
  captureBaseline: () => void;
  selectBaseline: (id: string) => void;
  undo: () => void;
  redo: () => void;
  replace: (project: ProjectInput, baseline?: Baseline | null) => boolean;
  loadLarge: () => void;
  reset: () => void;
  clearError: () => void;
  setError: (message: string) => void;
}
// Committed projects are frozen. Besides catching accidental in-place edits
// (which would corrupt undo snapshots that share objects), frozen subtrees
// let immer skip unchanged parts such as baselines when finalizing a commit.
setAutoFreeze(true);

/**
 * The existing tasks among `ids` plus every descendant of them: exactly what
 * deleting those rows removes from the WBS.
 */
export function withDescendants(
  tasks: readonly Pick<Task, "id" | "parentId">[],
  ids: readonly string[],
): Set<string> {
  const known = new Set(tasks.map((task) => task.id));
  const result = new Set(ids.filter((id) => known.has(id)));
  let changed = result.size > 0;
  while (changed) {
    changed = false;
    for (const task of tasks)
      if (task.parentId && result.has(task.parentId) && !result.has(task.id)) {
        result.add(task.id);
        changed = true;
      }
  }
  return result;
}

/** Undo/redo depth per project session. */
export const HISTORY_LIMIT = 100;

/**
 * Applies a mutation with structural sharing (immer): only objects the
 * mutation touches are copied, everything else is shared with the previous
 * version. Undo snapshots therefore cost only what changed, and baselines
 * (full task snapshots) are never copied. Committed projects are frozen, so any
 * edit must go through commit.
 */
export function applyCommit(
  base: ProjectInput,
  mutate: (project: ProjectInput) => void,
): ProjectInput {
  const baseTasks = new Set(base.tasks);
  let project = produce(base, (draft) => {
    mutate(draft as ProjectInput);
    draft.id = base.id; // Workspace identity cannot be changed by import.
  });
  // Unchanged tasks were normalized by an earlier commit; only tasks this
  // commit created or touched can need it.
  const touched: number[] = [];
  project.tasks.forEach((task, index) => {
    if (!baseTasks.has(task)) touched.push(index);
  });
  if (touched.length)
    project = produce(project, (draft) => {
      for (const index of touched) normalizeTask(draft.tasks[index] as Task);
    });
  return project;
}
/** Session actions write into their project record in the one workspace store. */
export function createScheduleSession(
  set: (
    patch:
      | Partial<ScheduleSession>
      | ((state: ScheduleSession) => Partial<ScheduleSession>),
  ) => void,
  get: () => ScheduleSession,
  snapshot: Snapshot,
): ScheduleSession {
  snapshot = structuredClone(snapshot);
  snapshot.project.baselines ??= snapshot.baseline ? [snapshot.baseline] : [];
  snapshot.project.activeBaselineId ??= snapshot.baseline?.id;
  normalizeExecution(snapshot.project);
  validateExtensions(snapshot.project);
  snapshot.baseline =
    snapshot.project.baselines.find(
      (b) => b.id === snapshot.project.activeBaselineId,
    ) ?? null;
  return {
    ...snapshot,
    result: scheduleProject(snapshot.project),
    selected: [],
    collapsed: new Set(),
    notice: "Dự án đã sẵn sàng",
    error: "",
    history: [],
    future: [],
    revision: 0,
    clearError: () => set({ error: "" }),
    setError: (error) => set({ error }),
    commit: (mutate, message) => {
      const state = get();
      try {
        let project = applyCommit(state.project, mutate);
        validateExtensions(project);
        const result = scheduleProject(project);
        project = {
          ...project,
          progressHistory: [
            ...(project.progressHistory ?? []).filter(
              (p) => p.date !== project.statusDate,
            ),
            {
              date: project.statusDate,
              physicalPct: overallProgress(result.tasks),
            },
          ].sort((a, b) => a.date.localeCompare(b.date)),
        };
        set({
          project,
          baseline:
            project.baselines?.find((b) => b.id === project.activeBaselineId) ??
            null,
          result,
          history: [
            ...state.history.slice(-(HISTORY_LIMIT - 1)),
            { project: state.project, baseline: state.baseline },
          ],
          future: [],
          revision: state.revision + 1,
          notice: message,
          error: "",
        });
        return true;
      } catch (error) {
        set({
          error:
            error instanceof SchedulingError
              ? `${error.code}: ${error.message}`
              : error instanceof Error
                ? error.message
                : "Dữ liệu không hợp lệ.",
        });
        return false;
      }
    },
    updateTask: (id, patch) =>
      get().commit((project) => {
        const task = project.tasks.find((task) => task.id === id);
        if (!task) throw new Error("Không tìm thấy công việc.");
        if (
          project.tasks.some((task) => task.parentId === id) &&
          ["duration", "requestedStartDate", "physicalPct", "assignments"].some(
            (key) => key in patch,
          )
        )
          throw new Error(
            "Ngày, thời lượng và tiến độ Summary được tổng hợp tự động.",
          );
        if ("physicalPct" in patch && task.progressMode === "checklist")
          throw new Error(
            "Physical % đang tính từ checklist. Chuyển sang nhập trực tiếp trong chi tiết để sửa.",
          );
        if ("physicalPct" in patch && !("executionStatus" in patch))
          task.executionStatus = undefined;
        Object.assign(task, patch);
      }, "Đã lưu và tính lại tiến độ"),
    select: (id, multi = false) =>
      set((state) => ({
        selected: multi
          ? state.selected.includes(id)
            ? state.selected.filter((x) => x !== id)
            : [...state.selected, id]
          : [id],
      })),
    toggle: (id) =>
      set((state) => {
        const collapsed = new Set(state.collapsed);
        if (collapsed.has(id)) collapsed.delete(id);
        else collapsed.add(id);
        return { collapsed };
      }),
    addTask: () => {
      const id = crypto.randomUUID();
      if (
        get().commit((project) => {
          project.tasks.push({
            id,
            parentId: null,
            name: "Công việc mới",
            duration: 1,
            physicalPct: 0,
            assignments: [],
          });
        }, "Đã thêm công việc")
      )
        get().select(id);
    },
    removeTask: (id) => get().removeTasks([id]),
    removeTasks: (ids) => {
      const state = get();
      const remove = withDescendants(state.project.tasks, ids);
      if (!remove.size) {
        set({ error: "Chọn công việc cần xóa." });
        return false;
      }
      const ok = state.commit((project) => {
        project.tasks = project.tasks.filter((task) => !remove.has(task.id));
        project.dependencies = project.dependencies.filter(
          (link) =>
            !remove.has(link.predecessorId) && !remove.has(link.successorId),
        );
      }, `Đã xóa ${remove.size} công việc; nhấn Ctrl+Z để hoàn tác`);
      if (ok) set({ selected: [] });
      return ok;
    },
    indent: (outdent) => {
      const id = get().selected.at(-1);
      if (!id) {
        set({ error: "Chọn công việc cần đổi cấp WBS." });
        return;
      }
      get().commit(
        (project) => {
          const task = project.tasks.find((task) => task.id === id)!;
          if (outdent) {
            if (!task.parentId) throw new Error("Công việc đã ở cấp cao nhất.");
            const parent = project.tasks.find(
              (item) => item.id === task.parentId,
            )!;
            task.parentId = parent.parentId;
            const branchIds = new Set([task.id]);
            let changed = true;
            while (changed) {
              changed = false;
              for (const t of project.tasks)
                if (
                  t.parentId &&
                  branchIds.has(t.parentId) &&
                  !branchIds.has(t.id)
                ) {
                  branchIds.add(t.id);
                  changed = true;
                }
            }
            const branch = project.tasks.filter((t) => branchIds.has(t.id));
            project.tasks = project.tasks.filter((t) => !branchIds.has(t.id));
            const parentIds = new Set([parent.id]);
            changed = true;
            while (changed) {
              changed = false;
              for (const t of project.tasks)
                if (
                  t.parentId &&
                  parentIds.has(t.parentId) &&
                  !parentIds.has(t.id)
                ) {
                  parentIds.add(t.id);
                  changed = true;
                }
            }
            let end = project.tasks.indexOf(parent) + 1;
            project.tasks.forEach((t, i) => {
              if (parentIds.has(t.id)) end = Math.max(end, i + 1);
            });
            project.tasks.splice(end, 0, ...branch);
          } else {
            const siblings = project.tasks.filter(
                (item) => item.parentId === task.parentId,
              ),
              index = siblings.findIndex((item) => item.id === id);
            if (index === 0)
              throw new Error(
                "Cần một công việc phía trước cùng cấp để làm cha.",
              );
            const parent = siblings[index - 1];
            if (
              parent.assignments.length ||
              project.dependencies.some(
                (link) =>
                  link.predecessorId === parent.id ||
                  link.successorId === parent.id,
              )
            )
              throw new Error(
                "Cha mới đang có nguồn lực hoặc liên kết. Gỡ chúng trước khi chuyển thành Summary.",
              );
            task.parentId = parent.id;
          }
        },
        outdent ? "Đã nhô lề WBS" : "Đã thụt lề WBS",
      );
    },
    link: (link) =>
      get().commit((project) => {
        project.dependencies.push({ ...link, id: crypto.randomUUID() });
      }, "Đã tạo liên kết và tính lại lịch"),
    unlink: (id) => {
      get().commit((project) => {
        project.dependencies = project.dependencies.filter(
          (link) => link.id !== id,
        );
      }, "Đã gỡ liên kết");
    },
    captureBaseline: () => {
      const state = get(),
        baseline: Baseline = {
          id: crypto.randomUUID(),
          name: `Baseline ${state.project.baselines?.length ?? 0}`,
          calendar: structuredClone(state.project.calendar),
          createdAt: new Date().toISOString(),
          tasks: state.result.tasks.map((task) => ({
            id: task.id,
            isSummary: task.isSummary,
            progressWeight: task.progressWeight,
            budgetCost: task.budgetCost,
            startDate: task.startDate,
            endDate: task.endDate,
            startAt: task.startAt,
            finishAt: task.finishAt,
            duration: task.duration,
            physicalPct: task.physicalPct,
            workHours: task.workHours,
          })),
        };
      get().commit((project) => {
        project.baselines = [...(project.baselines ?? []), baseline];
        project.activeBaselineId = baseline.id;
      }, "Đã lưu thêm baseline bất biến");
    },
    selectBaseline: (id) => {
      get().commit((project) => {
        if (!project.baselines?.some((b) => b.id === id))
          throw new Error("Baseline không tồn tại");
        project.activeBaselineId = id;
      }, "Đã chọn baseline đối chiếu");
    },
    undo: () => {
      const state = get(),
        previous = state.history.at(-1);
      if (!previous) return;
      set({
        ...previous,
        result: scheduleProject(previous.project),
        selected: [],
        history: state.history.slice(0, -1),
        future: [
          { project: state.project, baseline: state.baseline },
          ...state.future,
        ],
        notice: "Đã hoàn tác",
        error: "",
        revision: state.revision + 1,
      });
    },
    redo: () => {
      const state = get(),
        next = state.future[0];
      if (!next) return;
      set({
        ...next,
        result: scheduleProject(next.project),
        selected: [],
        history: [
          ...state.history.slice(-(HISTORY_LIMIT - 1)),
          { project: state.project, baseline: state.baseline },
        ],
        future: state.future.slice(1),
        notice: "Đã làm lại",
        error: "",
        revision: state.revision + 1,
      });
    },
    replace: (project, baseline = null) => {
      try {
        if (baseline) {
          if (
            !Array.isArray(baseline.tasks) ||
            typeof baseline.name !== "string"
          )
            throw new Error("Baseline không hợp lệ.");
          for (const task of baseline.tasks) {
            parseDate(task.startDate);
            parseDate(task.endDate);
            if (
              !Number.isFinite(task.duration) ||
              task.duration < 0 ||
              typeof task.startAt !== "string" ||
              typeof task.finishAt !== "string"
            )
              throw new Error("Dữ liệu công việc baseline không hợp lệ.");
          }
        }
        const state = get();
        const next = structuredClone({
          ...state.project,
          ...project,
          id: state.project.id,
        });
        next.baselines = project.baselines ?? (baseline ? [baseline] : []);
        next.activeBaselineId = project.activeBaselineId ?? baseline?.id;
        next.progressHistory = project.progressHistory ?? [];
        normalizeExecution(next);
        validateExtensions(next);
        const result = scheduleProject(next);
        // Import replaces the contents of this workspace project atomically.
        set({
          project: next,
          result,
          baseline:
            next.baselines.find((b) => b.id === next.activeBaselineId) ?? null,
          selected: [],
          collapsed: new Set(),
          history: [
            ...state.history.slice(-(HISTORY_LIMIT - 1)),
            { project: state.project, baseline: state.baseline },
          ],
          future: [],
          revision: state.revision + 1,
          notice: "Đã nạp dự án",
          error: "",
        });
        return true;
      } catch (error) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Dữ liệu nhập không hợp lệ.",
        });
        return false;
      }
    },
    loadLarge: () => get().replace(createLargeProject()),
    reset: () => get().replace(createSeed()),
  };
}
