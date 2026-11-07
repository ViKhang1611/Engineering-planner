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
  WorkspaceConflictError,
  type RemoteChanges,
  type WorkspaceRepository,
} from "../infrastructure/persistence/workspaceRepository";

export type SyncChoice = "theirs" | "mine";

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
  /**
   * Copies a project (tasks, links, resources, baselines, progress history)
   * under a new id, inserted right after the source, and opens it.
   * Attachments are shared: stored files are immutable.
   */
  duplicateProject: (id: string) => string | null;
  /** Removes a project permanently. The last project cannot be removed. */
  deleteProject: (id: string) => boolean;
  updateSettings: (id: string, input: ProjectSettingsInput) => boolean;
  /** Saves pending changes now (cancels the debounce). */
  retryPersistence: () => void;
  /** Saves pending changes now and resolves when the write has settled. */
  flushPersistence: () => Promise<void>;
  restoreWorkspace: (raw: unknown) => boolean;
  clearActionError: () => void;
  /** One-line notice after projects were updated from another tab. */
  syncNotice: string;
  clearSyncNotice: () => void;
  /**
   * Set when another tab saved projects this tab is also editing. Saves are
   * paused until the user picks whose version to keep.
   */
  syncConflict: { projectNames: string[] } | null;
  resolveSyncConflict: (choice: SyncChoice) => Promise<void>;
  /** Pulls and merges what other tabs saved (also runs automatically). */
  syncFromOtherTabs: () => Promise<void>;
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

export interface WorkspaceStoreOptions {
  /**
   * Debounce for disk writes. 0 writes synchronously on every change (tests).
   * Writes are never deferred longer than SAVE_MAX_WAIT_MS while edits continue.
   */
  saveDelayMs?: number;
  /** Flush on tab hide/close and warn before closing with unsaved edits. */
  pageLifecycle?: boolean;
}
export const SAVE_DELAY_MS = 400;
export const SAVE_MAX_WAIT_MS = 2000;

