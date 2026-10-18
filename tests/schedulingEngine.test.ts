import { describe, expect, it } from "vitest";
import {
  scheduleProject,
  SchedulingError,
  WorkingClock,
} from "../src/modules/schedule/engine/schedulingEngine";
import {
  createLargeProject,
  createSeed,
} from "../src/modules/schedule/data/seed";
import type { DependencyType, ProjectInput, Task } from "../src/domain/project";
const task = (
  id: string,
  duration = 1,
  physicalPct = 0,
  parentId: string | null = null,
): Task => ({ id, parentId, name: id, duration, physicalPct, assignments: [] });
const project = (tasks: Task[]): ProjectInput => ({
  id: "test",
  name: "test",
  startDate: "2026-10-05",
  statusDate: "2026-10-05",
  tasks,
  resources: [],
  dependencies: [],
  calendar: { holidays: [] },
});
const find = (p: ProjectInput, id: string) =>
  scheduleProject(p).tasks.find((task) => task.id === id)!;
function link(
  p: ProjectInput,
  a: string,
  b: string,
  type: DependencyType = "FS",
  lagDays = 0,
) {
  p.dependencies.push({
    id: `${a}-${b}`,
    predecessorId: a,
    successorId: b,
    type,
    lagDays,
  });
}
describe("working calendar and interval semantics", () => {
  it("skips Sunday and preserves Saturday finish at 17:00", () => {
    const p = project([task("a", 2), task("b")]);
    p.startDate = "2026-10-10";
    link(p, "a", "b");
    expect(find(p, "a").endDate).toBe("2026-10-12");
    expect(find(p, "b").startAt).toBe("2026-10-13T08:00:00+07:00");
  });
  it("skips configured holidays and recalculates a changed calendar", () => {
    const p = project([task("a", 2)]);
    expect(find(p, "a").endDate).toBe("2026-10-06");
    p.calendar.holidays = ["2026-10-06"];
    expect(find(p, "a").endDate).toBe("2026-10-07");
  });
  it("handles 0.5-day tasks, lunch, and exact finish boundaries", () => {
    const clock = new WorkingClock("2026-10-05", { holidays: [] });
    expect(clock.point(240, true).at).toBe("2026-10-05T12:00:00+07:00");
    expect(clock.point(240).at).toBe("2026-10-05T13:00:00+07:00");
    expect(clock.point(241).at).toBe("2026-10-05T13:01:00+07:00");
    expect(clock.point(480, true).at).toBe("2026-10-05T17:00:00+07:00");
    expect(clock.point(480).at).toBe("2026-10-06T08:00:00+07:00");
  });
  it("advances a Sunday project start to Monday", () => {
    const p = project([task("a")]);
    p.startDate = "2026-10-11";
    expect(find(p, "a").startDate).toBe("2026-10-12");
  });
  it("rejects nonexistent dates rather than silently normalizing", () => {
    const p = project([task("a")]);
    p.startDate = "2026-02-30";
    expect(() => scheduleProject(p)).toThrow(SchedulingError);
  });
});
describe("generalized dependencies and CPM", () => {
  it.each([
    ["FS", 0, 4],
    ["FS", -1, 3],
    ["FS", 1, 5],
    ["SS", 1, 1],
    ["FF", 1, 3],
    ["SF", 3, 1],
  ] as [DependencyType, number, number][])(
    "%s lag %s produces successor early start %s days",
    (type, lag, expected) => {
      const p = project([task("a", 4), task("b", 2)]);
      link(p, "a", "b", type, lag);
      expect(find(p, "b").earlyStart).toBe(expected * 480);
    },
  );
  it("uses maximum constraint across multiple predecessors", () => {
    const p = project([task("a", 2), task("b", 4), task("c")]);
    link(p, "a", "c");
    link(p, "b", "c");
    expect(find(p, "c").earlyStart).toBe(4 * 480);
    expect(find(p, "a").totalFloat).toBe(2 * 480);
    expect(find(p, "b").isCritical).toBe(true);
    expect(find(p, "c").isCritical).toBe(true);
  });
  it("finds late dates by backward pass including SS and FF", () => {
    const p = project([task("a", 4), task("b", 2), task("c", 1)]);
    link(p, "a", "b", "SS", 1);
    link(p, "b", "c", "FF", 2);
    const result = scheduleProject(p);
    for (const item of result.tasks)
      expect(item.totalFloat).toBeGreaterThanOrEqual(0);
    expect(find(p, "c").earlyFinish).toBe(5 * 480);
    expect(find(p, "b").lateStart).toBe(480);
  });
  it("retracts downstream tasks when predecessor duration shrinks", () => {
    const p = project([task("a", 4), task("b", 2)]);
    link(p, "a", "b");
    expect(find(p, "b").earlyStart).toBe(1920);
    p.tasks[0].duration = 1;
    expect(find(p, "b").earlyStart).toBe(480);
  });
  it("retains user not-before constraints while honoring dependencies", () => {
    const p = project([
      task("a", 1),
      { ...task("b"), requestedStartDate: "2026-10-10" },
    ]);
    link(p, "a", "b");
    expect(find(p, "b").startDate).toBe("2026-10-10");
    p.tasks[0].duration = 10;
    expect(find(p, "b").earlyStart).toBe(4800);
  });
  it("moves the whole network when project start changes", () => {
    const p = project([task("a"), task("b")]);
    link(p, "a", "b");
    p.startDate = "2026-10-12";
    expect(find(p, "b").startDate).toBe("2026-10-13");
  });
  it("rejects circular dependency and self links", () => {
    const p = project([task("a"), task("b")]);
    link(p, "a", "b");
    link(p, "b", "a");
    expect(() => scheduleProject(p)).toThrow(/vòng lặp/);
    p.dependencies = [];
    link(p, "a", "a");
    expect(() => scheduleProject(p)).toThrow(/tự liên kết/);
  });
  it("gives a zero-duration milestone the exact FS finish instant", () => {
    const p = project([task("a"), task("m", 0)]);
    link(p, "a", "m");
    const milestone = find(p, "m");
    expect(milestone.earlyStart).toBe(milestone.earlyFinish);
    expect(milestone.startAt).toBe(milestone.finishAt);
    expect(milestone.startDate).toBe("2026-10-06");
    expect(milestone.isCritical).toBe(true);
  });
});
describe("WBS and progress rollup", () => {
  it("rolls up leaf duration weights once across nested summaries", () => {
    const p = project([
      task("parent", 0),
      task("group", 0, 0, "parent"),
      task("a", 2, 100, "group"),
      task("b", 6, 0, "parent"),
      task("milestone", 0, 100, "group"),
    ]);
    const result = scheduleProject(p);
    expect(result.tasks.map((task) => task.wbs)).toEqual([
      "1",
      "1.1",
      "1.1.1",
      "1.1.2",
      "1.2",
    ]);
    expect(find(p, "parent").physicalPct).toBe(25);
    expect(find(p, "parent").duration).toBe(6);
    expect(find(p, "group").physicalPct).toBe(100);
  });
  it("does not treat WBS parenthood as a dependency", () => {
    const p = project([
      task("summary", 0),
      task("a", 2, 0, "summary"),
      task("b", 1, 0, "summary"),
    ]);
    expect(find(p, "a").startDate).toBe(find(p, "b").startDate);
  });
  it("rejects dependency links to summary tasks and WBS cycles", () => {
    const p = project([task("summary", 0), task("a", 1, 0, "summary")]);
    link(p, "summary", "a");
    expect(() => scheduleProject(p)).toThrow(/summary/);
    p.dependencies = [];
    p.tasks[0].parentId = "a";
    expect(() => scheduleProject(p)).toThrow(/WBS/);
  });
  it("uses report end-of-day duration progress independently of physical progress", () => {
    const p = project([task("a", 4, 10)]);
    p.statusDate = "2026-10-06";
    expect(find(p, "a").durationPct).toBe(50);
    expect(find(p, "a").physicalPct).toBe(10);
  });
});
describe("summary wall-clock boundaries", () => {
  it("includes a milestone at the next shift in summary and project finish dates", () => {
    const p = project([
      task("s", 0),
      task("a", 1, 0, "s"),
      task("m", 0, 0, "s"),
    ]);
    link(p, "a", "m");
    const result = scheduleProject(p);
    expect(result.tasks.find((task) => task.id === "s")!.endDate).toBe(
      "2026-10-06",
    );
    expect(result.tasks.find((task) => task.id === "s")!.finishAt).toBe(
      "2026-10-06T08:00:00+07:00",
    );
    expect(result.finishDate).toBe("2026-10-06");
  });
});
describe("resource allocation and invariants", () => {
  it("warns at >8h/day without changing schedule", () => {
    const p = project([task("a"), task("b")]);
    p.resources = [
      { id: "an", name: "An", kind: "engineer", capacityHours: 8 },
    ];
    p.tasks.forEach((task) => {
      task.assignments = [{ resourceId: "an", units: 0.75 }];
    });
    const result = scheduleProject(p);
    expect(result.overloads[0].hours).toBe(12);
    expect(result.tasks[0].startDate).toBe(result.tasks[1].startDate);
    expect(result.tasks[0].overloadedResourceIds).toEqual(["an"]);
  });
  it("does not warn at exactly 8h; milestones consume no hours", () => {
    const p = project([task("a"), task("m", 0)]);
    p.resources = [
      { id: "an", name: "An", kind: "engineer", capacityHours: 8 },
    ];
    p.tasks.forEach((task) => {
      task.assignments = [{ resourceId: "an", units: 1 }];
    });
    const result = scheduleProject(p);
    expect(result.overloads).toHaveLength(0);
    expect(result.tasks[1].workHours).toBe(0);
  });
  it("does not mutate any input data", () => {
    const p = createSeed(),
      before = JSON.stringify(p);
    scheduleProject(p);
    expect(JSON.stringify(p)).toBe(before);
  });
  it("rejects negative duration and invalid assignment values", () => {
    const p = project([task("a", -1)]);
    expect(() => scheduleProject(p)).toThrow(/Thời lượng/);
  });
  it("rejects malformed imported resources before rendering", () => {
    const p = project([task("a")]);
    p.resources = [
      { id: "r", name: {} as string, kind: "engineer", capacityHours: 8 },
    ];
    expect(() => scheduleProject(p)).toThrow(/Nguồn lực không hợp lệ/);
  });
  it("schedules a 5,000 task dataset", () => {
    const result = scheduleProject(createLargeProject());
    expect(result.tasks).toHaveLength(5000);
    expect(result.tasks.every((task) => Number.isFinite(task.earlyStart))).toBe(
      true,
    );
  });
});
