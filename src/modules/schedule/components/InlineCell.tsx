import { useState, type ReactNode } from "react";
import { useProjectStore } from "../../../store/useProjectStore";
import type { ScheduledTask } from "../engine/types";

/** Double-click-to-edit grid cell. Enter saves, Escape cancels. */
export function InlineCell({
  task,
  field,
  children,
}: {
  task: ScheduledTask;
  field: "name" | "duration" | "startDate" | "physicalPct";
  children: ReactNode;
}) {
  const update = useProjectStore((state) => state.updateTask);
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState("");
  const blocked =
    (field === "physicalPct" && task.progressMode === "checklist") ||
    (task.isSummary && field !== "name");
  const begin = () => {
    if (blocked) return;
    setValue(String(task[field]));
    setEditing(true);
  };
  const commit = () => {
    const patch =
      field === "startDate"
        ? { requestedStartDate: value || undefined }
        : { [field]: field === "name" ? value : Number(value) };
    if (update(task.id, patch)) setEditing(false);
  };
  if (editing)
    return (
      <input
        autoFocus
        aria-label={`Sửa ${field} ${task.name}`}
        className="cell-input"
        value={value}
        type={
          field === "startDate" ? "date" : field === "name" ? "text" : "number"
        }
        step={field === "duration" ? "0.125" : "1"}
        min={field === "name" || field === "startDate" ? undefined : 0}
        max={field === "physicalPct" ? 100 : undefined}
        onChange={(event) => setValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
      />
    );
  return (
    <span
      className={`cell-value ${!blocked ? "editable" : ""}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        begin();
      }}
      title={blocked ? "Giá trị tổng hợp tự động" : "Nhấp đúp để sửa"}
    >
      {children}
    </span>
  );
}
