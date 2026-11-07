import type { Calendar } from "./project";
import {
  DEFAULT_WORK_WEEK,
  shiftMinutes,
} from "../modules/schedule/engine/schedulingEngine";

/** Vietnamese weekday short names, index 0 = Sunday. */
export const WEEKDAY_NAMES = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
/** Display order Monday → Sunday. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "T2–T7", "T2–T6", or a list such as "T2, T4, T6" for gaps. */
export function workWeekLabel(calendar: Pick<Calendar, "workWeek">): string {
  const days = new Set(calendar.workWeek ?? DEFAULT_WORK_WEEK);
  const ordered = WEEK_ORDER.filter((d) => days.has(d));
  const positions = ordered.map((d) => WEEK_ORDER.indexOf(d));
  const contiguous = positions.every(
    (p, i) => !i || p === positions[i - 1] + 1,
  );
  if (ordered.length > 2 && contiguous)
    return `${WEEKDAY_NAMES[ordered[0]]}–${WEEKDAY_NAMES[ordered.at(-1)!]}`;
  return ordered.map((d) => WEEKDAY_NAMES[d]).join(", ");
}

/** "08:00–12:00 / 13:00–17:00". */
export function shiftLabel(calendar: Pick<Calendar, "shift">): string {
  const { morning, afternoon } = shiftMinutes(calendar);
  return `${clock(morning)}–${clock(morning + 240)} / ${clock(afternoon)}–${clock(afternoon + 240)}`;
}

/** Days of the week not worked, e.g. "Chủ Nhật" or "T7, CN". */
export function offDaysLabel(calendar: Pick<Calendar, "workWeek">): string {
  const days = new Set(calendar.workWeek ?? DEFAULT_WORK_WEEK);
  const off = WEEK_ORDER.filter((d) => !days.has(d));
  if (!off.length) return "không có ngày nghỉ hằng tuần";
  if (off.length === 1 && off[0] === 0) return "Chủ Nhật";
  return off.map((d) => WEEKDAY_NAMES[d]).join(", ");
}
