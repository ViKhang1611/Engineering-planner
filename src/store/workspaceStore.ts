import { validateExtensions } from "../domain/execution";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type {
  ProjectSettingsInput,
  WorkspaceDocument,
  WorkspaceView,
  ProjectSnapshot,
} from "../domain/workspace";
import { WORKSPACE_VIEWS } from "../domain/workspace";
import {
  createScheduleSession,
  type ScheduleSession,
} from "../modules/schedule/model/createScheduleSession";
import { createSeed } from "../modules/schedule/data/seed";
import {
  parseDate,
  scheduleProject,
} from "../modules/schedule/engine/schedulingEngine";
import {
  browserRepository,
  type WorkspaceRepository,
} from "../infrastructure/persistence/workspaceRepository";

export interface WorkspaceState {
  projects: Record<string, ScheduleSession>;
  projectOrder: string[];
  activeProjectId: string;
  view: WorkspaceView;
  sidebarCollapsed: boolean;
  persistenceError: string;
  saving: boolean;
  persistenceBlocked: boolean;
  actionError: string;
  navigate: (view: WorkspaceView) => void;
  switchProject: (id: string) => void;
  toggleSidebar: () => void;
  createProject: (input: ProjectSettingsInput) => string | null;
  updateSettings: (id: string, input: ProjectSettingsInput) => boolean;
  retryPersistence: () => void;
  restoreWorkspace: (raw: unknown) => boolean;
  clearActionError: () => void;
}

function validatedSettings(input: ProjectSettingsInput): ProjectSettingsInput {
  const name = input.name.trim();
  if (!name || name.length > 200)
    throw new Error("Tên dự án phải có từ 1 đến 200 ký tự.");
  if (input.contractCode.length > 80 || input.client.length > 200)
    throw new Error("Mã hợp đồng hoặc chủ đầu tư quá dài.");
  parseDate(input.startDate);
  parseDate(input.statusDate);
  input.holidays.forEach(parseDate);
  return {
    ...input,
    name,
    contractCode: input.contractCode.trim(),
    client: input.client.trim(),
    holidays: [...new Set(input.holidays)].sort(),
  };
}

function validateDocument(value: unknown): WorkspaceDocument {
  const data = value as WorkspaceDocument;
  if (
    !data ||
    data.schemaVersion !== 2 ||
    !Array.isArray(data.projects) ||
    !data.projects.length
  )
    throw new Error("Định dạng workspace không hợp lệ.");
  const ids = new Set<string>();
  for (const item of data.projects) {
    const p = item.project;
    if (!p || typeof p.id !== "string" || !p.id || ids.has(p.id))
      throw new Error("Mã dự án bị thiếu hoặc trùng.");
    ids.add(p.id);
    validatedSettings({
      name: p.name,
      contractCode: p.contractCode ?? "",
      client: p.client ?? "",
      startDate: p.startDate,
      statusDate: p.statusDate,
      holidays: p.calendar.holidays,
    });
    validateExtensions(p);
    scheduleProject(p);
    if (item.baseline != null) {
      if (
        !Array.isArray(item.baseline.tasks) ||
        typeof item.baseline.name !== "string"
      )
        throw new Error("Baseline không hợp lệ.");
      for (const task of item.baseline.tasks) {
        parseDate(task.startDate);
        parseDate(task.endDate);
        if (
          !Number.isFinite(task.duration) ||
          task.duration < 0 ||
          typeof task.startAt !== "string" ||
          typeof task.finishAt !== "string"
        )
          throw new Error("Chi tiết baseline không hợp lệ.");
      }
    }
  }
  if (!ids.has(data.activeProjectId))
    throw new Error("Dự án đang mở không tồn tại.");
  return {
    ...data,
    view: WORKSPACE_VIEWS.includes(data.view) ? data.view : "schedule",
    sidebarCollapsed: !!data.sidebarCollapsed,
  };
}

export function workspaceDocument(state: WorkspaceState): WorkspaceDocument {
  return {
    schemaVersion: 2,
    activeProjectId: state.activeProjectId,
    view: state.view,
    sidebarCollapsed: state.sidebarCollapsed,
    projects: state.projectOrder.map((id) => ({
      project: state.projects[id].project,
      baseline: state.projects[id].baseline,
    })),
  };
}

