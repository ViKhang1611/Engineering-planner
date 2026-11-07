import { useState } from "react";
import { Save } from "lucide-react";
import type { ProjectSettingsInput } from "../../domain/workspace";
import {
  CalendarFields,
  calendarDraft,
  calendarFromDraft,
  splitDates,
} from "./CalendarFields";

export function ProjectSettingsForm({
  initial,
  onSubmit,
  submitLabel = "Lưu thông tin dự án",
}: {
  initial: ProjectSettingsInput;
  onSubmit: (input: ProjectSettingsInput) => boolean;
  submitLabel?: string;
}) {
  const [fields, setFields] = useState(initial);
  const [holidays, setHolidays] = useState(initial.holidays.join("\n"));
  const [calendar, setCalendar] = useState(() =>
    calendarDraft({ holidays: [], ...initial.calendar }),
  );
  const [saved, setSaved] = useState(false);
  const field = (
    key: Exclude<keyof ProjectSettingsInput, "holidays" | "calendar">,
    value: string,
  ) => {
    setSaved(false);
    setFields((previous) => ({ ...previous, [key]: value }));
  };
  return (
    <form
      className="project-settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(
          onSubmit({
            ...fields,
            holidays: splitDates(holidays),
            calendar: calendarFromDraft(calendar),
          }),
        );
      }}
    >
      <div className="settings-grid">
        <label className="field settings-wide">
          Tên dự án
          <input
            required
            maxLength={200}
            value={fields.name}
            onChange={(e) => field("name", e.target.value)}
          />
        </label>
        <label className="field">
          Mã hợp đồng
          <input
            maxLength={80}
            className="numeric"
            value={fields.contractCode}
            onChange={(e) => field("contractCode", e.target.value)}
          />
        </label>
        <label className="field">
          Chủ đầu tư
          <input
            maxLength={200}
            value={fields.client}
            onChange={(e) => field("client", e.target.value)}
          />
        </label>
        <label className="field">
          Ngày bắt đầu dự án
          <input
            required
            type="date"
            className="numeric"
            value={fields.startDate}
            onChange={(e) => field("startDate", e.target.value)}
          />
        </label>
        <label className="field">
          Ngày báo cáo
          <input
            required
            type="date"
            className="numeric"
            value={fields.statusDate}
            onChange={(e) => field("statusDate", e.target.value)}
          />
        </label>
      </div>
      <CalendarFields
        value={calendar}
        onChange={(next) => {
          setCalendar(next);
          setSaved(false);
        }}
      />
      <label className="field">
        Ngày nghỉ lễ
        <textarea
          aria-describedby="holiday-help"
          className="numeric"
          rows={4}
          value={holidays}
          onChange={(e) => {
            setHolidays(e.target.value);
            setSaved(false);
          }}
          placeholder={"2026-01-01\n2026-04-30"}
        />
      </label>
      <p id="holiday-help" className="field-hint">
        Mỗi dòng một ngày theo YYYY-MM-DD, hoặc cách nhau bằng dấu phẩy. Lịch
        mới áp dụng cho toàn bộ công việc trong dự án.
      </p>
      <div className="form-actions">
        <button className="primary-button" type="submit">
          <Save size={15} />
          {submitLabel}
        </button>
        {saved && (
          <span role="status" className="saved-feedback">
            Đã lưu thông tin và tính lại tiến độ.
          </span>
        )}
      </div>
    </form>
  );
}