export function createWorkspaceStore(
  repository: WorkspaceRepository,
  { saveDelayMs = 0, pageLifecycle = false }: WorkspaceStoreOptions = {},
) {
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
  // Persistence bookkeeping. `dirtyAll` forces a full write (first save, or a
  // failed full write); otherwise only `dirty` projects are rewritten.
  let dirtyAll = repository.needsFullWrite?.() ?? true;
  const dirty = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingSince = 0;
  let flush: () => Promise<void> = () => Promise.resolve();
  let sync: (choice?: SyncChoice) => Promise<void> = () => Promise.resolve();
  let makeSession!: (snapshot: ProjectSnapshot) => ScheduleSession;
  /** True while remote projects are applied: not local edits, nothing to save. */
  let applyingRemote = false;
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
    makeSession = session;
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
      duplicateProject: (id) => {
        const source = get().projects[id];
        if (!source || !Object.hasOwn(get().projects, id)) {
          set({ actionError: "Dự án không tồn tại trong workspace này." });
          return null;
        }
        const copyId = crypto.randomUUID();
        const project = structuredClone(source.project);
        project.id = copyId;
        project.name = `${source.project.name} (bản sao)`.slice(0, 200);
        const record = session({ project, baseline: null });
        set((state) => {
          const order = [...state.projectOrder];
          order.splice(order.indexOf(id) + 1, 0, copyId);
          return {
            projects: { ...state.projects, [copyId]: record },
            projectOrder: order,
            activeProjectId: copyId,
            actionError: "",
          };
        });
        return copyId;
      },
      deleteProject: (id) => {
        const state = get();
        if (!Object.hasOwn(state.projects, id)) {
          set({ actionError: "Dự án không tồn tại trong workspace này." });
          return false;
        }
        if (state.projectOrder.length <= 1) {
          set({
            actionError:
              "Không thể xóa dự án cuối cùng. Tạo hoặc nhập dự án khác trước.",
          });
          return false;
        }
        const index = state.projectOrder.indexOf(id);
        const order = state.projectOrder.filter((item) => item !== id);
        const projects = { ...state.projects };
        delete projects[id];
        set({
          projects,
          projectOrder: order,
          activeProjectId:
            state.activeProjectId === id
              ? order[Math.min(index, order.length - 1)]
              : state.activeProjectId,
          actionError: "",
        });
        return true;
      },
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
        void flush();
      },
      flushPersistence: () => flush(),
      syncNotice: "",
      clearSyncNotice: () => set({ syncNotice: "" }),
      syncConflict: null,
      resolveSyncConflict: (choice) => sync(choice),
      syncFromOtherTabs: () => sync(),
    };
  });
  // A scheduled timer also covers meta-only changes (view, sidebar, order).
  const hasPending = () => timer !== null || dirtyAll || dirty.size > 0;
  const message = (error: unknown) =>
    error instanceof Error ? error.message : "Không lưu được dữ liệu";
  function schedule() {
    if (saveDelayMs <= 0) {
      void flush();
      return;
    }
    // "Đang lưu…" covers the debounce window too, so the UI never claims a
    // change is on disk before it is.
    if (!store.getState().saving) store.setState({ saving: true });
    const now = Date.now();
    if (timer === null) pendingSince = now;
    else clearTimeout(timer);
    const wait = Math.min(saveDelayMs, pendingSince + SAVE_MAX_WAIT_MS - now);
    timer = setTimeout(() => void flush(), Math.max(0, wait));
  }
  flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const { persistenceBlocked, syncConflict } = store.getState();
    // While a cross-tab conflict is open, edits stay dirty and unsaved.
    if (persistenceBlocked || syncConflict) return Promise.resolve();
    const full = dirtyAll;
    const ids = new Set(dirty);
    dirtyAll = false;
    dirty.clear();
    const sequence = ++saveSequence;
    const failed = (error: unknown) => {
      // Keep the unsaved projects dirty so the next save includes them.
      if (full) dirtyAll = true;
      else ids.forEach((id) => dirty.add(id));
      if (error instanceof WorkspaceConflictError && repository.pull) {
        // Another tab saved first: merge its projects, then save again.
        void sync();
        return;
      }
      if (sequence === saveSequence)
        store.setState({ persistenceError: message(error), saving: false });
    };
    const succeeded = () => {
      if (sequence !== saveSequence) return;
      // Newer edits are waiting on the timer; that save reports the status.
      if (timer !== null) return;
      // An earlier write may have failed after this one was queued.
      if (dirtyAll || dirty.size > 0) schedule();
      else store.setState({ persistenceError: "", saving: false });
    };
    if (!store.getState().saving) store.setState({ saving: true });
    try {
      const result = repository.save(
        workspaceDocument(store.getState()),
        full ? undefined : ids,
      );
      if (result instanceof Promise) return result.then(succeeded, failed);
      succeeded();
    } catch (error) {
      failed(error);
    }
    return Promise.resolve();
  };
  /**
   * Merges what other tabs saved, project by project. Projects only the other
   * tab touched are replaced (undo history for them restarts). Projects both
   * tabs edited need a choice: without one, saving pauses and the conflict is
   * shown; "theirs" drops local edits to them, "mine" keeps them and the next
   * save overwrites the other tab's version. This tab's active project and
   * view never follow the other tab.
   */
  function apply(changes: RemoteChanges, keep: ReadonlySet<string>) {
    const state = store.getState();
    const projects = { ...state.projects };
    let updated = 0;
    for (const item of changes.projects) {
      const id = item.project.id;
      if (keep.has(id)) continue;
      const previous = projects[id];
      const next = makeSession(item);
      projects[id] = previous
        ? {
            ...next,
            selected: previous.selected,
            collapsed: previous.collapsed,
          }
        : next;
      updated++;
    }
    let removed = 0;
    for (const id of changes.removedIds)
      if (!keep.has(id) && Object.hasOwn(projects, id)) {
        delete projects[id];
        dirty.delete(id);
        removed++;
      }
    const remote = new Set(changes.projectOrder);
    const order = [
      ...changes.projectOrder.filter((id) => Object.hasOwn(projects, id)),
      // Projects created here and not saved yet, or kept over a removal.
      ...state.projectOrder.filter(
        (id) => Object.hasOwn(projects, id) && !remote.has(id),
      ),
    ];
    const sameOrder =
      order.length === state.projectOrder.length &&
      order.every((id, i) => id === state.projectOrder[i]);
    const parts = [
      updated && `cập nhật ${updated} dự án`,
      removed && `gỡ ${removed} dự án`,
    ].filter(Boolean);
    applyingRemote = true;
    try {
      store.setState({
        projects,
        projectOrder: sameOrder ? state.projectOrder : order,
        activeProjectId: Object.hasOwn(projects, state.activeProjectId)
          ? state.activeProjectId
          : order[0],
        syncConflict: null,
        syncNotice: parts.length
          ? `Đã ${parts.join(" và ")} từ tab khác.`
          : state.syncNotice,
      });
    } finally {
      applyingRemote = false;
    }
  }
  async function syncOnce(choice?: SyncChoice) {
    const changes = await repository.pull!();
    const state = store.getState();
    if (!changes) {
      if (state.syncConflict) store.setState({ syncConflict: null });
      if (dirtyAll || dirty.size > 0) schedule();
      return;
    }
    if (dirtyAll) {
      dirtyAll = false;
      state.projectOrder.forEach((id) => dirty.add(id));
    }
    const remote = [
      ...changes.projects.map((item) => item.project.id),
      ...changes.removedIds,
    ];
    const overlap = new Set(
      remote.filter((id) => dirty.has(id) && Object.hasOwn(state.projects, id)),
    );
    if (overlap.size && !choice) {
      store.setState({
        syncConflict: {
          projectNames: [...overlap].map(
            (id) => state.projects[id].project.name,
          ),
        },
      });
      return;
    }
    if (choice === "theirs") overlap.forEach((id) => dirty.delete(id));
    apply(changes, choice === "mine" ? overlap : new Set());
    changes.accept();
    if (dirty.size > 0) schedule();
    else if (state.saving && timer === null)
      store.setState({ saving: false, persistenceError: "" });
  }
  let syncChain: Promise<void> = Promise.resolve();
  sync = (choice) => {
    if (!repository.pull || store.getState().persistenceBlocked)
      return Promise.resolve();
    // Serialized: overlapping triggers (broadcast, focus, conflict) each pull
    // in turn; later ones usually find nothing new.
    syncChain = syncChain.then(() =>
      syncOnce(choice).catch((error) => {
        store.setState({
          persistenceError: `Không đồng bộ được với tab khác: ${message(error)}`,
        });
      }),
    );
    return syncChain;
  };
  store.subscribe((state, previous) => {
    if (state.persistenceBlocked || applyingRemote) return;
    // Selection, hover and undo stacks never trigger disk writes.
    let changed =
      state.activeProjectId !== previous.activeProjectId ||
      state.view !== previous.view ||
      state.sidebarCollapsed !== previous.sidebarCollapsed ||
      state.projectOrder !== previous.projectOrder;
    for (const id of state.projectOrder)
      if (
        state.projects[id].project !== previous.projects[id]?.project ||
        state.projects[id].baseline !== previous.projects[id]?.baseline
      ) {
        dirty.add(id);
        changed = true;
      }
    if (changed) schedule();
  });
  // Write at start-up only for migrations / first run; data loaded from the
  // current layout is normalized again on every load, so it stays valid.
  if (!loadError && dirtyAll) void flush();
  repository.subscribe?.(() => void sync());
  if (
    pageLifecycle &&
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function"
  ) {
    // Write immediately when the tab may be discarded; IndexedDB usually
    // completes a small transaction before the page is torn down.
    window.addEventListener("pagehide", () => void flush());
    window.document.addEventListener("visibilitychange", () => {
      if (window.document.visibilityState === "hidden") void flush();
      // Catch up on saves whose broadcast this tab may have missed.
      else void sync();
    });
    window.addEventListener("beforeunload", (event) => {
      if (!hasPending()) return;
      void flush();
      if (store.getState().persistenceError) {
        // Edits exist that the last attempt could not save: ask first.
        event.preventDefault();
        event.returnValue = "";
      }
    });
  }
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

export const workspaceStore = createWorkspaceStore(browserRepository(), {
  saveDelayMs: SAVE_DELAY_MS,
  pageLifecycle: true,
});
export function useWorkspaceStore<T>(
  selector: (state: WorkspaceState) => T,
): T {
  return useStore(workspaceStore, selector);
}
