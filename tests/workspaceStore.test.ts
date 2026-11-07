import { describe, it, expect } from "vitest";
import {
  createWorkspaceStore,
  workspaceDocument,
} from "../src/store/workspaceStore";
import { projectSummary } from "../src/store/selectors";
import {
  LocalStorageWorkspaceRepository,
  WORKSPACE_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
} from "../src/infrastructure/persistence/workspaceRepository";
import { createSeed } from "../src/modules/schedule/data/seed";
import type { ProjectSettingsInput } from "../src/domain/workspace";

class MemoryStorage {
  values = new Map<string, string>();
  writes = 0;
  fail = false;
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error("QuotaExceededError");
    this.writes++;
    this.values.set(key, value);
  }
}
const settings: ProjectSettingsInput = {
  name: "Dự án tủ PLC",
  contractCode: "PLC-2026-02",
  client: "Nhà máy B",
  startDate: "2026-10-19",
  statusDate: "2026-10-20",
  holidays: [],
};
function setup() {
  const storage = new MemoryStorage();
  const repository = new LocalStorageWorkspaceRepository(storage);
  const store = createWorkspaceStore(repository);
  const active = () =>
    store.getState().projects[store.getState().activeProjectId];
  return { storage, repository, store, active };
}

describe("Phase 1 workspace and scoped schedule sessions", () => {
  it("preserves tasks, dependencies and baseline when migrating the legacy snapshot", () => {
    const storage = new MemoryStorage();
    const legacy = {
      project: createSeed(),
      baseline: {
        id: "b0",
        name: "Baseline 0",
        createdAt: "2026-10-01",
        tasks: [],
      },
    };
    const raw = JSON.stringify(legacy);
    storage.setItem(LEGACY_STORAGE_KEY, raw);
    const store = createWorkspaceStore(
      new LocalStorageWorkspaceRepository(storage),
    );
    const active = store.getState().projects[legacy.project.id];
    expect(active.project).toMatchObject(legacy.project);
    expect(active.baseline).toEqual(legacy.baseline);
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe(raw);
    expect(
      JSON.parse(storage.getItem(WORKSPACE_STORAGE_KEY)!).schemaVersion,
    ).toBe(2);
  });
  it("isolates project edits, selection, baseline and undo history", () => {
    const { store, active } = setup();
    const firstId = store.getState().activeProjectId;
    active().captureBaseline();
    active().select("drawing");
    active().updateTask("drawing", { duration: 7 });
    const secondId = store.getState().createProject(settings)!;
    expect(secondId).not.toBe(firstId);
    expect(active().project.tasks).toEqual([]);
    expect(active().history).toEqual([]);
    active().addTask();
    active().captureBaseline();
    store.getState().switchProject(firstId);
    expect(active().selected).toEqual(["drawing"]);
    expect(
      active().project.tasks.find((t) => t.id === "drawing")!.duration,
    ).toBe(7);
    active().undo();
    expect(
      active().project.tasks.find((t) => t.id === "drawing")!.duration,
    ).toBe(4);
    store.getState().switchProject(secondId);
    expect(active().project.tasks).toHaveLength(1);
    expect(active().baseline!.tasks).toHaveLength(1);
  });
  it("updates derived portfolio values from the same task mutation", () => {
    const { active } = setup();
    const before = projectSummary(active()).physicalPct;
    active().updateTask("plc", { physicalPct: 100 });
    expect(projectSummary(active()).physicalPct).toBeGreaterThan(before);
    expect(active().result.tasks.find((t) => t.id === "plc")!.physicalPct).toBe(
      100,
    );
  });
  it("keeps result unchanged after invalid dependency and does not save invalid data", () => {
    const { active, storage } = setup();
    const before = active().result;
    const writes = storage.writes;
    expect(
      active().link({
        predecessorId: "drawing",
        successorId: "survey",
        type: "FS",
        lagDays: 0,
      }),
    ).toBe(false);
    expect(active().result).toBe(before);
    expect(storage.writes).toBe(writes);
  });
  it("recalculates holiday changes without changing the baseline", () => {
    const { store, active } = setup();
    active().captureBaseline();
    const baseline = structuredClone(active().baseline);
    const start = active().result.tasks.find(
      (t) => t.id === "survey",
    )!.startDate;
    const p = active().project;
    expect(
      store.getState().updateSettings(p.id, {
        ...settings,
        name: p.name,
        startDate: p.startDate,
        statusDate: p.statusDate,
        holidays: ["2026-10-05", "2026-10-05"],
      }),
    ).toBe(true);
    expect(active().project.calendar.holidays).toEqual(["2026-10-05"]);
    expect(
      active().result.tasks.find((t) => t.id === "survey")!.startDate,
    ).not.toBe(start);
    expect(active().baseline).toEqual(baseline);
    active().undo();
    expect(active().project.calendar.holidays).toEqual([]);
  });
  it("rejects invalid settings atomically", () => {
    const { store, active } = setup();
    const before = active().project;
    expect(
      store
        .getState()
        .updateSettings(before.id, { ...settings, holidays: ["2026-02-30"] }),
    ).toBe(false);
    expect(active().project).toBe(before);
    expect(
      store.getState().createProject({ ...settings, name: "  " }),
    ).toBeNull();
    expect(store.getState().projectOrder).toHaveLength(1);
  });
  it("persists multiple projects, active route and metadata across a reload", () => {
    const { store, repository, active } = setup();
    const id = store.getState().createProject(settings)!;
    active().addTask();
    store.getState().navigate("settings");
    store.getState().toggleSidebar();
    const restored = createWorkspaceStore(repository).getState();
    expect(restored.activeProjectId).toBe(id);
    expect(restored.view).toBe("settings");
    expect(restored.projectOrder).toHaveLength(2);
    expect(restored.projects[id].project.contractCode).toBe(
      settings.contractCode,
    );
    expect(restored.projects[id].project.tasks).toHaveLength(1);
    expect(restored.projects[id].result.tasks).toHaveLength(1);
  });
  it("does not persist ephemeral row selection or expand/collapse changes", () => {
    const { active, storage } = setup();
    const before = storage.writes;
    active().select("drawing");
    active().toggle("p1");
    active().setError("test");
    expect(storage.writes).toBe(before);
  });
  it("never overwrites an unreadable saved workspace with seed data", () => {
    const storage = new MemoryStorage();
    storage.setItem(WORKSPACE_STORAGE_KEY, "broken json");
    const store = createWorkspaceStore(
      new LocalStorageWorkspaceRepository(storage),
    );
    expect(store.getState().persistenceBlocked).toBe(true);
    store.getState().projects[store.getState().activeProjectId].addTask();
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).toBe("broken json");
  });
  it("reports quota errors, keeps in-memory edits and allows a retry", () => {
    const { store, storage, active, repository } = setup();
    storage.fail = true;
    active().updateTask("drawing", { name: "Bản vẽ đã sửa" });
    expect(store.getState().persistenceError).not.toBe("");
    expect(active().project.tasks.find((t) => t.id === "drawing")!.name).toBe(
      "Bản vẽ đã sửa",
    );
    storage.fail = false;
    store.getState().retryPersistence();
    expect(store.getState().persistenceError).toBe("");
    expect(
      createWorkspaceStore(repository)
        .getState()
        .projects[store.getState().activeProjectId].project.tasks.find(
          (t) => t.id === "drawing",
        )!.name,
    ).toBe("Bản vẽ đã sửa");
  });
  it("imports a snapshot atomically without changing workspace identity or other projects", () => {
    const { store, active, storage } = setup();
    const original = store.getState().activeProjectId;
    const other = store.getState().createProject(settings)!;
    store.getState().switchProject(original);
    const imported = createSeed();
    imported.id = other;
    imported.name = "Imported";
    const writes = storage.writes;
    active().replace(imported);
    expect(storage.writes).toBe(writes + 1);
    expect(active().project.id).toBe(original);
    expect(store.getState().projects[other].project.name).toBe(settings.name);
    active().undo();
    expect(active().project.name).not.toBe("Imported");
  });
  it("ignores unknown and inherited project keys", () => {
    const { store } = setup();
    const id = store.getState().activeProjectId;
    store.getState().switchProject("toString");
    expect(store.getState().activeProjectId).toBe(id);
    store.getState().switchProject("missing");
    expect(store.getState().activeProjectId).toBe(id);
    expect(workspaceDocument(store.getState()).projects).toHaveLength(1);
  });
});

