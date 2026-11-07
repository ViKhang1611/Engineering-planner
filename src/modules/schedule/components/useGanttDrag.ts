import { useCallback, useState } from "react";
import {
  addCalendarDays,
  nextWorkingDate,
  WorkingClock,
} from "../engine/schedulingEngine";
import type { ProjectInput, ScheduledTask } from "../engine/types";
import type { ScheduleProposal } from "./ScheduleDialogs";
import type { DragMode } from "./TaskRow";
import { dateLabel, number } from "./scheduleShared";

/**
 * Pointer drag on a Gantt bar: move proposes a new requested start, resize a
 * new duration. Nothing is committed until the proposal is confirmed.
 * `startDrag` reads the current plan and scale from its arguments, so it can
 * be called through a stable row action.
 */
export function useGanttDrag() {
  const [drag, setDrag] = useState<{
    id: string;
    mode: DragMode;
    delta: number;
  } | null>(null);
  const [proposal, setProposal] = useState<ScheduleProposal | null>(null);

  // Stable identity: only state setters are captured, so memoized rows can
  // receive it through one RowActions object.
  const startDrag = useCallback(function startDrag(
    event: React.PointerEvent,
    task: ScheduledTask,
    mode: DragMode,
    context: {
      project: ProjectInput;
      dayWidth: number;
      select: (id: string) => void;
    },
  ) {
    if (task.isSummary || (mode === "resize" && task.duration === 0)) return;
    event.stopPropagation();
    event.preventDefault();
    const { project, dayWidth } = context;
    context.select(task.id);
    const node = event.currentTarget as HTMLElement;
    node.setPointerCapture(event.pointerId);
    const originX = event.clientX;
    setDrag({ id: task.id, mode, delta: 0 });
    const move = (e: PointerEvent) =>
      setDrag({ id: task.id, mode, delta: e.clientX - originX });
    const cleanup = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cleanup);
      setDrag(null);
    };
    const up = (e: PointerEvent) => {
      cleanup();
      const deltaDays = Math.round((e.clientX - originX) / dayWidth);
      if (!deltaDays) return;
      if (mode === "move") {
        const requestedStartDate = nextWorkingDate(
          addCalendarDays(task.startDate, deltaDays),
          project.calendar,
        );
        setProposal({
          id: task.id,
          patch: { requestedStartDate },
          description: `Đặt “${task.name}” không bắt đầu trước ${dateLabel(requestedStartDate)}. Các liên kết có thể đẩy ngày bắt đầu muộn hơn.`,
        });
      } else {
        const clock = new WorkingClock(project.startDate, project.calendar),
          end = nextWorkingDate(
            addCalendarDays(task.endDate, deltaDays),
            project.calendar,
          );
        const duration = Math.max(
          0.125,
          (clock.startOf(end) + 480 - task.earlyStart) / 480,
        );
        setProposal({
          id: task.id,
          patch: { duration },
          description: `Đổi thời lượng “${task.name}” thành ${number(duration)} ngày công. Toàn bộ công việc phụ thuộc sẽ được tính lại.`,
        });
      }
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", cleanup);
  }, []);

  return { drag, startDrag, proposal, setProposal };
}
