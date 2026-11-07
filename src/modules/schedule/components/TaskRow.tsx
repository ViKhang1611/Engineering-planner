import { memo, type CSSProperties } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Users,
} from "lucide-react";
import { variance } from "../../../domain/execution";
import { calendarDaysBetween } from "../engine/schedulingEngine";
import { PredecessorCell } from "../../../shared/ui/PredecessorCell";
import type {
  BaselineTask,
  Calendar,
  Resource,
  ScheduledTask,
} from "../engine/types";
import { InlineCell } from "./InlineCell";
import { useIsHovered, type HoverStore } from "./hoverStore";
import {
  barPosition,
  dateLabel,
  gridShift,
  number,
  paneWidth,
  ROW,
  timelineLeft,
  timelineShift,
  type Column,
  type TimelineGeometry,
} from "./scheduleShared";

export type DragMode = "move" | "resize";
/** Stable callbacks shared by every row (identity never changes). */
export interface RowActions {
  select(id: string, multi: boolean): void;
  openEditor(id: string): void;
  toggle(id: string): void;
  keyDown(event: React.KeyboardEvent, index: number, task: ScheduledTask): void;
  startDrag(
    event: React.PointerEvent,
    task: ScheduledTask,
    mode: DragMode,
  ): void;
}

export interface TaskRowProps {
  task: ScheduledTask;
  index: number;
  top: number;
  chosen: boolean;
  focusable: boolean;
  collapsed: boolean;
  /** "Đường găng" toggle is on. */
  showCritical: boolean;
  compare: boolean;
  base: BaselineTask | undefined;
  varianceCalendar: Calendar;
  predecessors: string;
  resourceById: Map<string, Resource>;
  peaks: Map<string, number>;
  geometry: TimelineGeometry;
  timelineWidth: number;
  /** Only the row being dragged gets a value; others keep `null`. */
  drag: { mode: DragMode; delta: number } | null;
  hover: HoverStore;
  actions: RowActions;
  /** Visible WBS grid columns (stable array) and their total width. */
  columns: readonly Column[];
  gridWidth: number;
}

/**
 * One WBS row plus its Gantt lane. Memoized: it re-renders only when its own
 * task, selection, drag offset or the timeline scale change. Hover and
 * horizontal scroll do not pass through props (see hoverStore, CSS vars).
 */
