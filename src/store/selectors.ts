import { overallProgress } from "../domain/execution";
import type { ScheduleSession } from "../modules/schedule/model/createScheduleSession";
import type { WorkspaceState } from "./workspaceStore";

export const selectActiveProject = (state: WorkspaceState) =>
  state.projects[state.activeProjectId];

/** Derived, never persisted: modules must not maintain their own task copies. */
export function projectSummary(session: ScheduleSession) {
  const leaves = session.result.tasks.filter((task) => !task.isSummary);
  const total = leaves.reduce((sum, task) => sum + task.duration, 0);
  return {
    leafCount: leaves.length,
    physicalPct: overallProgress(session.result.tasks),
    finishDate: session.result.finishDate,
    overloadCount: new Set(
      session.result.overloads.map((day) => day.resourceId),
    ).size,
    criticalCount: leaves.filter((task) => task.isCritical).length,
    baselineName: session.baseline?.name ?? "Chưa chốt",
  };
}
