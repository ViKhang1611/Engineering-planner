import type { Calendar } from "../../domain/project";
import {
  offDaysLabel,
  shiftLabel,
  WEEK_ORDER,
  WEEKDAY_NAMES,
  workWeekLabel,
} from "../../domain/calendarText";
import {
  DEFAULT_SHIFT,
  DEFAULT_WORK_WEEK,
} from "../../modules/schedule/engine/schedulingEngine";

/** Editable calendar values; date lists are kept as raw text while typing. */
export interface CalendarDraft {
  workWeek: number[];
  extraWorkingDays: string;
  morningStart: string;
  afternoonStart: string;
}

export function calendarDraft(calendar: Calendar): CalendarDraft {
  return {
    workWeek: [...(calendar.workWeek ?? DEFAULT_WORK_WEEK)],
    extraWorkingDays: (calendar.extraWorkingDays ?? []).join("\n"),
    morningStart: calendar.shift?.morningStart ?? DEFAULT_SHIFT.morningStart,
    afternoonStart:
      calendar.shift?.afternoonStart ?? DEFAULT_SHIFT.afternoonStart,
  };
}

export const splitDates = (text: string) =>
  text
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);

/** Calendar fields (without holidays) from a draft; defaults are omitted. */
export function calendarFromDraft(
  draft: CalendarDraft,
): Omit<Calendar, "holidays"> {
  const week = [...new Set(draft.workWeek)].sort((a, b) => a - b);
  const extra = [...new Set(splitDates(draft.extraWorkingDays))].sort();
  const isDefaultWeek =
    week.length === DEFAULT_WORK_WEEK.length &&
    week.every((d, i) => d === DEFAULT_WORK_WEEK[i]);
  const isDefaultShift =
    draft.morningStart === DEFAULT_SHIFT.morningStart &&
    draft.afternoonStart === DEFAULT_SHIFT.afternoonStart;
  return {
    ...(isDefaultWeek ? {} : { workWeek: week }),
    ...(extra.length ? { extraWorkingDays: extra } : {}),
    ...(isDefaultShift
      ? {}
      : {
          shift: {
            morningStart: draft.morningStart,
            afternoonStart: draft.afternoonStart,
          },
        }),
  };
}

/**
 * Work week, makeup days and shift start times. Each day is two 4-hour
 * blocks, so 1 working day = 8 hours regardless of the chosen times.
 */
export function CalendarFields({
  value,
  onChange,
}: {
  value: CalendarDraft;
  onChange: (next: CalendarDraft) => void;
}) {
  const set = (patch: Partial<CalendarDraft>) =>
    onChange({ ...value, ...patch });
  const preview = {
    workWeek: value.workWeek,
    shift: {
      morningStart: value.morningStart,
      afternoonStart: value.afternoonStart,
    },
  };
  const validShift =
    /^\d\d:\d\d$/.test(value.morningStart) &&
    /^\d\d:\d\d$/.test(value.afternoonStart);
  return (
    <fieldset className="calendar-fields">
      <legend>Lịch làm việc</legend>
      <div className="weekday-picker" role="group" aria-label="Ngày làm việc">
        {WEEK_ORDER.map((day) => (
          <label key={day} className="weekday-toggle">
            <input
              type="checkbox"
              aria-label={`Làm việc ${WEEKDAY_NAMES[day]}`}
              checked={value.workWeek.includes(day)}
              onChange={(e) =>
                set({
                  workWeek: e.target.checked
                    ? [...value.workWeek, day]
                    : value.workWeek.filter((d) => d !== day),
                })
              }
            />
            <span>{WEEKDAY_NAMES[day]}</span>
          </label>
        ))}
      </div>
      <div className="shift-row">
        <label className="field">
          Ca sáng bắt đầu
          <input
            type="time"
            required
            value={value.morningStart}
            onChange={(e) => set({ morningStart: e.target.value })}
          />
        </label>
        <label className="field">
          Ca chiều bắt đầu
          <input
            type="time"
            required
            value={value.afternoonStart}
            onChange={(e) => set({ afternoonStart: e.target.value })}
          />
        </label>
      </div>
      <p className="field-hint" aria-live="polite">
        {value.workWeek.length
          ? `${workWeekLabel(preview)}${validShift ? ` · ${shiftLabel(preview)}` : ""} · 8 giờ/ngày · Nghỉ ${offDaysLabel(preview)}`
          : "Chọn ít nhất một ngày làm việc."}
      </p>
      <label className="field">
        Ngày làm bù (làm việc dù rơi vào ngày nghỉ hằng tuần)
        <textarea
          className="numeric"
          rows={2}
          value={value.extraWorkingDays}
          placeholder={"2026-05-09"}
          onChange={(e) => set({ extraWorkingDays: e.target.value })}
        />
      </label>
    </fieldset>
  );
}
