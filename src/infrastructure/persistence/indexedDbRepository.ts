import type { WorkspaceDocument } from "../../domain/workspace";
import { LocalStorageWorkspaceRepository } from "./workspaceRepository";
let database: IDBDatabase | null = null;
let initial: unknown = null;
let loadFailure: Error | null = null;
let revision = 0;
let queue: Promise<void> = Promise.resolve();
export let persistenceMode = "localStorage";
export async function initializePersistence() {
  if (!("indexedDB" in window)) return;
  try {
    database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("forgeplan-enterprise", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("workspace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Đóng tab ForgePlan cũ để nâng cấp dữ liệu"));
    });
    database.onversionchange = () => database?.close();
    const record = await new Promise<
      { revision: number; document: WorkspaceDocument } | undefined
    >((resolve, reject) => {
      const request = database!
        .transaction("workspace")
        .objectStore("workspace")
        .get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    initial =
      record?.document ??
      new LocalStorageWorkspaceRepository(window.localStorage).load();
    revision = record?.revision ?? 0;
    persistenceMode = "IndexedDB";
  } catch (e) {
    loadFailure = e instanceof Error ? e : new Error("Không mở được IndexedDB");
  }
}
export function loadIndexedWorkspace() {
  if (loadFailure) throw loadFailure;
  return initial;
}
export function hasIndexedDatabase() {
  return !!database || !!loadFailure;
}
export function saveIndexedWorkspace(
  document: WorkspaceDocument,
): Promise<void> {
  const snapshot = structuredClone(document);
  const operation = queue
    .catch(() => {})
    .then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (!database) {
            reject(new Error("IndexedDB chưa sẵn sàng"));
            return;
          }
          const tx = database.transaction("workspace", "readwrite"),
            store = tx.objectStore("workspace"),
            read = store.get("current");
          let conflict = false;
          read.onsuccess = () => {
            if ((read.result?.revision ?? 0) !== revision) {
              conflict = true;
              tx.abort();
              return;
            }
            store.put(
              { revision: revision + 1, document: snapshot },
              "current",
            );
          };
          tx.oncomplete = () => {
            revision++;
            resolve();
          };
          tx.onabort = () =>
            reject(
              new Error(
                conflict
                  ? "Dữ liệu đã đổi ở tab khác. Xuất JSON phiên này rồi tải lại để tránh ghi đè."
                  : (tx.error?.message ?? "Không lưu được dữ liệu"),
              ),
            );
          tx.onerror = () => {};
        }),
    );
  queue = operation;
  return operation;
}
export function flushPersistence() {
  return queue;
}