export const TaskRow = memo(function TaskRow({
  task,
  index,
  top,
  chosen,
  focusable,
  collapsed,
  showCritical,
  compare,
  base,
  varianceCalendar,
  predecessors,
  resourceById,
  peaks,
  geometry,
  timelineWidth,
  drag,
  hover,
  actions,
  columns,
  gridWidth,
}: TaskRowProps) {
  const hovered = useIsHovered(hover, task.id);
  const highlighted = chosen || hovered,
    pos = barPosition(task, geometry),
    criticalTask = showCritical && task.isCritical;
  const rowStyle: CSSProperties = {
    height: ROW,
    transform: `translateY(${top}px)`,
  };
  return (
    <div
      role="row"
      aria-rowindex={index + 1}
      data-row-index={index}
      data-task-id={task.id}
      data-hovered={hovered}
      className={`virtual-row ${highlighted ? "row-highlight" : ""} ${chosen ? "row-selected" : ""} ${task.isSummary ? "summary-row" : ""}`}
      style={rowStyle}
      tabIndex={focusable ? 0 : -1}
      onMouseEnter={() => hover.set(task.id)}
      onMouseLeave={() => hover.set(null)}
      onClick={(event) => {
        actions.select(task.id, event.ctrlKey || event.metaKey);
        if (
          !event.ctrlKey &&
          !event.metaKey &&
          (event.target as HTMLElement).closest(
            '[data-column="wbs"],.tree-name',
          )
        )
          actions.openEditor(task.id);
      }}
      onDoubleClick={() => actions.openEditor(task.id)}
      onKeyDown={(event) => actions.keyDown(event, index, task)}
      aria-selected={chosen}
    >
      <div className="grid-row-clip" style={{ width: paneWidth }}>
        <div
          className="grid-cells"
          style={{ width: gridWidth, transform: gridShift }}
        >
          {columns.map((column) => (
            <div
              key={column.key}
              role="gridcell"
              data-column={column.key}
              className={`grid-cell ${column.key === "name" || column.key === "resources" ? "" : "numeric"}`}
              style={{ width: column.width }}
            >
              {column.key === "wbs" && (
                <span className="text-slate-400">{task.wbs}</span>
              )}
              {column.key === "name" && (
                <div
                  className="tree-name"
                  style={{ paddingLeft: Math.min(task.depth, 30) * 16 }}
                >
                  {task.depth > 0 && (
                    <span
                      className="tree-guide"
                      style={{ left: (Math.min(task.depth, 30) - 1) * 16 + 7 }}
                    />
                  )}
                  {task.isSummary ? (
                    <button
                      className="tree-chevron"
                      aria-label={`${collapsed ? "Mở" : "Thu gọn"} ${task.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        actions.toggle(task.id);
                      }}
                    >
                      {collapsed ? (
                        <ChevronRight size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  ) : (
                    <span
                      className={`task-type ${task.duration === 0 ? "milestone-type" : criticalTask ? "critical-type" : ""}`}
                    >
                      {task.duration === 0 ? (
                        "◆"
                      ) : criticalTask ? (
                        <GitBranch size={11} aria-label="Công việc găng" />
                      ) : (
                        "▪"
                      )}
                    </span>
                  )}
                  <InlineCell task={task} field="name">
                    {task.name}
                  </InlineCell>
                </div>
              )}
              {column.key === "duration" && (
                <InlineCell task={task} field="duration">
                  {number(task.duration)}d
                </InlineCell>
              )}
              {column.key === "startDate" && (
                <InlineCell task={task} field="startDate">
                  {dateLabel(task.startDate)}
                </InlineCell>
              )}
              {column.key === "endDate" && (
                <span title={task.finishAt}>{dateLabel(task.endDate)}</span>
              )}
              {column.key === "predecessors" && (
                <PredecessorCell task={task} value={predecessors} />
              )}
              {column.key === "variance" && (
                <span className="numeric">
                  {base
                    ? variance(task.endDate, base.endDate, varianceCalendar)
                    : "—"}
                </span>
              )}
              {column.key === "resources" && (
                <div className="flex items-center gap-1 overflow-hidden">
                  {task.assignments.map((assignment) => {
                    const resource = resourceById.get(assignment.resourceId)!,
                      overloaded = task.overloadedResourceIds.includes(
                        resource.id,
                      );
                    return (
                      <span
                        key={resource.id}
                        className={
                          overloaded
                            ? "resource-pill overloaded"
                            : "resource-pill"
                        }
                        title={
                          overloaded
                            ? `Cao điểm ${number(peaks.get(resource.id)!)}h/${resource.capacityHours}h/ngày. Mở chi tiết để sửa phân bổ.`
                            : `${resource.name} · ${Math.round(assignment.units * 100)}%`
                        }
                      >
                        {overloaded ? (
                          <AlertTriangle size={11} />
                        ) : (
                          <Users size={11} />
                        )}
                        {resource.name}
                        {overloaded
                          ? ` · ${number(peaks.get(resource.id)!)}h/${resource.capacityHours}h`
                          : ""}
                      </span>
                    );
                  })}
                  {!task.assignments.length && (
                    <span className="text-slate-300">—</span>
                  )}
                </div>
              )}
              {column.key === "physicalPct" && (
                <InlineCell task={task} field="physicalPct">
                  <span
                    className={
                      task.physicalPct === 100
                        ? "text-emerald-700"
                        : "text-indigo-700"
                    }
                  >
                    {number(task.physicalPct)}%
                  </span>
                </InlineCell>
              )}
              {column.key === "durationPct" && (
                <span className="text-sky-700">
                  {number(task.durationPct)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="gantt-row-clip" style={{ left: timelineLeft }}>
        <div
          className="relative h-full"
          style={{ width: timelineWidth, transform: timelineShift }}
        >
          {compare && base && <BaselineBar base={base} geometry={geometry} />}
          {task.isSummary ? (
            <div
              className="summary-bar"
              style={{ left: pos.x, width: Math.max(12, pos.width) }}
            >
              <i />
              <i />
            </div>
          ) : task.duration === 0 ? (
            <div
              className="milestone-hit"
              style={{ left: pos.x - 10 + (drag?.delta ?? 0) }}
              onPointerDown={(event) => actions.startDrag(event, task, "move")}
              title={`${task.name} · ${task.startAt}`}
            >
              <div
                className={`milestone ${chosen ? "milestone-selected" : ""}`}
              />
            </div>
          ) : (
            <div
              role="button"
              aria-label={`Thanh Gantt ${task.name}`}
              tabIndex={-1}
              className={`task-bar ${criticalTask ? "critical-bar" : ""} ${chosen ? "bar-selected" : ""} ${task.physicalPct === 100 && !criticalTask ? "complete-bar" : ""}`}
              style={{
                left: pos.x + (drag?.mode === "move" ? drag.delta : 0),
                width: Math.max(
                  5,
                  pos.width + (drag?.mode === "resize" ? drag.delta : 0),
                ),
              }}
              onPointerDown={(event) => actions.startDrag(event, task, "move")}
              title={`${task.name}\nPhysical ${number(task.physicalPct)}% · Duration ${number(task.durationPct)}%\n${task.startAt} → ${task.finishAt}\nFloat: ${number(task.totalFloat / 480)} ngày`}
            >
              <div
                className="physical-fill"
                style={{ width: `${task.physicalPct}%` }}
              />
              <span className="bar-caption">
                {pos.width > 70 ? `${number(task.physicalPct)}%` : ""}
              </span>
              <div
                className="duration-fill"
                style={{ width: `${task.durationPct}%` }}
              />
              <div
                className="resize-handle"
                title="Kéo đổi thời lượng"
                onPointerDown={(event) =>
                  actions.startDrag(event, task, "resize")
                }
              />
            </div>
          )}
          {task.deadline && (
            <span
              className={`deadline-marker ${task.deadlineMissed ? "deadline-missed" : ""}`}
              style={{
                left:
                  (calendarDaysBetween(geometry.start, task.deadline) + 1) *
                  geometry.dayWidth,
              }}
              title={`Hạn chót ${dateLabel(task.deadline)}${task.deadlineMissed ? " · đang trễ" : ""}`}
              aria-label={`Hạn chót ${dateLabel(task.deadline)}${task.deadlineMissed ? ", đang trễ" : ""}`}
            />
          )}
          {(pos.width > 20 || task.duration === 0) && (
            <span
              className={`gantt-label ${task.isSummary ? "font-semibold" : ""}`}
              style={{ left: pos.x + Math.max(0, pos.width) + 10 }}
            >
              {task.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

function BaselineBar({
  base,
  geometry,
}: {
  base: BaselineTask;
  geometry: TimelineGeometry;
}) {
  const pos = barPosition(base, geometry);
  return (
    <div
      className="baseline-bar"
      style={{
        left: pos.x,
        width: Math.max(base.duration === 0 ? 8 : 4, pos.width),
      }}
      title={`Baseline: ${dateLabel(base.startDate)} → ${dateLabel(base.endDate)}`}
    />
  );
}
