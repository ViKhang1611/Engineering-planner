import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  calendarDaysBetween,
  isWorkingDay,
  parseDate,
  SchedulingError,
} from "../src/modules/schedule/engine/schedulingEngine";
import {
  cloneForCommit,
  createScheduleSession,
  type ScheduleSession,
} from "../src/modules/schedule/model/createScheduleSession";
import { createSeed } from "../src/modules/schedule/data/seed";

describe("cached date helpers", () => {
  it("keep strict validation on repeated and cached values", () => {
    for (let i = 0; i < 2; i++) {
      expect(() => parseDate("2026-02-30")).toThrow(SchedulingError);
      expect(() => parseDate("2026-2-3")).toThrow(SchedulingError);
      expect(parseDate("2026-10-19").toISOString()).toBe(
        "2026-10-19T00:00:00.000Z",
      );
    }
    // Callers get their own Date: mutating it must not poison the cache.
    parseDate("2026-10-19").setUTCDate(1);
    expect(parseDate("2026-10-19").getUTCDate()).toBe(19);
  });

  it("computes weekdays, holidays and day arithmetic like Date does", () => {
    const calendar = { holidays: ["2026-09-02"] };
    for (let i = -400; i < 400; i++) {
      const date = addCalendarDays("2026-01-01", i);
      const day = new Date(`${date}T00:00:00Z`).getUTCDay();
      expect(isWorkingDay(date, calendar)).toBe(
        day !== 0 && date !== "2026-09-02",
      );
    }
    expect(isWorkingDay("1969-12-28", { holidays: [] })).toBe(false); // Sunday
    expect(isWorkingDay("1969-12-29", { holidays: [] })).toBe(true);
    expect(calendarDaysBetween("2026-02-27", "2026-03-02")).toBe(3);
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("sees a holiday added to the same array after caching", () => {
    const calendar = { holidays: [] as string[] };
    expect(isWorkingDay("2026-10-20", calendar)).toBe(true);
    calendar.holidays.push("2026-10-20");
    expect(isWorkingDay("2026-10-20", calendar)).toBe(false);
  });
});

describe("commit cloning", () => {
  function session() {
    let state: ScheduleSession;
    const set = (p: object | ((s: ScheduleSession) => object)) => {
      state = { ...state, ...(typeof p === "function" ? p(state) : p) };
    };
    state = createScheduleSession(set as never, () => state, {
      project: createSeed(),
      baseline: null,
    });
    return () => state;
  }

  it("shares immutable baselines but deep-copies everything editable", () => {
    const s = session();
    s().captureBaseline();
    const project = s().project;
    const copy = cloneForCommit(project);
    expect(copy.baselines![0]).toBe(project.baselines![0]);
    expect(copy.baselines).not.toBe(project.baselines);
    expect(copy.tasks).not.toBe(project.tasks);
    expect(copy.tasks[0]).not.toBe(project.tasks[0]);
    expect(copy).toEqual(project);
  });

  it("keeps baselines and undo history intact across edits", () => {
    const s = session();
    s().captureBaseline();
    const frozen = JSON.stringify(s().project.baselines);
    s().updateTask("drawing", { duration: 9 });
    s().captureBaseline();
    s().updateTask("drawing", { duration: 2 });
    expect(JSON.stringify(s().project.baselines![0])).toBe(
      JSON.stringify(JSON.parse(frozen)[0]),
    );
    s().undo();
    s().undo();
    expect(s().project.tasks.find((t) => t.id === "drawing")!.duration).toBe(9);
    expect(s().project.baselines).toHaveLength(1);
    s().undo();
    expect(s().project.tasks.find((t) => t.id === "drawing")!.duration).toBe(4);
  });
});
