import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createWorkspaceStore,
  SAVE_MAX_WAIT_MS,
} from "../src/store/workspaceStore";
import type { WorkspaceRepository } from "../src/infrastructure/persistence/workspaceRepository";
import type {
  ProjectSettingsInput,
  WorkspaceDocument,
} from "../src/domain/workspace";
import { createSeed } from "../src/modules/schedule/data/seed";

const settings: ProjectSettingsInput = {
  name: "Dự án tủ PLC",
  contractCode: "PLC-2026-02",
  client: "Nhà máy B",
  startDate: "2026-10-19",
  statusDate: "2026-10-20",
  holidays: [],
};

class RecordingRepository implements WorkspaceRepository {
  saved: { document: WorkspaceDocument; dirty?: string[] }[] = [];
  stored: WorkspaceDocument | null = null;
  failNext = 0;
  load() {
    return this.stored ? structuredClone(this.stored) : null;
  }
  save(document: WorkspaceDocument, dirty?: ReadonlySet<string>) {
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.reject(new Error("QuotaExceededError"));
    }
    this.saved.push({ document, dirty: dirty && [...dirty].sort() });
    this.stored = structuredClone(document);
    return Promise.resolve();
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("debounced workspace saves", () => {
  async function setup() {
    vi.useFakeTimers();
    const repository = new RecordingRepository();
    const store = createWorkspaceStore(repository, { saveDelayMs: 400 });
    await vi.runAllTimersAsync(); // initial full write
    const active = () =>
      store.getState().projects[store.getState().activeProjectId];
    return { repository, store, active };
  }

  it("writes everything once at start-up, then coalesces a burst of edits", async () => {
    const { repository, store, active } = await setup();
    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0].dirty).toBeUndefined();
    active().updateTask("drawing", { duration: 5 });
    active().updateTask("drawing", { duration: 6 });
    active().updateTask("drawing", { name: "Bản vẽ" });
    expect(store.getState().saving).toBe(true);
    expect(repository.saved).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(repository.saved).toHaveLength(2);
    expect(repository.saved[1].dirty).toEqual([
      store.getState().activeProjectId,
    ]);
    expect(store.getState().saving).toBe(false);
    expect(
      repository.stored!.projects[0].project.tasks.find(
        (t) => t.id === "drawing",
      )!.name,
    ).toBe("Bản vẽ");
  });

  it("never defers a write longer than the max wait during continuous edits", async () => {
    const { repository, active } = await setup();
    for (let elapsed = 0; elapsed < SAVE_MAX_WAIT_MS + 300; elapsed += 300) {
      active().updateTask("drawing", { duration: 2 + (elapsed % 3) });
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(repository.saved.length).toBeGreaterThan(1);
  });

  it("rewrites only the edited project; navigation writes meta only", async () => {
    const { repository, store, active } = await setup();
    const first = store.getState().activeProjectId;
    const second = store.getState().createProject(settings)!;
    await vi.advanceTimersByTimeAsync(400);
    expect(repository.saved.at(-1)!.dirty).toEqual([second]);
    store.getState().switchProject(first);
    store.getState().navigate("dashboard");
    await vi.advanceTimersByTimeAsync(400);
    expect(repository.saved.at(-1)!.dirty).toEqual([]);
    expect(repository.saved.at(-1)!.document.view).toBe("dashboard");
    active().addTask();
    await vi.advanceTimersByTimeAsync(400);
    expect(repository.saved.at(-1)!.dirty).toEqual([first]);
  });

  it("keeps failed projects dirty so the next save includes them", async () => {
    const { repository, store, active } = await setup();
    const first = store.getState().activeProjectId;
    repository.failNext = 1;
    active().updateTask("drawing", { duration: 9 });
    await vi.advanceTimersByTimeAsync(400);
    expect(store.getState().persistenceError).toContain("Quota");
    const second = store.getState().createProject(settings)!;
    await vi.advanceTimersByTimeAsync(400);
    expect(repository.saved.at(-1)!.dirty).toEqual([first, second].sort());
    expect(store.getState().persistenceError).toBe("");
  });

  it("flushPersistence writes pending edits without waiting for the timer", async () => {
    const { repository, active, store } = await setup();
    active().updateTask("drawing", { duration: 3 });
    await store.getState().flushPersistence();
    expect(repository.saved).toHaveLength(2);
    expect(store.getState().saving).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(repository.saved).toHaveLength(2);
  });
});

