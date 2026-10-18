import { it, expect, vi } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { createSeed } from "../src/modules/schedule/data/seed";
import type { WorkspaceDocument } from "../src/domain/workspace";
it("migrates local data into IndexedDB and rejects stale-tab overwrites", async () => {
  vi.stubGlobal("indexedDB", indexedDB);
  const project = createSeed();
  const document: WorkspaceDocument = {
    schemaVersion: 2,
    activeProjectId: project.id,
    view: "schedule",
    sidebarCollapsed: false,
    projects: [{ project, baseline: null }],
  };
  vi.stubGlobal("window", {
    indexedDB,
    localStorage: {
      getItem: (key: string) =>
        key === "forgeplan.workspace.v2" ? JSON.stringify(document) : null,
    },
  });
  const first = await import(
    "../src/infrastructure/persistence/indexedDbRepository"
  );
  await first.initializePersistence();
  expect(first.loadIndexedWorkspace()).toEqual(
    JSON.parse(JSON.stringify(document)),
  );
  await first.saveIndexedWorkspace(document);
  vi.resetModules();
  const second = await import(
    "../src/infrastructure/persistence/indexedDbRepository"
  );
  await second.initializePersistence();
  const next = structuredClone(document);
  next.projects[0].project.name = "Updated tab A";
  await first.saveIndexedWorkspace(next);
  await expect(second.saveIndexedWorkspace(document)).rejects.toThrow(
    "tab khác",
  );
  vi.resetModules();
  const reload = await import(
    "../src/infrastructure/persistence/indexedDbRepository"
  );
  await reload.initializePersistence();
  expect(
    (reload.loadIndexedWorkspace() as WorkspaceDocument).projects[0].project
      .name,
  ).toBe("Updated tab A");
  vi.unstubAllGlobals();
});
