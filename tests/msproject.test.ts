import { describe, expect, it } from "vitest";
import {
  exportMsProject,
  importMsProject,
} from "../src/modules/data/msproject";
import { readImport } from "../src/modules/data/serialization";
import { scheduleProject } from "../src/modules/schedule/engine/schedulingEngine";
import { createSeed } from "../src/modules/schedule/data/seed";
import type { ProjectInput } from "../src/domain/project";

function richProject(): ProjectInput {
  const p = createSeed();
  p.calendar = {
    holidays: ["2026-10-20"],
    workWeek: [1, 2, 3, 4, 5],
    extraWorkingDays: ["2026-10-10"],
    shift: { morningStart: "07:30", afternoonStart: "12:30" },
  };
  const leaves = p.tasks.filter(
    (t) => !p.tasks.some((c) => c.parentId === t.id),
  );
  leaves[1].deadline = "2026-11-30";
  leaves[2].requestedStartDate = "2026-10-14";
  leaves[2].notes = 'Ghi chú <đặc biệt> & "trích dẫn"';
  leaves[2].budgetCost = 12_000_000;
  p.dependencies[0].lagDays = 1.5;
  return p;
}

describe("MS Project XML", () => {
  it("round-trips structure, links, resources, calendar and constraints", () => {
    const source = richProject();
    const { xml } = exportMsProject(source);
    const { project, warnings } = importMsProject(xml);
    expect(warnings).toEqual([]);
    const before = scheduleProject(source);
    const after = scheduleProject(project);
    expect(
      after.tasks.map((t) => [t.wbs, t.name, t.duration, t.isSummary]),
    ).toEqual(
      before.tasks.map((t) => [t.wbs, t.name, t.duration, t.isSummary]),
    );
    expect(after.tasks.map((t) => [t.startAt, t.finishAt])).toEqual(
      before.tasks.map((t) => [t.startAt, t.finishAt]),
    );
    expect(after.finishDate).toBe(before.finishDate);
    expect(project.calendar).toEqual(source.calendar);
    expect(project.dependencies.map((d) => [d.type, d.lagDays])).toEqual(
      source.dependencies.map((d) => [d.type, d.lagDays]),
    );
    expect(
      project.resources.map((r) => [r.name, r.kind, r.capacityHours]),
    ).toEqual(source.resources.map((r) => [r.name, r.kind, r.capacityHours]));
    const named = (p: ProjectInput, name: string) =>
      p.tasks.find((t) => t.name === name)!;
    for (const t of source.tasks) {
      const back = named(project, t.name);
      expect(back.deadline).toBe(t.deadline);
      expect(back.notes).toBe(t.notes);
      expect(back.physicalPct).toBe(Math.round(t.physicalPct));
      expect(back.assignments.length).toBe(t.assignments.length);
    }
  });

  it("exports baselines and reports what MSPDI cannot hold", () => {
    const source = richProject();
    const scheduled = scheduleProject(source);
    source.baselines = [
      {
        id: "b0",
        name: "Baseline 0",
        createdAt: "2026-10-01T00:00:00Z",
        tasks: scheduled.tasks.map((t) => ({
          id: t.id,
          startDate: t.startDate,
          endDate: t.endDate,
          startAt: t.startAt,
          finishAt: t.finishAt,
          duration: t.duration,
          physicalPct: t.physicalPct,
          workHours: t.workHours,
        })),
      },
    ];
    source.tasks[2].checklist = [
      { id: "c", title: "x", weight: 1, checked: false },
    ];
    const { xml, dropped } = exportMsProject(source);
    expect(dropped).toContain("checklist");
    const { project } = importMsProject(xml);
    expect(project.baselines).toHaveLength(1);
    expect(project.baselines![0].tasks.map((t) => t.endDate)).toEqual(
      scheduled.tasks.map((t) => t.endDate),
    );
  });

  it("imports a typical MS Project file: project summary row, legacy exceptions, summary links", () => {
    const xml = `<?xml version="1.0"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Title>Nhà máy B</Title><StartDate>2026-10-05T08:00:00</StartDate>
  <MinutesPerDay>480</MinutesPerDay><CalendarUID>1</CalendarUID>
  <Calendars><Calendar><UID>1</UID><IsBaseCalendar>1</IsBaseCalendar><WeekDays>
    <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
    <WeekDay><DayType>2</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
    <WeekDay><DayType>3</DayType><DayWorking>1</DayWorking></WeekDay>
    <WeekDay><DayType>4</DayType><DayWorking>1</DayWorking></WeekDay>
    <WeekDay><DayType>5</DayType><DayWorking>1</DayWorking></WeekDay>
    <WeekDay><DayType>6</DayType><DayWorking>1</DayWorking></WeekDay>
    <WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
    <WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod><FromDate>2026-10-12T00:00:00</FromDate><ToDate>2026-10-13T23:59:00</ToDate></TimePeriod></WeekDay>
  </WeekDays></Calendar></Calendars>
  <Tasks>
    <Task><UID>0</UID><Name>Nhà máy B</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>
    <Task><UID>1</UID><Name>Thiết kế</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>
    <Task><UID>2</UID><Name>Khảo sát</Name><OutlineLevel>2</OutlineLevel><Duration>PT16H0M0S</Duration><PercentComplete>50</PercentComplete></Task>
    <Task><UID>3</UID><Name>Bản vẽ</Name><OutlineLevel>2</OutlineLevel><Duration>PT24H0M0S</Duration>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type><LinkLag>4800</LinkLag><LagFormat>7</LagFormat></PredecessorLink></Task>
    <Task><UID>4</UID><Name>Lắp đặt</Name><OutlineLevel>1</OutlineLevel><Duration>PT8H0M0S</Duration>
      <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type></PredecessorLink></Task>
  </Tasks>
  <Resources><Resource><UID>0</UID></Resource><Resource><UID>1</UID><Name>KS. Lan</Name><Type>1</Type><MaxUnits>1.00</MaxUnits></Resource></Resources>
  <Assignments><Assignment><TaskUID>3</TaskUID><ResourceUID>1</ResourceUID><Units>1</Units></Assignment>
    <Assignment><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID><Units>1</Units></Assignment></Assignments>
</Project>`;
    const { project, warnings } = importMsProject(xml);
    expect(project.name).toBe("Nhà máy B");
    expect(project.calendar).toEqual({
      holidays: ["2026-10-12", "2026-10-13"],
      workWeek: [1, 2, 3, 4, 5],
    });
    const result = scheduleProject(project);
    expect(result.tasks.map((t) => `${t.wbs} ${t.name}`)).toEqual([
      "1 Thiết kế",
      "1.1 Khảo sát",
      "1.2 Bản vẽ",
      "2 Lắp đặt",
    ]);
    const drawing = result.tasks.find((t) => t.name === "Bản vẽ")!;
    expect(drawing.duration).toBe(3);
    expect(project.dependencies).toHaveLength(1); // summary link skipped
    expect(project.dependencies[0].lagDays).toBe(1);
    expect(warnings.some((w) => w.includes("summary"))).toBe(true);
    expect(warnings.some((w) => w.includes("tổng hợp"))).toBe(true);
    expect(project.tasks.find((t) => t.name === "Khảo sát")!.physicalPct).toBe(
      50,
    );
  });

  it("is reachable through readImport and rejects non-MSPDI XML", async () => {
    const { xml } = exportMsProject(createSeed());
    const { project } = await readImport(new File([xml], "plan.xml"));
    expect(project.tasks.length).toBe(createSeed().tasks.length);
    expect(() => importMsProject("<foo/>")).toThrow(/MS Project/);
  });
});
