import { describe, it, expect } from "vitest";
import { createWorkspaceStore } from "../src/store/workspaceStore";
import { createSeed } from "../src/modules/schedule/data/seed";
import { taskStatus, transition, variance } from "../src/domain/execution";
import { setPredecessors } from "../src/domain/predecessors";
import {
  toRows,
  fromRows,
  encodeCsv,
  decodeCsv,
  exportExcel,
  importFile,
} from "../src/modules/data/serialization";
import { earnedValue } from "../src/domain/analytics";
function setup() {
  const store = createWorkspaceStore({ load: () => null, save: () => {} });
  return () => store.getState().projects[store.getState().activeProjectId];
}
describe("Enterprise integrated domain", () => {
  it("retains multiple immutable baselines, selection and undo", () => {
    const s = setup();
    s().captureBaseline();
    const first = structuredClone(s().baseline);
    s().updateTask("drawing", { duration: 8 });
    s().captureBaseline();
    expect(s().project.baselines).toHaveLength(2);
    expect(s().project.baselines![0]).toEqual(first);
    s().selectBaseline(first!.id);
    expect(s().baseline).toEqual(first);
    s().undo();
    expect(s().baseline!.id).not.toBe(first!.id);
  });
  it("keeps physical weights stable when duration changes", () => {
    const s = setup();
    const before = s().result.tasks.find((t) => t.id === "p1")?.physicalPct;
    s().updateTask("drawing", { duration: 20 });
    expect(s().result.tasks.find((t) => t.id === "p1")?.physicalPct).toBe(
      before,
    );
    expect(
      s().project.tasks.find((t) => t.id === "drawing")?.progressWeight,
    ).toBe(4);
  });
  it("rolls weighted checklist into Gantt and Kanban with FAT acceptance", () => {
    const s = setup();
    expect(
      s().updateTask("drawing", {
        progressMode: "checklist",
        milestoneType: "FAT",
        checklist: [
          { id: "a", title: "Duyệt bản vẽ", weight: 3, checked: true },
          { id: "b", title: "Test", weight: 1, checked: false },
        ],
      }),
    ).toBe(true);
    let t = s().project.tasks.find((t) => t.id === "drawing")!;
    expect(t.physicalPct).toBe(75);
    expect(taskStatus(t)).toBe("active");
    s().commit(
      (p) =>
        transition(
          p.tasks.find((t) => t.id === "drawing")!,
          "done",
          p.statusDate,
        ),
      "done",
    );
    t = s().project.tasks.find((t) => t.id === "drawing")!;
    expect(t.physicalPct).toBe(100);
    expect(t.acceptance?.accepted).toBe(true);
    expect(taskStatus(t)).toBe("done");
    expect(s().result.tasks.find((t) => t.id === t.id)).toBeDefined();
  });
  it("rejects acceptance before physical completion without mutating", () => {
    const s = setup(),
      before = s().project;
    expect(
      s().updateTask("drawing", {
        physicalPct: 50,
        acceptance: { accepted: true, date: "2026-10-07", reference: "FAT-1" },
      }),
    ).toBe(false);
    expect(s().project).toBe(before);
  });
  it("parses dependency forms and rejects bad WBS atomically", () => {
    for (const type of ["FS", "SS", "FF", "SF"]) {
      const s = setup();
      expect(
        s().commit(
          (p) =>
            setPredecessors(p, s().result.tasks, "drawing", `1.1${type}-1`),
          "link",
        ),
      ).toBe(true);
      expect(
        s().project.dependencies.find((d) => d.successorId === "drawing"),
      ).toMatchObject({ type, lagDays: -1 });
    }
    const s = setup(),
      before = s().project;
    expect(
      s().commit(
        (p) => setPredecessors(p, s().result.tasks, "drawing", "99FS"),
        "bad",
      ),
    ).toBe(false);
    expect(s().project).toBe(before);
  });
  it("counts variance across Sundays and holidays", () => {
    expect(variance("2026-10-13", "2026-10-10", ["2026-10-12"])).toBe(1);
    expect(variance("2026-10-10", "2026-10-13", ["2026-10-12"])).toBe(-1);
  });
  it("retains an entire subtree when outdenting", () => {
    const s = setup();
    const p = createSeed();
    p.tasks = [
      {
        id: "a",
        parentId: null,
        name: "A",
        duration: 1,
        physicalPct: 0,
        assignments: [],
      },
      {
        id: "b",
        parentId: "a",
        name: "B",
        duration: 1,
        physicalPct: 0,
        assignments: [],
      },
      {
        id: "c",
        parentId: "b",
        name: "C",
        duration: 1,
        physicalPct: 0,
        assignments: [],
      },
      {
        id: "d",
        parentId: "a",
        name: "D",
        duration: 1,
        physicalPct: 0,
        assignments: [],
      },
    ];
    p.dependencies = [];
    s().replace(p);
    s().select("b");
    s().indent(true);
    expect(s().result.tasks.map((t) => [t.id, t.wbs])).toEqual([
      ["a", "1"],
      ["d", "1.1"],
      ["b", "2"],
      ["c", "2.1"],
    ]);
  });
  it("computes EVM from actual costs and budget without invented values", () => {
    const s = setup();
    s().updateTask("drawing", {
      budgetCost: 1000,
      actualCost: 400,
      physicalPct: 50,
    });
    const evm = earnedValue(s().project, s().result);
    expect(evm.BAC).toBe(1000);
    expect(evm.EV).toBe(500);
    expect(evm.AC).toBe(400);
    expect(evm.CPI).toBe(1.25);
  });
  it("records observed progress once per report date", () => {
    const s = setup();
    s().updateTask("drawing", { physicalPct: 50 });
    s().updateTask("drawing", { physicalPct: 60 });
    expect(s().project.progressHistory).toHaveLength(1);
    expect(s().project.progressHistory![0].date).toBe(s().project.statusDate);
  });
  it("round trips CSV and Excel including WBS, links, multiple baselines and long attachments", async () => {
    const s = setup();
    s().updateTask("drawing", {
      name: '=Bản vẽ, "tủ"\nĐã duyệt',
      notes: "Ghi chú\n2 dòng",
      attachments: [
        {
          id: "attachment",
          name: "drawing.txt",
          type: "text/plain",
          size: 22500,
          data: "data:text/plain;base64," + "a".repeat(30000),
        },
      ],
    });
    s().captureBaseline();
    s().captureBaseline();
    const p = s().project;
    expect(fromRows(decodeCsv(encodeCsv(toRows(p))))).toEqual(p);
    const blob = await exportExcel(p);
    const file = new File([blob], "project.xlsx");
    expect(await importFile(file)).toEqual(p);
  });
  it("rejects damaged CSV chunks and invalid cycles", () => {
    const s = setup();
    const rows = toRows(s().project);
    expect(() => fromRows([...rows, rows[0]])).toThrow();
    const p = createSeed();
    p.dependencies.push({
      id: "cycle",
      predecessorId: "drawing",
      successorId: "survey",
      type: "FS",
      lagDays: 0,
    });
    expect(() => fromRows(toRows(p))).toThrow();
  });
});
