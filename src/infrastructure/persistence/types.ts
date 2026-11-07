import type { ProjectSnapshot } from "../../domain/workspace";

/** Another tab saved first: this save was rolled back without writing. */
export class WorkspaceConflictError extends Error {
  constructor() {
    super(
      "Dữ liệu đã đổi ở tab khác. Xuất JSON phiên này rồi tải lại để tránh ghi đè.",
    );
    this.name = "WorkspaceConflictError";
  }
}

/** What other tabs saved since this tab's last known revision. */
export interface RemoteChanges {
  revision: number;
  projectOrder: string[];
  /** Projects written by other tabs since our revision (added or changed). */
  projects: ProjectSnapshot[];
  /** Projects that were on disk at our revision and are gone now. */
  removedIds: string[];
  /**
   * Adopts the remote revision so the next save is not a conflict. Call only
   * after applying (or deliberately overriding) every changed project.
   */
  accept(): void;
}
