export type DependencyType = "FS" | "SS" | "FF" | "SF";
export interface Calendar {
  holidays: string[];
}
export interface Assignment {
  resourceId: string;
  units: number;
  quantity?: number;
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
  attachments?: {
    id: string;
    name: string;
    type: string;
    data: string;
    size: number;
  }[];
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
