import type { ProjectInput, Baseline, Calendar } from "./project";

export const WORKSPACE_VIEWS = [
  "portfolio",
  "schedule",
  "resources",
  "execution",
  "dashboard",
  "data",
  "settings",
] as const;
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];
export interface ProjectSnapshot {
  project: ProjectInput;
  baseline: Baseline | null;
}
export interface WorkspaceDocument {
  schemaVersion: 2;
  activeProjectId: string;
  view: WorkspaceView;
  sidebarCollapsed: boolean;
  projects: ProjectSnapshot[];
}
export interface ProjectSettingsInput {
  name: string;
  contractCode: string;
  client: string;
  startDate: string;
  statusDate: string;
  holidays: string[];
  /** Work week, makeup days and shift times; omitted fields use defaults. */
  calendar?: Omit<Calendar, "holidays">;
}