export function createWorkspaceStore(repository: WorkspaceRepository) {
  let document: WorkspaceDocument;
  let loadError = "";
  try {
    const raw = repository.load();
    document = raw === null ? defaultDocument() : validateDocument(raw);
  } catch (error) {
    document = defaultDocument();
    loadError = `Không đọc được dữ liệu đã lưu: ${error instanceof Error ? error.message : "Lỗi lưu trữ"}. Dữ liệu cũ được giữ nguyên; phiên tạm sẽ không ghi đè.`;
  }
  let saveSequence = 0;
  const store = createStore<WorkspaceState>()((set, get) => {
    function session(snapshot: ProjectSnapshot): ScheduleSession {
      const id = snapshot.project.id;
      return createScheduleSession(
        (patch) =>
          set((state) => {
            const previous = state.projects[id];
            return {
              projects: {
                ...state.projects,
                [id]: {
                  ...previous,
                  ...(typeof patch === "function" ? patch(previous) : patch),
                },
              },
            };
          }),
        () => get().projects[id],
        snapshot,
      );
    }
    return {
      projects: Object.fromEntries(
        document.projects.map((item) => [item.project.id, session(item)]),
      ),
      projectOrder: document.projects.map((item) => item.project.id),
      activeProjectId: document.activeProjectId,
      view: document.view,
      sidebarCollapsed: document.sidebarCollapsed,
      persistenceError: loadError,
      saving: false,
      persistenceBlocked: !!loadError,
      actionError: "",
      navigate: (view) => set({ view, actionError: "" }),
      switchProject: (id) => {
        if (Object.hasOwn(get().projects, id))
          set({ activeProjectId: id, actionError: "" });
        else set({ actionError: "Dự án không tồn tại trong workspace này." });
      },
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      clearActionError: () => set({ actionError: "" }),
      createProject: (input) => {
        try {
          const fields = validatedSettings(input);
          const id = crypto.randomUUID();
          const { holidays, ...metadata } = fields;
          const project = {
            ...metadata,
            id,
            calendar: { holidays },
            tasks: [],
            dependencies: [],
            resources: [],
          };
          const record = session({ project, baseline: null });
          set((state) => ({
            projects: { ...state.projects, [id]: record },
            projectOrder: [...state.projectOrder, id],
            activeProjectId: id,
            view: "schedule",
            actionError: "",
          }));
          return id;
        } catch (error) {
          set({
            actionError:
              error instanceof Error ? error.message : "Không tạo được dự án.",
          });
          return null;
        }
      },
      updateSettings: (id, input) => {
        try {
          const { holidays, ...metadata } = validatedSettings(input);
          const target = get().projects[id];
          if (!target) throw new Error("Dự án không tồn tại.");
          const ok = target.commit((project) => {
            Object.assign(project, metadata);
            project.calendar = { holidays };
          }, "Đã lưu thông tin dự án và tính lại lịch");
          set({ actionError: ok ? "" : get().projects[id].error });
          return ok;
        } catch (error) {
          set({
            actionError:
              error instanceof Error
                ? error.message
                : "Thông tin không hợp lệ.",
          });
          return false;
        }
      },
      restoreWorkspace: (raw) => {
        try {
          const next = validateDocument(raw);
          const projects = Object.fromEntries(
            next.projects.map((item) => [item.project.id, session(item)]),
          );
          set({
            projects,
            projectOrder: next.projects.map((item) => item.project.id),
            activeProjectId: next.activeProjectId,
            view: "data",
            sidebarCollapsed: next.sidebarCollapsed,
            actionError: "",
          });
          return true;
        } catch (error) {
          set({
            actionError:
              error instanceof Error ? error.message : "Bản sao không hợp lệ",
          });
          return false;
        }
      },
      retryPersistence: () => {
        if (get().persistenceBlocked) return;
        const sequence = ++saveSequence;
        set({ saving: true });
        try {
          const result = repository.save(workspaceDocument(get()));
          if (result instanceof Promise)
            result
              .then(() => {
                if (sequence === saveSequence)
                  set({ persistenceError: "", saving: false });
              })
              .catch((error) => {
                if (sequence === saveSequence)
                  set({ persistenceError: error.message, saving: false });
              });
          else set({ persistenceError: "", saving: false });
        } catch (error) {
          set({
            persistenceError:
              error instanceof Error ? error.message : "Không lưu được dữ liệu",
            saving: false,
          });
        }
      },
    };
  });
  store.subscribe((state, previous) => {
    if (state.persistenceBlocked) return;
    // Selection, hover and undo stacks never trigger disk writes.
    const changed =
      state.activeProjectId !== previous.activeProjectId ||
      state.view !== previous.view ||
      state.sidebarCollapsed !== previous.sidebarCollapsed ||
      state.projectOrder !== previous.projectOrder ||
      state.projectOrder.some(
        (id) =>
          state.projects[id].project !== previous.projects[id]?.project ||
          state.projects[id].baseline !== previous.projects[id]?.baseline,
      );
    if (changed) state.retryPersistence();
  });
  if (!loadError) store.getState().retryPersistence();
  return store;
}

function defaultDocument(): WorkspaceDocument {
  const project = createSeed();
  project.contractCode = "AUT-2026-01";
  project.client = "Nhà máy · Dự án minh họa";
  return {
    schemaVersion: 2,
    activeProjectId: project.id,
    view: "schedule",
    sidebarCollapsed: typeof window !== "undefined" && window.innerWidth < 1440,
    projects: [{ project, baseline: null }],
  };
}

export const workspaceStore = createWorkspaceStore(browserRepository());
export function useWorkspaceStore<T>(
  selector: (state: WorkspaceState) => T,
): T {
  return useStore(workspaceStore, selector);
}
