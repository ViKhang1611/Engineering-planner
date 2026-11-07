import { describe, expect, it } from "vitest";
import {
  isWorkingDay,
  scheduleProject,
  SchedulingError,
  validateCalendar,
} from "../src/modules/schedule/engine/schedulingEngine";
import type { Calendar, ProjectInput } from "../src/domain/project";
import {
  offDaysLabel,
  shiftLabel,
  workWeekLabel,
} from "../src/domain/calendarText";
import { createWorkspaceStore } from "../src/store/workspaceStore";
import { LocalStorageWorkspaceRepository } from "../src/infrastructure/persistence/workspaceRepository";

/** One 5-day task starting Monday 2026-10-05. */
function project(calendar: Calendar): ProjectInput {
  return {
    id: "p",
    name: "Lịch",
    startDate: "2026-10-05",
    statusDate: "2026-10-05",
    calendar,
    resources: [],
    dependencies: [],
    tasks: [
      {
        id: "a",
        parentId: null,
        name: "A",
        duration: 5,
        physicalPct: 0,
        assignments: [],
      },
    ],
  };
}
const task = (calendar: Calendar) =>
  scheduleProject(project(calendar)).tasks[0];

describe("configurable calendar", () => {
  it("defaults to Monday–Saturday, 08:00–12:00 / 13:00–17:00", () => {
    const t = task({ holidays: [] });
    expect(t.startAt).toBe("2026-10-05T08:00:00+07:00");
    expect(t.finishAt).toBe("2026-10-09T17:00:00+07:00");
  });

  it("skips weekdays outside the work week", () => {
    // Mon–Thu week: 5 days = Mon–Thu + next Mon.
    const t = task({ holidays: [], workWeek: [1, 2, 3, 4] });
    expect(t.endDate).toBe("2026-10-12");
  });

  it("works makeup days on an off weekday; holidays still win", () => {
    const week = [1, 2, 3, 4, 5];
    // Mon–Fri week, 7 days: Mon–Fri, then Sat 10/10 as makeup, then Mon 10/12.
    const p = project({
      holidays: [],
      workWeek: week,
      extraWorkingDays: ["2026-10-10"],
    });
    p.tasks[0].duration = 7;
    expect(scheduleProject(p).tasks[0].endDate).toBe("2026-10-12");
    const calendar = {
      holidays: ["2026-10-10"],
      workWeek: week,
      extraWorkingDays: ["2026-10-10"],
    };
    expect(isWorkingDay("2026-10-10", calendar)).toBe(false);
  });

  it("places start/finish times on the configured shifts", () => {
    const t = task({
      holidays: [],
      shift: { morningStart: "07:30", afternoonStart: "12:30" },
    });
    expect(t.startAt).toBe("2026-10-05T07:30:00+07:00");
    expect(t.finishAt).toBe("2026-10-09T16:30:00+07:00");
    // Durations stay in 8-hour days.
    expect(t.duration).toBe(5);
  });

  it("rejects calendars that cannot drive a schedule", () => {
    const bad: Calendar[] = [
      { holidays: [], workWeek: [] },
      { holidays: [], workWeek: [1, 1] },
      { holidays: [], workWeek: [7] },
      { holidays: [], extraWorkingDays: ["2026-02-30"] },
      {
        holidays: [],
        shift: { morningStart: "8:00", afternoonStart: "13:00" },
      },
      {
        holidays: [],
        shift: { morningStart: "08:00", afternoonStart: "11:00" },
      },
      {
        holidays: [],
        shift: { morningStart: "08:00", afternoonStart: "21:00" },
      },
    ];
    for (const calendar of bad)
      expect(() => validateCalendar(calendar)).toThrow(SchedulingError);
    expect(() => validateCalendar({ holidays: [] })).not.toThrow();
  });

  it("describes the calendar in Vietnamese", () => {
    expect(workWeekLabel({})).toBe("T2–T7");
    expect(workWeekLabel({ workWeek: [1, 2, 3, 4, 5] })).toBe("T2–T6");
    expect(workWeekLabel({ workWeek: [1, 3, 5] })).toBe("T2, T4, T6");
    expect(workWeekLabel({ workWeek: [1, 2, 3, 4, 5, 6, 0] })).toBe("T2–CN");
    expect(shiftLabel({})).toBe("08:00–12:00 / 13:00–17:00");
    expect(offDaysLabel({})).toBe("Chủ Nhật");
    expect(offDaysLabel({ workWeek: [1, 2, 3, 4, 5] })).toBe("T7, CN");
  });

  it("saves calendar settings through the workspace store", () => {
    const values = new Map<string, string>();
    const repository = new LocalStorageWorkspaceRepository({
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => void values.set(k, v),
    });
    const store = createWorkspaceStore(repository);
    const id = store.getState().activeProjectId;
    const p = store.getState().projects[id].project;
    const ok = store.getState().updateSettings(id, {
      name: p.name,
      contractCode: p.contractCode ?? "",
      client: p.client ?? "",
      startDate: p.startDate,
      statusDate: p.statusDate,
      holidays: [],
      calendar: { workWeek: [1, 2, 3, 4, 5], extraWorkingDays: ["2026-10-10"] },
    });
    expect(ok).toBe(true);
    const reloaded = createWorkspaceStore(repository).getState();
    expect(reloaded.projects[id].project.calendar).toEqual({
      holidays: [],
      workWeek: [1, 2, 3, 4, 5],
      extraWorkingDays: ["2026-10-10"],
    });
    expect(
      store.getState().updateSettings(id, {
        name: p.name,
        contractCode: "",
        client: "",
        startDate: p.startDate,
        statusDate: p.statusDate,
        holidays: [],
        calendar: { workWeek: [] },
      }),
    ).toBe(false);
    expect(store.getState().actionError).toMatch(/ngày làm việc/);
  });
});
