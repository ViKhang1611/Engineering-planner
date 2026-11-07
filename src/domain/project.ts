export type DependencyType = "FS" | "SS" | "FF" | "SF";
export interface Calendar {
  holidays: string[];
  /** Working weekdays, 0 = Sunday … 6 = Saturday. Default Monday–Saturday. */
  workWeek?: number[];
  /** Dates worked although their weekday is off (ngày làm bù). Holidays win. */
  extraWorkingDays?: string[];
  /**
   * Start of the two 4-hour blocks, "HH:MM". Default 08:00 and 13:00.
   * A working day is always 480 minutes, so durations in days are unchanged.
   */
  shift?: { morningStart: string; afternoonStart: string };
}
export interface Assignment {
  resourceId: string;
  units: number;
  quantity?: number;
}
/**
 * File metadata. The bytes live in the IndexedDB attachment store, keyed by id.
 * `data` (a base64 data URL) is present only in portable exports/imports, legacy
 * saves not yet migrated, and the localStorage fallback.
 */
export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  data?: string;
}
export interface Resource {
  id: string;
  name: string;
  kind: "engineer" | "equipment" | "material";
  capacityHours: number;
}
export interface Task {
  id: string;
  parentId: string | null;
  name: string;
  duration: number;
  physicalPct: number;
  requestedStartDate?: string;
  progressWeight?: number;
  checklist?: { id: string; title: string; checked: boolean; weight: number }[];
  progressMode?: "manual" | "checklist";
  executionStatus?: "todo" | "active" | "review" | "done";
  milestoneType?: "FAT" | "SAT" | "OTHER";
  acceptance?: { accepted: boolean; date: string; reference: string };
  notes?: string;
  budgetCost?: number;
  actualCost?: number;
  attachments?: Attachment[];
  assignments: Assignment[];
}
export interface Dependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}
export interface ProjectInput {
  id: string;
  name: string;
  contractCode?: string;
  client?: string;
  startDate: string;
  statusDate: string;
  calendar: Calendar;
  tasks: Task[];
  dependencies: Dependency[];
  resources: Resource[];
  baselines?: Baseline[];
  activeBaselineId?: string;
  progressHistory?: { date: string; physicalPct: number }[];
  /** Physical % applied when a manual-progress card is dragged on the Kanban. */
  executionRules?: ExecutionRules;
}
export interface ExecutionRules {
  /** Minimum Physical % when moved to "Đang thi công" (1–99). */
  activeMinPct: number;
  /** Physical % when moved to "Chờ nghiệm thu" (1–99, ≥ activeMinPct). */
  reviewPct: number;
}
export interface ScheduledTask extends Task {
  wbs: string;
  depth: number;
  isSummary: boolean;
  startDate: string;
  endDate: string;
  startAt: string;
  finishAt: string;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  isCritical: boolean;
  durationPct: number;
  workHours: number;
  overloadedResourceIds: string[];
}
export interface ResourceDay {
  resourceId: string;
  date: string;
  hours: number;
  capacityHours: number;
  taskIds: string[];
}
export interface ScheduleResult {
  tasks: ScheduledTask[];
  finishDate: string;
  durationMinutes: number;
  resourceDays: ResourceDay[];
  overloads: ResourceDay[];
  elapsedMs: number;
}
export interface BaselineTask {
  isSummary?: boolean;
  progressWeight?: number;
  budgetCost?: number;
  id: string;
  startDate: string;
  endDate: string;
  startAt: string;
  finishAt: string;
  duration: number;
  physicalPct: number;
  workHours: number;
}
export interface Baseline {
  id: string;
  name: string;
  createdAt: string;
  tasks: BaselineTask[];
  calendar?: Calendar;
}
