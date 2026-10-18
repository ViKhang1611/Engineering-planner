import {
  hasIndexedDatabase,
  loadIndexedWorkspace,
  saveIndexedWorkspace,
} from "./indexedDbRepository";
import type { WorkspaceDocument } from "../../domain/workspace";

export const WORKSPACE_STORAGE_KEY = "forgeplan.workspace.v2";
export const LEGACY_STORAGE_KEY = "forgeplan.project.v1";

/** Storage port: synchronous fallback and transactional IndexedDB adapter. */
export interface WorkspaceRepository {
  load(): unknown | null;
  save(document: WorkspaceDocument): void | Promise<void>;
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
    save: (document) =>
      hasIndexedDatabase()
        ? saveIndexedWorkspace(document)
        : new LocalStorageWorkspaceRepository(window.localStorage).save(
            document,
          ),
  };
}
