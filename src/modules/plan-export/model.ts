import type {
  Calendar,
  ProjectInput,
  ScheduleResult,
  Baseline,
  ScheduledTask,
} from "../../domain/project";
import type { ThemePreset } from "../../theme/themes";
import {
  addCalendarDays,
  calendarDaysBetween,
  shiftMinutes,
} from "../schedule/engine/schedulingEngine";
import { variance } from "../../domain/execution";
export type Scale = "day" | "week" | "month";
export interface PlanSnapshot {
  project: ProjectInput;
  result: ScheduleResult;
  baseline: Baseline | null;
  theme: ThemePreset;
  exportedAt: string;
}
export interface ExportOptions {
  format: "xlsx" | "pdf";
  paper: "a4" | "a3";
  scale: Scale;
}
export interface TimelineColumn {
  start: string;
  end: string;
  offset: number;
  endOffset: number;
  label: string;
}
export interface ExportJob {
  snapshot: PlanSnapshot;
  options: ExportOptions;
}
export type Progress = (
  message: string,
  completed: number,
  total: number,
) => void;
export function planRange(s: PlanSnapshot) {
  const starts = [
    s.project.startDate,
    ...s.result.tasks.map((t) => t.startDate),
    ...(s.baseline?.tasks.map((t) => t.startDate) ?? []),
  ];
  const ends = [
    s.project.startDate,
    ...s.result.tasks.map((t) => t.endDate),
    ...(s.baseline?.tasks.map((t) => t.endDate) ?? []),
  ];
  return { start: starts.sort()[0], end: ends.sort().at(-1)! };
}
export function timelineColumns(
  start: string,
  end: string,
  scale: Scale,
): TimelineColumn[] {
  const columns: TimelineColumn[] = [];
  for (let date = start; date <= end; ) {
    let next = addCalendarDays(date, scale === "day" ? 1 : 7);
    if (scale === "month") {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 1, 1);
      next = d.toISOString().slice(0, 10);
    }
    const finish = next > end ? addCalendarDays(end, 1) : next;
    columns.push({
      start: date,
      end: addCalendarDays(finish, -1),
      offset: calendarDaysBetween(start, date),
      endOffset: calendarDaysBetween(start, finish),
      label:
        scale === "month"
          ? date.slice(0, 7)
          : `${date.slice(8)}/${date.slice(5, 7)}`,
    });
    date = next;
  }
  return columns;
}
/** Day offset from `start` plus the worked fraction of that day. */
export function timePosition(
  at: string,
  start: string,
  calendar: Pick<Calendar, "shift"> = {},
) {
  const { morning, afternoon } = shiftMinutes(calendar);
  const match = at.match(/T(\d\d):(\d\d)/);
  const minutes = match ? Number(match[1]) * 60 + Number(match[2]) : morning;
  const worked =
    minutes < afternoon ? minutes - morning : minutes - afternoon + 240;
  const fraction = Math.max(0, Math.min(1, worked / 480));
  return calendarDaysBetween(start, at.slice(0, 10)) + fraction;
}
export function planRows(s: PlanSnapshot) {
  const tasksById = new Map(s.result.tasks.map((t) => [t.id, t]));
  const resources = new Map(s.project.resources.map((r) => [r.id, r]));
  const baseline = new Map(s.baseline?.tasks.map((t) => [t.id, t]) ?? []);
  const incoming = new Map<string, string[]>();
  for (const d of s.project.dependencies) {
    const list = incoming.get(d.successorId) ?? [];
    list.push(
      `${tasksById.get(d.predecessorId)?.wbs ?? d.predecessorId}${d.type}${d.lagDays ? `${d.lagDays > 0 ? "+" : ""}${d.lagDays}` : ""}`,
    );
    incoming.set(d.successorId, list);
  }
  return s.result.tasks.map((task) => ({
    task,
    base: baseline.get(task.id),
    values: [
      task.wbs,
      task.name,
      task.duration,
      task.startDate,
      task.endDate,
      (incoming.get(task.id) ?? []).join(", "),
      task.physicalPct,
      task.durationPct,
      baseline.has(task.id)
        ? variance(
            task.endDate,
            baseline.get(task.id)!.endDate,
            s.baseline?.calendar ?? s.project.calendar,
          )
        : null,
      task.assignments
        .map((a) => resources.get(a.resourceId))
        .filter((r) => r?.kind === "engineer")
        .map((r) => r!.name)
        .join(", "),
    ],
  }));
}
export const headings = [
  "WBS",
  "Hạng mục công việc",
  "Ngày công",
  "Bắt đầu",
  "Kết thúc",
  "Tiền nhiệm",
  "Physical %",
  "Duration %",
  "Variance (d)",
  "Kỹ sư phụ trách",
];
export function taskColor(task: ScheduledTask, s: PlanSnapshot) {
  return task.isSummary
    ? s.theme.dark
      ? "#1e293b"
      : s.theme.summary
    : task.isCritical
      ? s.theme.critical
      : s.theme.task;
}
export function safeFilename(name: string) {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 90) || "Ke_hoach";
}
export const yieldToBrowser = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