describe("project duplicate and delete", () => {
  it("duplicates a project with a new id, after the source, keeping baselines", () => {
    const { store, active, repository } = setup();
    const sourceId = store.getState().activeProjectId;
    active().captureBaseline();
    active().updateTask("drawing", { duration: 6 });
    const other = store.getState().createProject(settings)!;
    const copyId = store.getState().duplicateProject(sourceId)!;
    expect(copyId).not.toBe(sourceId);
    expect(store.getState().projectOrder).toEqual([sourceId, copyId, other]);
    expect(store.getState().activeProjectId).toBe(copyId);
    const copy = active();
    expect(copy.project.name).toMatch(/\(bản sao\)$/);
    expect(copy.project.baselines).toHaveLength(1);
    expect(copy.project.tasks.find((t) => t.id === "drawing")!.duration).toBe(
      6,
    );
    // Editing the copy leaves the source untouched.
    copy.updateTask("drawing", { duration: 2 });
    const source = store.getState().projects[sourceId];
    expect(source.project.tasks.find((t) => t.id === "drawing")!.duration).toBe(
      6,
    );
    const reloaded = createWorkspaceStore(repository).getState();
    expect(reloaded.projectOrder).toEqual([sourceId, copyId, other]);
  });

  it("deletes a project, picks a neighbour as active and refuses the last one", () => {
    const { store, repository } = setup();
    const first = store.getState().activeProjectId;
    const second = store.getState().createProject(settings)!;
    expect(store.getState().deleteProject(second)).toBe(true);
    expect(store.getState().projectOrder).toEqual([first]);
    expect(store.getState().activeProjectId).toBe(first);
    expect(createWorkspaceStore(repository).getState().projectOrder).toEqual([
      first,
    ]);
    expect(store.getState().deleteProject(first)).toBe(false);
    expect(store.getState().actionError).toContain("cuối cùng");
    expect(store.getState().projectOrder).toEqual([first]);
  });
});
