import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { createSeed } from "../src/modules/schedule/data/seed";
import type { WorkspaceDocument } from "../src/domain/workspace";

/** Open tabs, closed after each test (typed loosely to avoid a cycle with openTab). */
const tabs: { repo: { closePersistence(): void } }[] = [];

function seedDocument(): WorkspaceDocument {
  const projects = ["Dự án A", "Dự án B"].map((name, i) => {
    const project = createSeed();
    project.id = `p${i + 1}`;
    project.name = name;
    return { project, baseline: null };
  });
  return {
    schemaVersion: 2,
    activeProjectId: "p1",
    view: "schedule",
    sidebarCollapsed: false,
    projects,
  };
}

/**
 * One "browser tab": its own module graph (repository state, BroadcastChannel)
 * over the shared fake IndexedDB, with a store wired to the real adapter.
 */
async function openTab(factory: IDBFactory, seed: WorkspaceDocument | null) {
  vi.resetModules();
  vi.stubGlobal("indexedDB", factory);
  vi.stubGlobal("IDBKeyRange", IDBKeyRange);
  vi.stubGlobal("window", {
    indexedDB: factory,
    localStorage: {
      getItem: (key: string) =>
        key === "forgeplan.workspace.v2" && seed ? JSON.stringify(seed) : null,
    },
  });
  const { createWorkspaceStore } = await import("../src/store/workspaceStore");
  const repo = await import(
    "../src/infrastructure/persistence/indexedDbRepository"
  );
  await repo.initializePersistence();
  const store = createWorkspaceStore(
    {
      load: repo.loadIndexedWorkspace,
      save: repo.saveIndexedWorkspace,
      needsFullWrite: repo.indexedNeedsFullWrite,
      pull: repo.pullIndexedWorkspace,
      subscribe: repo.subscribeIndexedWorkspace,
    },
    { saveDelayMs: 0 },
  );
  await repo.flushPersistence();
  const tab = {
    store,
    repo,
    project: (id: string) => store.getState().projects[id],
    duration: (id: string, task = "drawing") =>
      store.getState().projects[id].project.tasks.find((t) => t.id === task)!
        .duration,
    settle: async () => {
      await store.getState().syncFromOtherTabs();
      await repo.flushPersistence();
    },
  };
  tabs.push(tab);
  return tab;
}

async function twoTabs() {
  const factory = new IDBFactory();
  const a = await openTab(factory, seedDocument());
  const b = await openTab(factory, null);
  return { a, b, factory };
}

/** Loads what is on disk through a fresh tab. */
async function disk(factory: IDBFactory) {
  const reader = await openTab(factory, null);
  return reader;
}

afterEach(() => {
  while (tabs.length) tabs.pop()!.repo.closePersistence();
  vi.unstubAllGlobals();
});

describe("cross-tab sync", () => {
  it("opening a tab writes nothing, so other tabs are not disturbed", async () => {
    const { a } = await twoTabs();
    await a.settle();
    expect(a.store.getState().syncNotice).toBe("");
  });

  it("applies another tab's save via BroadcastChannel without reloading", async () => {
    const { a, b } = await twoTabs();
    b.store.getState().switchProject("p2");
    await b.repo.flushPersistence();
    a.project("p1").updateTask("drawing", { duration: 9 });
    await vi.waitFor(() => expect(b.duration("p1")).toBe(9));
    expect(b.store.getState().syncNotice).toContain("cập nhật 1 dự án");
    // B keeps its own navigation; A's active project does not leak over.
    expect(b.store.getState().activeProjectId).toBe("p2");
    expect(b.store.getState().persistenceError).toBe("");
  });

  it("merges concurrent edits to different projects without a prompt", async () => {
    const { a, b, factory } = await twoTabs();
    // Same tick: B's save is queued behind A's and hits a revision conflict.
    a.project("p1").updateTask("drawing", { duration: 7 });
    b.project("p2").updateTask("drawing", { duration: 8 });
    await vi.waitFor(async () => {
      await b.settle();
      expect(b.store.getState().syncConflict).toBeNull();
      expect(b.duration("p1")).toBe(7);
    });
    await vi.waitFor(() => expect(a.duration("p2")).toBe(8));
    const reader = await disk(factory);
    expect(reader.duration("p1")).toBe(7);
    expect(reader.duration("p2")).toBe(8);
    expect(b.store.getState().persistenceError).toBe("");
  });

  it("pauses saving on a same-project conflict until the user keeps their version", async () => {
    const { a, b, factory } = await twoTabs();
    a.project("p1").updateTask("drawing", { duration: 5 });
    b.project("p1").updateTask("drawing", { duration: 6 });
    await vi.waitFor(() =>
      expect(b.store.getState().syncConflict?.projectNames).toEqual([
        "Dự án A",
      ]),
    );
    // While paused, B's further edits stay local.
    b.project("p1").updateTask("survey", { duration: 3 });
    expect((await disk(factory)).duration("p1")).toBe(5);

    await b.store.getState().resolveSyncConflict("mine");
    await b.repo.flushPersistence();
    expect(b.store.getState().syncConflict).toBeNull();
    const reader = await disk(factory);
    expect(reader.duration("p1")).toBe(6);
    expect(reader.duration("p1", "survey")).toBe(3);
    await vi.waitFor(() => expect(a.duration("p1")).toBe(6));
  });

  it("'use theirs' discards local edits to the conflicting project only", async () => {
    const { a, b, factory } = await twoTabs();
    a.project("p1").updateTask("drawing", { duration: 5 });
    b.project("p1").updateTask("drawing", { duration: 6 });
    await vi.waitFor(() =>
      expect(b.store.getState().syncConflict).not.toBeNull(),
    );
    b.project("p2").updateTask("drawing", { duration: 4 });
    await b.store.getState().resolveSyncConflict("theirs");
    await b.repo.flushPersistence();
    expect(b.duration("p1")).toBe(5);
    const reader = await disk(factory);
    expect(reader.duration("p1")).toBe(5);
    expect(reader.duration("p2")).toBe(4);
  });

  it("drops projects another tab removed and keeps the active one valid", async () => {
    const { a, b } = await twoTabs();
    b.store.getState().switchProject("p2");
    const doc = structuredClone(seedDocument());
    doc.projects = [doc.projects[0]];
    expect(a.store.getState().restoreWorkspace(doc)).toBe(true);
    await vi.waitFor(() =>
      expect(b.store.getState().projectOrder).toEqual(["p1"]),
    );
    expect(b.store.getState().activeProjectId).toBe("p1");
    expect(b.store.getState().syncNotice).toContain("gỡ 1 dự án");
  });
});
