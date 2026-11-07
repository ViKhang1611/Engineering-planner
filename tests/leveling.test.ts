import { describe, expect, it } from "vitest";
import { suggestLeveling } from "../src/domain/leveling";
import { scheduleProject } from "../src/modules/schedule/engine/schedulingEngine";
import { createSeed } from "../src/modules/schedule/data/seed";
import type { ProjectInput, Task } from "../src/domain/project";

const task = (id: string, duration: number, units = 1): Task => ({
  id,
  parentId: null,
  name: id,
  duration,
  physicalPct: 0,
  assignments: [{ resourceId: "eng", units }],
});
function project(tasks: Task[]): ProjectInput {
  return {
    id: "p",
    name: "Leveling",
    startDate: "2026-10-05",
    statusDate: "2026-10-05",
    calendar: { holidays: [] },
    resources: [
      { id: "eng", name: "Kỹ sư", kind: "engineer", capacityHours: 8 },
    ],
    dependencies: [],
    tasks,
  };
}

describe("resource leveling suggestion", () => {
  it("delays one of two parallel tasks so the engineer is not overloaded", () => {
    const p = project([task("a", 2), task("b", 2)]);
    expect(scheduleProject(p).overloads).toHaveLength(2);
    const s = suggestLeveling(p);
    expect(s.overloadsBefore).toBe(2);
    expect(s.overloadsAfter).toBe(0);
    expect(s.changes).toHaveLength(1);
    expect(s.changes[0].toStart > s.changes[0].fromStart).toBe(true);
    expect(s.finishAfter > s.finishBefore).toBe(true);
    // The input project is not modified.
    expect(p.tasks.every((t) => !t.requestedStartDate)).toBe(true);
    // Applying the suggestion removes the overloads.
    const applied = structuredClone(p);
    for (const c of s.changes)
      applied.tasks.find((t) => t.id === c.taskId)!.requestedStartDate =
        c.toStart;
    expect(scheduleProject(applied).overloads).toHaveLength(0);
  });

  it("prefers delaying the task with more float", () => {
    const p = project([task("long", 4), task("short", 1)]);
    const s = suggestLeveling(p);
    expect(s.changes.map((c) => c.taskId)).toEqual(["short"]);
  });

  it("reports days a single task overloads on its own", () => {
    const p = project([task("heavy", 1, 2)]);
    const s = suggestLeveling(p);
    expect(s.changes).toHaveLength(0);
    expect(s.unresolvable).toHaveLength(1);
  });

  it("never moves a task earlier on the demo project", () => {
    const p = createSeed();
    const before = new Map(
      scheduleProject(p).tasks.map((t) => [t.id, t.startDate]),
    );
    const s = suggestLeveling(p);
    expect(s.overloadsAfter).toBeLessThanOrEqual(s.overloadsBefore);
    for (const c of s.changes)
      expect(c.toStart >= before.get(c.taskId)!).toBe(true);
  });
});
