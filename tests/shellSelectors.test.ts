import { describe, expect, it } from "vitest";
import { createWorkspaceStore } from "../src/store/workspaceStore";
import {
  selectOpenCriticalCount,
  selectProjectNames,
} from "../src/store/shellSelectors";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => void values.set(k, v),
  };
};

describe("shell selectors", () => {
  it("counts open critical leaves and stays correct after a reschedule", async () => {
    const { LocalStorageWorkspaceRepository } = await import(
      "../src/infrastructure/persistence/workspaceRepository"
    );
    const store = createWorkspaceStore(
      new LocalStorageWorkspaceRepository(memory()),
    );
    const active = () =>
      store.getState().projects[store.getState().activeProjectId];
    const expected = () =>
      active().result.tasks.filter(
        (t) => !t.isSummary && t.isCritical && t.physicalPct < 100,
      ).length;
    const before = selectOpenCriticalCount(store.getState());
    expect(before).toBe(expected());
    expect(before).toBeGreaterThan(0);
    // Selection does not change the result, so the cached value is reused.
    active().select("drawing");
    expect(selectOpenCriticalCount(store.getState())).toBe(before);
    // Finishing a critical task produces a new result and a new count.
    const critical = active().result.tasks.find(
      (t) => !t.isSummary && t.isCritical && t.physicalPct < 100,
    )!;
    active().updateTask(critical.id, { physicalPct: 100 });
    expect(selectOpenCriticalCount(store.getState())).toBe(expected());
    expect(selectOpenCriticalCount(store.getState())).toBe(before - 1);
  });

  it("lists project names in workspace order", async () => {
    const { LocalStorageWorkspaceRepository } = await import(
      "../src/infrastructure/persistence/workspaceRepository"
    );
    const store = createWorkspaceStore(
      new LocalStorageWorkspaceRepository(memory()),
    );
    store.getState().createProject({
      name: "Dự án thứ hai",
      contractCode: "",
      client: "",
      startDate: "2026-10-19",
      statusDate: "2026-10-20",
      holidays: [],
    });
    const names = selectProjectNames(store.getState());
    expect(names).toHaveLength(2);
    expect(names[1]).toBe("Dự án thứ hai");
  });
});
