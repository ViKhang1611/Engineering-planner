import {
  hasIndexedDatabase,
  indexedNeedsFullWrite,
  loadIndexedWorkspace,
  pullIndexedWorkspace,
  saveIndexedWorkspace,
  subscribeIndexedWorkspace,
} from "./indexedDbRepository";
import type { WorkspaceDocument } from "../../domain/workspace";
import type { RemoteChanges } from "./types";
export { WorkspaceConflictError, type RemoteChanges } from "./types";

export const WORKSPACE_STORAGE_KEY = "forgeplan.workspace.v2";
export const LEGACY_STORAGE_KEY = "forgeplan.project.v1";

/** Storage port: synchronous fallback and transactional IndexedDB adapter. */
export interface WorkspaceRepository {
  load(): unknown | null;
  /**
   * `dirty` lists the project ids whose content changed since the last
   * successful save; omitted means "write everything". Adapters that cannot
   * write partially (localStorage) ignore it.
   */
  save(
    document: WorkspaceDocument,
    dirty?: ReadonlySet<string>,
  ): void | Promise<void>;
  /**
   * Whether the loaded data must be written back in full at start-up
   * (migration or nothing saved yet). Default: true. When false, opening a tab
   * writes nothing, so other tabs are not made to reload.
   */
  needsFullWrite?(): boolean;
  /** Reads what other tabs saved since our revision (multi-tab adapters only). */
  pull?(): Promise<RemoteChanges | null>;
  /** Calls `listener` when another tab saved. Returns an unsubscribe function. */
  subscribe?(listener: () => void): () => void;
}

export class LocalStorageWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem">) {}
  load(): unknown | null {
    const workspace = this.storage.getItem(WORKSPACE_STORAGE_KEY);
    if (workspace !== null) return JSON.parse(workspace);
    const legacy = this.storage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === null) return null;
    const snapshot = JSON.parse(legacy);
    // Keep the original key as a recovery copy; never overwrite it.
    return {
      schemaVersion: 2,
      activeProjectId: snapshot.project?.id,
      view: "schedule",
      sidebarCollapsed: false,
      projects: [snapshot],
    };
  }
  save(document: WorkspaceDocument): void {
    this.storage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(document));
  }
}

export function browserRepository(): WorkspaceRepository {
  // Access to localStorage itself can fail in a restricted browser.
  return {
    load: () =>
      hasIndexedDatabase()
        ? loadIndexedWorkspace()
        : new LocalStorageWorkspaceRepository(window.localStorage).load(),
    needsFullWrite: () =>
      hasIndexedDatabase() ? indexedNeedsFullWrite() : true,
    pull: () =>
      hasIndexedDatabase() ? pullIndexedWorkspace() : Promise.resolve(null),
    subscribe: (listener) =>
      hasIndexedDatabase() ? subscribeIndexedWorkspace(listener) : () => {},
    save: (document, dirty) =>
      hasIndexedDatabase()
        ? saveIndexedWorkspace(document, dirty)
        : new LocalStorageWorkspaceRepository(window.localStorage).save(
            document,
          ),
  };
}
