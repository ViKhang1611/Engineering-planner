import { useWorkspaceStore } from "./workspaceStore";
import type { ScheduleSession } from "../modules/schedule/model/createScheduleSession";

/** Compatibility hook, not a second store. All module writes use the same record. */
export function useProjectStore(): ScheduleSession;
export function useProjectStore<T>(
  selector: (session: ScheduleSession) => T,
): T;
export function useProjectStore<T>(selector?: (session: ScheduleSession) => T) {
  return useWorkspaceStore((state) => {
    const session = state.projects[state.activeProjectId];
    return selector ? selector(session) : session;
  });
}
