import type { Attachment, ProjectInput } from "../../domain/project";

/**
 * Binary attachments live in their own IndexedDB object store, keyed by
 * attachment id. Projects only carry metadata, so commits, undo snapshots and
 * workspace saves never copy file contents. Attachments are immutable: an id
 * always maps to the same bytes, so several projects (or undo snapshots) may
 * safely share one record.
 */
export const ATTACHMENT_STORE = "attachments";
/** Orphans younger than this are kept so another tab's unsaved upload survives. */
export const ATTACHMENT_GC_MIN_AGE_MS = 24 * 60 * 60 * 1000;

interface AttachmentRecord {
  bytes: ArrayBuffer;
  type: string;
  createdAt: number;
}

let database: IDBDatabase | null = null;

export function bindAttachmentDatabase(db: IDBDatabase | null) {
  database = db;
}

/** False in the localStorage fallback: uploads then stay inline as data URLs. */
export function attachmentsPersistent() {
  return database !== null;
}

function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function requireDatabase() {
  if (!database) throw new Error("Kho tài liệu IndexedDB chưa sẵn sàng");
  return database;
}

export async function putAttachments(
  entries: { id: string; blob: Blob }[],
): Promise<void> {
  if (!entries.length) return;
  const records = await Promise.all(
    entries.map(async ({ id, blob }) => ({
      id,
      record: {
        bytes: await blob.arrayBuffer(),
        type: blob.type,
        createdAt: Date.now(),
      } satisfies AttachmentRecord,
    })),
  );
  const tx = requireDatabase().transaction(ATTACHMENT_STORE, "readwrite");
  const store = tx.objectStore(ATTACHMENT_STORE);
  for (const { id, record } of records) store.put(record, id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error ?? new Error("Không lưu được tài liệu đính kèm"));
  });
}

export async function getAttachmentBlob(id: string): Promise<Blob | undefined> {
  if (!database) return undefined;
  const record = (await request(
    database.transaction(ATTACHMENT_STORE).objectStore(ATTACHMENT_STORE).get(id),
  )) as AttachmentRecord | undefined;
  return record ? new Blob([record.bytes], { type: record.type }) : undefined;
}

/** Returns the bytes of an attachment, whether inline (legacy/fallback) or stored. */
export async function resolveAttachment(
  attachment: Attachment,
): Promise<Blob | undefined> {
  if (attachment.data) {
    const blob = dataUrlToBlob(attachment.data);
    return blob ?? undefined;
  }
  return getAttachmentBlob(attachment.id);
}

/** Deletes stored files no project references any more. Returns the count removed. */
export async function deleteUnreferencedAttachments(
  referenced: Set<string>,
  minAgeMs = ATTACHMENT_GC_MIN_AGE_MS,
  now = Date.now(),
): Promise<number> {
  if (!database) return 0;
  const tx = database.transaction(ATTACHMENT_STORE, "readwrite");
  const store = tx.objectStore(ATTACHMENT_STORE);
  let removed = 0;
  await new Promise<void>((resolve, reject) => {
    const cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const record = cursor.value as AttachmentRecord;
      if (
        !referenced.has(String(cursor.key)) &&
        now - (record.createdAt ?? 0) >= minAgeMs
      ) {
        cursor.delete();
        removed++;
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error ?? new Error("Không dọn được tài liệu cũ"));
  });
  return removed;
}

const DATA_URL = /^data:([^,]*?)(;base64)?,([A-Za-z0-9+/]*={0,2})$/;

/** Decodes a base64 data URL; null when malformed. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = DATA_URL.exec(dataUrl);
  if (!match || !match[2] || match[3].length % 4 !== 0) return null;
  let binary: string;
  try {
    binary = atob(match[3]);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

export async function blobToDataUrl(blob: Blob, type = blob.type) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}

type ProjectLike = Pick<ProjectInput, "tasks">;

function forEachAttachment(
  project: unknown,
  visit: (attachment: Attachment) => void,
) {
  const tasks = (project as ProjectLike | null)?.tasks;
  if (!Array.isArray(tasks)) return;
  for (const task of tasks)
    if (task && Array.isArray(task.attachments))
      for (const attachment of task.attachments)
        if (attachment && typeof attachment === "object") visit(attachment);
}

function documentProjects(document: unknown): unknown[] {
  const projects = (document as { projects?: unknown } | null)?.projects;
  return Array.isArray(projects)
    ? projects.map((item) => (item as { project?: unknown } | null)?.project)
    : [];
}

/** Every attachment id referenced by a workspace document (defensive on raw input). */
export function referencedAttachmentIds(document: unknown): Set<string> {
  const ids = new Set<string>();
  for (const project of documentProjects(document))
    forEachAttachment(project, (a) => {
      if (typeof a.id === "string") ids.add(a.id);
    });
  return ids;
}

/**
 * Moves inline data URLs into the attachment store and returns a copy without
 * `data`. Entries that are malformed or whose size does not match are left
 * inline so validation still rejects them. No-op without IndexedDB.
 */
export async function externalizeAttachments<T>(project: T): Promise<T> {
  if (!database) return project;
  const copy = structuredClone(project);
  const pending: { attachment: Attachment; blob: Blob }[] = [];
  forEachAttachment(copy, (attachment) => {
    if (typeof attachment.data !== "string" || typeof attachment.id !== "string")
      return;
    const blob = dataUrlToBlob(attachment.data);
    if (blob && blob.size === attachment.size)
      pending.push({ attachment, blob });
  });
  if (!pending.length) return project;
  await putAttachments(
    pending.map(({ attachment, blob }) => ({ id: attachment.id, blob })),
  );
  for (const { attachment } of pending) delete attachment.data;
  return copy;
}

export async function externalizeDocument<T>(document: T): Promise<T> {
  if (!database) return document;
  const projects = (document as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(projects)) return document;
  const next = await Promise.all(
    projects.map(async (item) =>
      item && typeof item === "object" && "project" in item
        ? { ...item, project: await externalizeAttachments(item.project) }
        : item,
    ),
  );
  return { ...document, projects: next };
}

/**
 * Returns a copy whose attachments carry inline data URLs, for portable
 * JSON/CSV/XLSX exports. Files missing from this device keep metadata only and
 * are reported by name.
 */
export async function inlineAttachments<T>(
  project: T,
): Promise<{ project: T; missing: string[] }> {
  const copy = structuredClone(project);
  const targets: Attachment[] = [];
  forEachAttachment(copy, (attachment) => {
    if (!attachment.data) targets.push(attachment);
  });
  const missing: string[] = [];
  await Promise.all(
    targets.map(async (attachment) => {
      const blob = await getAttachmentBlob(attachment.id);
      if (blob) attachment.data = await blobToDataUrl(blob, attachment.type);
      else missing.push(attachment.name);
    }),
  );
  return { project: copy, missing };
}

export async function inlineDocument<T>(
  document: T,
): Promise<{ document: T; missing: string[] }> {
  const projects = (document as { projects?: unknown } | null)?.projects;
  if (!Array.isArray(projects)) return { document, missing: [] };
  const missing: string[] = [];
  const next = await Promise.all(
    projects.map(async (item) => {
      const result = await inlineAttachments(item.project);
      missing.push(...result.missing);
      return { ...item, project: result.project };
    }),
  );
  return { document: { ...document, projects: next }, missing };
}

export function missingAttachmentsMessage(missing: string[]) {
  return missing.length
    ? `Đã xuất, nhưng ${missing.length} tệp đính kèm không còn trên thiết bị nên chỉ giữ tên: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`
    : "";
}