describe("IndexedDB per-project records", () => {
  function documentOf(...names: string[]): WorkspaceDocument {
    const projects = names.map((name, i) => {
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

  async function boot(factory: IDBFactory, seed: WorkspaceDocument | null) {
    vi.resetModules();
    vi.stubGlobal("indexedDB", factory);
    vi.stubGlobal("window", {
      indexedDB: factory,
      localStorage: {
        getItem: (key: string) =>
          key === "forgeplan.workspace.v2" && seed
            ? JSON.stringify(seed)
            : null,
      },
    });
    const repo = await import(
      "../src/infrastructure/persistence/indexedDbRepository"
    );
    await repo.initializePersistence();
    return repo;
  }

  async function raw<T>(
    factory: IDBFactory,
    store: string,
    run: (s: IDBObjectStore) => IDBRequest<T> | void,
  ): Promise<T | undefined> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = factory.open("forgeplan-enterprise");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction(store, "readwrite");
    const req = run(tx.objectStore(store));
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
    return req ? req.result : undefined;
  }

  it("writes only dirty project records and deletes removed projects", async () => {
    const factory = new IDBFactory();
    const doc = documentOf("Một", "Hai", "Ba");
    const repo = await boot(factory, doc);
    await repo.saveIndexedWorkspace(doc);
    expect(await raw(factory, "projects", (s) => s.getAllKeys())).toEqual([
      "p1",
      "p2",
      "p3",
    ]);

    // A sentinel on disk proves p1 is not rewritten by a p2-only save.
    const p1 = (await raw(factory, "projects", (s) => s.get("p1"))) as {
      project: { name: string };
    };
    p1.project.name = "sentinel";
    await raw(factory, "projects", (s) => s.put(p1, "p1"));

    const next = structuredClone(doc);
    next.projects[1].project.name = "Hai (sửa)";
    next.projects.pop();
    await repo.saveIndexedWorkspace(next, new Set(["p2"]));

    const reloaded = await boot(factory, null);
    const loaded = reloaded.loadIndexedWorkspace() as WorkspaceDocument;
    expect(loaded.projects.map((p) => p.project.name)).toEqual([
      "sentinel",
      "Hai (sửa)",
    ]);
    expect(await raw(factory, "projects", (s) => s.getAllKeys())).toEqual([
      "p1",
      "p2",
    ]);
  });

  it("migrates a v2 single-document record and continues its revision", async () => {
    const factory = new IDBFactory();
    const legacy = documentOf("Cũ");
    await new Promise<void>((resolve, reject) => {
      const open = factory.open("forgeplan-enterprise", 2);
      open.onupgradeneeded = () => {
        open.result.createObjectStore("workspace");
        open.result.createObjectStore("attachments");
      };
      open.onsuccess = () => {
        const tx = open.result.transaction("workspace", "readwrite");
        tx.objectStore("workspace").put(
          { revision: 7, document: legacy },
          "current",
        );
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
      };
      open.onerror = () => reject(open.error);
    });
    const repo = await boot(factory, null);
    const loaded = repo.loadIndexedWorkspace() as WorkspaceDocument;
    expect(loaded.projects[0].project.name).toBe("Cũ");
    // Partial dirty set is upgraded to a full write until the layout is complete.
    await repo.saveIndexedWorkspace(loaded, new Set());
    expect(
      await raw(factory, "workspace", (s) => s.get("current")),
    ).toBeUndefined();
    expect(
      (
        (await raw(factory, "workspace", (s) => s.get("meta"))) as {
          revision: number;
        }
      ).revision,
    ).toBe(8);
    expect(await raw(factory, "projects", (s) => s.getAllKeys())).toEqual([
      "p1",
    ]);
  });
});

describe("status reporting", () => {
  it("keeps 'saving' while newer edits wait on the debounce", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const repository = new RecordingRepository();
    const store = createWorkspaceStore(repository, { saveDelayMs: 400 });
    await vi.runAllTimersAsync();
    const active = () =>
      store.getState().projects[store.getState().activeProjectId];
    const save = repository.save.bind(repository);
    repository.save = (doc, dirty) =>
      new Promise<void>((resolve) => {
        release = () => resolve(save(doc, dirty));
      });
    active().updateTask("drawing", { duration: 5 });
    await vi.advanceTimersByTimeAsync(400); // write #1 in flight
    active().updateTask("drawing", { duration: 6 }); // timer for write #2
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().saving).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    release();
    await vi.runAllTimersAsync();
    expect(store.getState().saving).toBe(false);
    expect(
      repository.stored!.projects[0].project.tasks.find(
        (t) => t.id === "drawing",
      )!.duration,
    ).toBe(6);
  });
});
