import type { ScheduleResult } from "../domain/project";
import type { WorkspaceState } from "./workspaceStore";

/**
 * Shell badges are read on every store update by the components that show
 * them. Results are immutable (a new object per reschedule), so counts are
 * cached per result instead of re-scanning thousands of tasks each time.
 */
const criticalCache = new WeakMap<ScheduleResult, number>();

/** Leaf tasks on the critical path that are not finished yet. */
export function selectOpenCriticalCount(state: WorkspaceState): number {
  const result = state.projects[state.activeProjectId].result;
  let count = criticalCache.get(result);
  if (count === undefined) {
    count = 0;
    for (const t of result.tasks)
      if (!t.isSummary && t.isCritical && t.physicalPct < 100) count++;
    criticalCache.set(result, count);
  }
  return count;
}

export function selectOverloadCount(state: WorkspaceState): number {
  return state.projects[state.activeProjectId].result.overloads.length;
}

/** Project names in workspace order; compare with useShallow. */
export function selectProjectNames(state: WorkspaceState): string[] {
  return state.projectOrder.map((id) => state.projects[id].project.name);
}
