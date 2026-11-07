import type {
  ProjectSnapshot,
  WorkspaceDocument,
} from "../../domain/workspace";
import { LocalStorageWorkspaceRepository } from "./workspaceRepository";
import {
  ATTACHMENT_STORE,
  bindAttachmentDatabase,
  deleteUnreferencedAttachments,
  externalizeDocument,
  referencedAttachmentIds,
} from "./attachmentStore";
import { WorkspaceConflictError, type RemoteChanges } from "./types";

/**
 * Schema history:
 * - v1: `workspace/current` = { revision, document } (whole workspace).
 * - v2: + `attachments` store; file bytes split out of the document.
 * - v3: + `projects` store, one record per project; `workspace/meta` holds the
 *   revision and workspace-level fields. A save writes meta plus only the
 *   projects that changed, in one transaction. `current` is read once for
 *   migration and deleted by the first v3 save.
 * - v4: project records carry `rev` (the revision that wrote them), indexed,
 *   so a tab can read exactly the projects other tabs changed since its own
 *   revision.
 */
const DATABASE_VERSION = 4;
const WORKSPACE_STORE = "workspace";
const PROJECT_STORE = "projects";
const REV_INDEX = "rev";
const META_KEY = "meta";
const LEGACY_KEY = "current";
const CHANNEL_NAME = "forgeplan-workspace";

export interface WorkspaceMeta {
  schemaVersion: 2;
  revision: number;
  activeProjectId: string;
  view: WorkspaceDocument["view"];
  sidebarCollapsed: boolean;
  projectOrder: string[];
}
type ProjectRecord = ProjectSnapshot & { rev?: number };

let database: IDBDatabase | null = null;
let channel: BroadcastChannel | null = null;
let initial: unknown = null;
let loadFailure: Error | null = null;
let revision = 0;
/** Set when disk does not hold every project as a v3 record yet. */
let fullWritePending = false;
/** Project ids that have a record on disk, so removals need no extra read. */
let persistedIds = new Set<string>();
let queue: Promise<unknown> = Promise.resolve();
let inFlight = 0;
export let persistenceMode = "localStorage";

function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const snapshot = ({ project, baseline }: ProjectRecord): ProjectSnapshot => ({
  project,
  baseline,
});

export async function initializePersistence() {
  if (!("indexedDB" in window)) return;
  try {
    database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("forgeplan-enterprise", DATABASE_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        for (const name of [WORKSPACE_STORE, ATTACHMENT_STORE, PROJECT_STORE])
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        const projects = open.transaction!.objectStore(PROJECT_STORE);
        if (!projects.indexNames.contains(REV_INDEX))
          projects.createIndex(REV_INDEX, "rev");
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () =>
        reject(new Error("Đóng tab ForgePlan cũ để nâng cấp dữ liệu"));
    });
    database.onversionchange = () => database?.close();
    const tx = database.transaction([WORKSPACE_STORE, PROJECT_STORE]);
    const meta = (await request(
      tx.objectStore(WORKSPACE_STORE).get(META_KEY),
    )) as WorkspaceMeta | undefined;
    if (meta) {
      const records = (await request(
        tx.objectStore(PROJECT_STORE).getAll(),
      )) as ProjectRecord[];
      initial = assemble(meta, records);
      revision = meta.revision;
      persistedIds = new Set(records.map((r) => r.project?.id));
    } else {
      const legacy = (await request(
        tx.objectStore(WORKSPACE_STORE).get(LEGACY_KEY),
      )) as { revision: number; document: WorkspaceDocument } | undefined;
      initial =
        legacy?.document ??
        new LocalStorageWorkspaceRepository(window.localStorage).load();
      revision = legacy?.revision ?? 0;
      fullWritePending = true;
    }
    persistenceMode = "IndexedDB";
    bindAttachmentDatabase(database);
    if (typeof BroadcastChannel !== "undefined")
      channel = new BroadcastChannel(CHANNEL_NAME);
  } catch (e) {
    loadFailure = e instanceof Error ? e : new Error("Không mở được IndexedDB");
    return;
  }
  await migrateAttachments();
}

