import { layout } from "../../../shared/designTokens";
import { calendarDaysBetween } from "../engine/schedulingEngine";

/**
 * Fraction (0–1) of a working day elapsed at an ISO "…THH:MM" timestamp, for
 * two 4-hour blocks starting at `shift.morning` / `shift.afternoon` minutes.
 */
export function dayFraction(
  at: string | undefined,
  shift: { morning: number; afternoon: number },
) {
  if (!at) return 0;
  const minutes = Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16));
  const worked =
    minutes < shift.afternoon
      ? minutes - shift.morning
      : minutes - shift.afternoon + 240;
  return Math.max(0, Math.min(1, worked / 480));
}

export const ROW = layout.rowHeight;
export const HEADER = layout.timelineHeaderHeight;

export const cols = [
  { key: "wbs", label: "WBS", width: 74 },
  { key: "name", label: "Tên công việc", width: 300 },
  { key: "duration", label: "Thời lượng", width: 84 },
  { key: "startDate", label: "Bắt đầu", width: 108 },
  { key: "endDate", label: "Kết thúc", width: 108 },
  { key: "predecessors", label: "Tiền nhiệm", width: 138 },
  { key: "resources", label: "Nguồn lực", width: 220 },
  { key: "physicalPct", label: "Physical %", width: 94 },
  { key: "durationPct", label: "Duration %", width: 94 },
  { key: "variance", label: "Variance (d)", width: 100 },
] as const;
export const GRID_WIDTH = cols.reduce((sum, column) => sum + column.width, 0);

export const dateLabel = (value: string) =>
  `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
export const number = (value: number) =>
  Number(value.toFixed(2)).toLocaleString("vi-VN");

export type Zoom = "day" | "week" | "month";
export const dayWidthFor = (zoom: Zoom) =>
  zoom === "day" ? 42 : zoom === "week" ? 20 : 8;

/** Timeline origin and scale; one object per zoom/plan change so rows can memoize on it. */
export interface TimelineGeometry {
  start: string;
  dayWidth: number;
  /** Work block starts in minutes of day (see shiftMinutes). */
  shift: { morning: number; afternoon: number };
}

/** Horizontal placement of a bar on the timeline, in px. */
export function barPosition(
  task: {
    startDate: string;
    endDate: string;
    duration: number;
    startAt?: string;
    finishAt?: string;
  },
  { start, dayWidth, shift }: TimelineGeometry,
) {
  const fraction = (at?: string) => dayFraction(at, shift);
  const x =
    calendarDaysBetween(start, task.startDate) * dayWidth +
    fraction(task.startAt) * dayWidth;
  const end =
    (calendarDaysBetween(start, task.endDate) +
      (task.finishAt ? fraction(task.finishAt) : 1)) *
    dayWidth;
  return { x, width: task.duration === 0 ? 0 : Math.max(3, end - x) };
}

/**
 * Horizontal offsets and the WBS pane width are CSS custom properties set on
 * the workspace (`--pane`, `--grid-x`, `--timeline-x`). Rows read them in
 * styles, so scrolling sideways or dragging the splitter does not re-render
 * every row.
 */
export const paneWidth = "var(--pane)";
export const timelineLeft = "calc(var(--pane) + 4px)";
export const gridShift = "translateX(calc(var(--grid-x) * -1))";
export const timelineShift = "translateX(calc(var(--timeline-x) * -1))";
