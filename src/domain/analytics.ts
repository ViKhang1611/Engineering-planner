import type { BaselineTask, ProjectInput, ScheduleResult } from "./project";
import {
  WorkingClock,
  isWorkingDay,
} from "../modules/schedule/engine/schedulingEngine";
export function plannedFraction(
  task: Pick<BaselineTask, "startDate" | "duration">,
  date: string,
  clock: WorkingClock,
) {
  const start = clock.startOf(task.startDate),
    end = clock.startOf(date) + (isWorkingDay(date, clock.calendar) ? 480 : 0);
  return task.duration === 0
    ? end > start
      ? 1
      : 0
    : Math.max(0, Math.min(1, (end - start) / (task.duration * 480)));
}
export function earnedValue(project: ProjectInput, result: ScheduleResult) {
  const leaves = result.tasks.filter((t) => !t.isSummary),
    baseline = project.baselines?.find(
      (b) => b.id === project.activeBaselineId,
    );
  const clock = new WorkingClock(
    project.startDate,
    baseline?.calendar ?? project.calendar,
  );
  const baselineMap = new Map(baseline?.tasks.map((t) => [t.id, t]) ?? []);
  let BAC = 0,
    PV = 0,
    EV = 0,
    AC = 0;
  for (const t of leaves) {
    const budget = t.budgetCost ?? 0;
    BAC += budget;
    EV += (budget * t.physicalPct) / 100;
    AC += t.actualCost ?? 0;
    const planned = baselineMap.get(t.id) ?? t;
    PV +=
      (planned.budgetCost ?? budget) *
      plannedFraction(planned, project.statusDate, clock);
  }
  return {
    BAC,
    PV,
    EV,
    AC,
    SPI: PV ? EV / PV : null,
    CPI: AC ? EV / AC : null,
    SV: EV - PV,
    CV: EV - AC,
  };
}