/** Rebuilds the document in saved order. Missing projects surface as validation errors. */
function assemble(
  meta: WorkspaceMeta,
  records: ProjectRecord[],
): WorkspaceDocument {
  const byId = new Map(records.map((r) => [r.project?.id, r]));
  return {
    schemaVersion: 2,
    activeProjectId: meta.activeProjectId,
    view: meta.view,
    sidebarCollapsed: meta.sidebarCollapsed,
    projects: meta.projectOrder.flatMap((id) => {
      const record = byId.get(id);
      return record ? [snapshot(record)] : [];
    }),
  };
}

/**
 * Moves legacy inline (base64) attachments into the attachment store, then
 * removes stored files no saved project references. The stripped document is
 * written by the workspace store's first save. Any failure keeps the inline
 * copy, so no file is lost.
 */
async function migrateAttachments() {
  try {
    const before = initial;
    initial = await externalizeDocument(initial);
    if (initial !== before) fullWritePending = true;
  } catch (e) {
    console.warn("Chưa chuyển được tài liệu đính kèm sang kho riêng", e);
  }
  try {
    await deleteUnreferencedAttachments(referencedAttachmentIds(initial));
  } catch (e) {
    console.warn("Chưa dọn được tài liệu đính kèm không dùng", e);
  }
}
export function loadIndexedWorkspace() {
  if (loadFailure) throw loadFailure;
  return initial;
}
/** True until every project is on disk in the current layout (migration, fresh start). */
export function indexedNeedsFullWrite() {
  return fullWritePending;
}
export function hasIndexedDatabase() {
  return !!database || !!loadFailure;
}

/**
 * Runs IndexedDB work in order. When nothing is in flight the work starts
 * synchronously, so a save from `pagehide` issues its requests immediately.
 */
function enqueue<T>(run: () => Promise<T>): Promise<T> {
  inFlight++;
  const start = inFlight === 1 ? run() : queue.catch(() => {}).then(run);
  const operation = start.finally(() => {
    inFlight--;
  });
  queue = operation;
  return operation;
}

/**
 * Writes workspace meta plus the projects in `dirty` (all projects when
 * omitted or when the v3 layout is not complete on disk yet). Project records
 * that are no longer in the workspace are deleted. Revision mismatch with disk
 * means another tab saved first: the transaction aborts and rolls back, and
 * the promise rejects with WorkspaceConflictError.
 *
 * Every request is issued up front, with the revision check running in the
 * read's callback (abort rolls back the queued writes). A save started from
 * `pagehide`/`beforeunload` thus does not wait for a read before issuing its
 * writes.
 *
 * Project snapshots are treated as immutable (every commit replaces the
 * object), so they are handed to IndexedDB, which clones on put, without an
 * extra deep copy here.
 */
