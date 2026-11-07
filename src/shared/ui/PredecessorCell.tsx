import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { workspaceStore } from "../../store/workspaceStore";
import { setPredecessors } from "../../domain/predecessors";
import type { ScheduledTask } from "../../domain/project";
export function PredecessorCell({
  task,
  value,
}: {
  task: ScheduledTask;
  value: string;
}) {
  // Only the stable commit action: this cell renders on every visible row, so
  // subscribing to the whole session would re-render all of them on any
  // selection change. Current tasks are read at save time instead.
  const commit = useProjectStore((s) => s.commit),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(value);
  if (!editing)
    return (
      <span
        className="truncate"
        tabIndex={0}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!task.isSummary) {
            setDraft(value.replace(/\s*d/g, ""));
            setEditing(true);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !task.isSummary) {
            setDraft(value);
            setEditing(true);
          }
        }}
      >
        {value || "—"}
      </span>
    );
  const save = () => {
    const { projects, activeProjectId } = workspaceStore.getState();
    const tasks = projects[activeProjectId].result.tasks;
    if (
      commit(
        (p) => setPredecessors(p, tasks, task.id, draft),
        "Đã cập nhật tiền nhiệm",
      )
    )
      setEditing(false);
  };
  return (
    <input
      autoFocus
      aria-label={`Tiền nhiệm ${task.wbs}`}
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") save();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
