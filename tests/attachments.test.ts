import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createSeed } from "../src/modules/schedule/data/seed";
import { validateExtensions } from "../src/domain/execution";
import type { WorkspaceDocument } from "../src/domain/workspace";
import type { ProjectInput } from "../src/domain/project";

const text = "Biên bản FAT – tủ điện MCC-01";
const dataUrl = `data:text/plain;base64,${Buffer.from(text).toString("base64")}`;
const size = Buffer.byteLength(text);

function projectWithAttachment(data?: string): ProjectInput {
  const project = createSeed();
  project.tasks.find(
    (t) => !project.tasks.some((c) => c.parentId === t.id),
  )!.attachments = [
    { id: "att-1", name: "fat.txt", type: "text/plain", size, data },
  ];
  return project;
}

function documentOf(project: ProjectInput): WorkspaceDocument {
  return {
    schemaVersion: 2,
    activeProjectId: project.id,
    view: "schedule",
    sidebarCollapsed: false,
    projects: [{ project, baseline: null }],
  };
}

/** Fresh fake IndexedDB plus fresh module instances, seeded via legacy localStorage. */
async function boot(
  seed: WorkspaceDocument | null,
  factory = new IDBFactory(),
) {
  vi.resetModules();
  vi.stubGlobal("indexedDB", factory);
  vi.stubGlobal("window", {
    indexedDB: factory,
    localStorage: {
      getItem: (key: string) =>
        key === "forgeplan.workspace.v2" && seed ? JSON.stringify(seed) : null,
    },
  });
  const repo = await import(
    "../src/infrastructure/persistence/indexedDbRepository"
  );
  const store = await import(
    "../src/infrastructure/persistence/attachmentStore"
  );
  await repo.initializePersistence();
  return { repo, store, factory };
}

const firstAttachment = (doc: WorkspaceDocument) =>
  doc.projects[0].project.tasks.flatMap((t) => t.attachments ?? [])[0];

afterEach(() => vi.unstubAllGlobals());

describe("attachment store", () => {
  it("migrates inline base64 files out of the workspace document", async () => {
    const { repo, store } = await boot(
      documentOf(projectWithAttachment(dataUrl)),
    );
    const loaded = repo.loadIndexedWorkspace() as WorkspaceDocument;
    const meta = firstAttachment(loaded);
    expect(meta).toEqual({
      id: "att-1",
      name: "fat.txt",
      type: "text/plain",
      size,
    });
    expect(JSON.stringify(loaded)).not.toContain("base64");
    const blob = await store.getAttachmentBlob("att-1");
    expect(await blob!.text()).toBe(text);
    expect(await (await store.resolveAttachment(meta))!.text()).toBe(text);
  });

  it("keeps malformed or size-mismatched inline data for validation to reject", async () => {
    const project = projectWithAttachment(dataUrl);
    project.tasks.flatMap((t) => t.attachments ?? [])[0].size = size + 1;
    const { repo, store } = await boot(documentOf(project));
    const meta = firstAttachment(
      repo.loadIndexedWorkspace() as WorkspaceDocument,
    );
    expect(meta.data).toBe(dataUrl);
    expect(await store.getAttachmentBlob("att-1")).toBeUndefined();
  });

  it("inlines stored files for portable exports and reports missing ones", async () => {
    const { repo, store } = await boot(
      documentOf(projectWithAttachment(dataUrl)),
    );
    const project = (repo.loadIndexedWorkspace() as WorkspaceDocument)
      .projects[0].project;
    const exported = await store.inlineAttachments(project);
    expect(exported.missing).toEqual([]);
    expect(
      exported.project.tasks.flatMap((t) => t.attachments ?? [])[0].data,
    ).toBe(dataUrl);
    // The live project stays metadata-only.
    expect(project.tasks.flatMap((t) => t.attachments ?? [])[0].data).toBe(
      undefined,
    );

    const orphan = structuredClone(project);
    orphan.tasks.flatMap((t) => t.attachments ?? [])[0].id = "gone";
    const partial = await store.inlineAttachments(orphan);
    expect(partial.missing).toEqual(["fat.txt"]);
  });

  it("round-trips an import: externalize then inline restores the same bytes", async () => {
    const { store } = await boot(null);
    const imported = projectWithAttachment(dataUrl);
    const stored = await store.externalizeAttachments(imported);
    expect(stored.tasks.flatMap((t) => t.attachments ?? [])[0].data).toBe(
      undefined,
    );
    expect(imported.tasks.flatMap((t) => t.attachments ?? [])[0].data).toBe(
      dataUrl,
    );
    expect((await store.inlineAttachments(stored)).project).toEqual(imported);
  });

  it("garbage-collects only old, unreferenced files", async () => {
    const { store } = await boot(null);
    await store.putAttachments([
      { id: "kept", blob: new Blob(["a"]) },
      { id: "orphan", blob: new Blob(["b"]) },
    ]);
    const day = 24 * 60 * 60 * 1000;
    expect(
      await store.deleteUnreferencedAttachments(new Set(["kept"]), day),
    ).toBe(0);
    expect(
      await store.deleteUnreferencedAttachments(
        new Set(["kept"]),
        day,
        Date.now() + day,
      ),
    ).toBe(1);
    expect(await store.getAttachmentBlob("kept")).toBeDefined();
    expect(await store.getAttachmentBlob("orphan")).toBeUndefined();
  });

  it("upgrades a v1 database and keeps the saved workspace", async () => {
    const factory = new IDBFactory();
    const legacy = documentOf(projectWithAttachment(dataUrl));
    await new Promise<void>((resolve, reject) => {
      const open = factory.open("forgeplan-enterprise", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("workspace");
      open.onsuccess = () => {
        const tx = open.result.transaction("workspace", "readwrite");
        tx.objectStore("workspace").put(
          { revision: 3, document: legacy },
          "current",
        );
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
      };
      open.onerror = () => reject(open.error);
    });
    const { repo, store } = await boot(null, factory);
    const loaded = repo.loadIndexedWorkspace() as WorkspaceDocument;
    expect(firstAttachment(loaded).data).toBeUndefined();
    expect(await (await store.getAttachmentBlob("att-1"))!.text()).toBe(text);
    // Revision is preserved, so the first save is not treated as a conflict.
    await expect(repo.saveIndexedWorkspace(loaded)).resolves.toBeUndefined();
  });
});

describe("attachment validation", () => {
  it("accepts metadata-only attachments and enforces limits on declared size", () => {
    expect(() => validateExtensions(projectWithAttachment())).not.toThrow();
    const big = projectWithAttachment();
    big.tasks.flatMap((t) => t.attachments ?? [])[0].size = 6 * 1024 * 1024;
    expect(() => validateExtensions(big)).toThrow("5 MB");
    const mismatch = projectWithAttachment(dataUrl);
    mismatch.tasks.flatMap((t) => t.attachments ?? [])[0].size = 1;
    expect(() => validateExtensions(mismatch)).toThrow();
  });
});