export function saveIndexedWorkspace(
  document: WorkspaceDocument,
  dirty?: ReadonlySet<string>,
): Promise<void> {
  const meta: Omit<WorkspaceMeta, "revision"> = {
    schemaVersion: 2,
    activeProjectId: document.activeProjectId,
    view: document.view,
    sidebarCollapsed: document.sidebarCollapsed,
    projectOrder: document.projects.map((item) => item.project.id),
  };
  const projects = document.projects;
  return enqueue(
    () =>
      new Promise<void>((resolve, reject) => {
        if (!database) {
          reject(new Error("IndexedDB chưa sẵn sàng"));
          return;
        }
        const full = !dirty || fullWritePending;
        const base = revision;
        const next = base + 1;
        const tx = database.transaction(
            [WORKSPACE_STORE, PROJECT_STORE],
            "readwrite",
          ),
          workspace = tx.objectStore(WORKSPACE_STORE),
          projectStore = tx.objectStore(PROJECT_STORE);
        let conflict = false;
        // Reads first: requests run in order, so they see the pre-write state.
        const readMeta = workspace.get(META_KEY);
        const readLegacy = workspace.get(LEGACY_KEY);
        readLegacy.onsuccess = () => {
          // Not migrated yet: the v1/v2 record carries the revision.
          const onDisk =
            (readMeta.result as WorkspaceMeta | undefined)?.revision ??
            readLegacy.result?.revision ??
            0;
          if (onDisk !== base) {
            conflict = true;
            tx.abort();
          }
        };
        workspace.put({ ...meta, revision: next }, META_KEY);
        const written = new Set(persistedIds);
        for (const item of projects)
          if (full || dirty!.has(item.project.id)) {
            projectStore.put(
              {
                project: item.project,
                baseline: item.baseline,
                rev: next,
              } satisfies ProjectRecord,
              item.project.id,
            );
            written.add(item.project.id);
          }
        const keep = new Set(meta.projectOrder);
        for (const id of written)
          if (!keep.has(id)) {
            projectStore.delete(id);
            written.delete(id);
          }
        if (full) workspace.delete(LEGACY_KEY);
        tx.oncomplete = () => {
          revision = next;
          persistedIds = written;
          if (full) fullWritePending = false;
          channel?.postMessage({ type: "saved", revision: next });
          resolve();
        };
        tx.onabort = () =>
          reject(
            conflict
              ? new WorkspaceConflictError()
              : new Error(tx.error?.message ?? "Không lưu được dữ liệu"),
          );
        tx.onerror = () => {};
        // No explicit tx.commit(): it would put the transaction in "committing"
        // state, where the conflict abort above is no longer allowed. With every
        // request already queued, auto-commit follows the last one.
      }),
  );
}

/**
 * Reads what other tabs saved after this tab's revision: changed projects via
 * the `rev` index, removals by comparing the saved order with what this tab
 * last knew to be on disk. Resolves null when disk is at our revision.
 */
export function pullIndexedWorkspace(): Promise<RemoteChanges | null> {
  return enqueue(
    () =>
      new Promise<RemoteChanges | null>((resolve, reject) => {
        if (!database) {
          resolve(null);
          return;
        }
        const base = revision;
        const tx = database.transaction([WORKSPACE_STORE, PROJECT_STORE]);
        const readMeta = tx.objectStore(WORKSPACE_STORE).get(META_KEY);
        let result: RemoteChanges | null = null;
        readMeta.onsuccess = () => {
          const meta = readMeta.result as WorkspaceMeta | undefined;
          if (!meta || meta.revision === base) return;
          const changed = tx
            .objectStore(PROJECT_STORE)
            .index(REV_INDEX)
            .getAll(IDBKeyRange.lowerBound(base, true));
          changed.onsuccess = () => {
            const order = new Set(meta.projectOrder);
            result = {
              revision: meta.revision,
              projectOrder: meta.projectOrder,
              projects: (changed.result as ProjectRecord[])
                .filter((r) => order.has(r.project.id))
                .map(snapshot),
              removedIds: [...persistedIds].filter((id) => !order.has(id)),
              accept: () => {
                // Valid only if no save of ours landed in between.
                if (revision !== base) return;
                revision = meta.revision;
                persistedIds = new Set(meta.projectOrder);
                fullWritePending = false;
              },
            };
          };
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () =>
          reject(tx.error ?? new Error("Không đọc được dữ liệu từ tab khác"));
      }),
  );
}

/** Notifies `listener` when another tab saved. Returns an unsubscribe function. */
export function subscribeIndexedWorkspace(listener: () => void) {
  if (!channel) return () => {};
  const target = channel;
  const handle = (event: MessageEvent) => {
    if (event.data?.type === "saved") listener();
  };
  target.addEventListener("message", handle);
  return () => target.removeEventListener("message", handle);
}

export function flushPersistence() {
  return queue.then(
    () => {},
    () => {},
  );
}

/** Test helper: releases the database and channel of this module instance. */
export function closePersistence() {
  channel?.close();
  channel = null;
  database?.close();
  database = null;
}
