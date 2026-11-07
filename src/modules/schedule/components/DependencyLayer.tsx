import { memo } from "react";
import type { Dependency, ScheduledTask } from "../engine/types";
import {
  barPosition,
  ROW,
  timelineLeft,
  timelineShift,
  type TimelineGeometry,
} from "./scheduleShared";

/**
 * SVG connectors for links that touch the rendered row range. Links whose
 * both ends are outside [firstIndex, lastIndex] on the same side are skipped.
 */
export const DependencyLayer = memo(function DependencyLayer({
  dependencies,
  indexById,
  byId,
  geometry,
  firstIndex,
  lastIndex,
  showCritical,
  timelineWidth,
  height,
}: {
  dependencies: Dependency[];
  indexById: Map<string, number>;
  byId: Map<string, ScheduledTask>;
  geometry: TimelineGeometry;
  /** Rendered row range; -1 when nothing is rendered. */
  firstIndex: number;
  lastIndex: number;
  showCritical: boolean;
  timelineWidth: number;
  height: number;
}) {
  return (
    <div className="dependency-clip" style={{ left: timelineLeft }}>
      <svg
        width={timelineWidth}
        height={Math.max(height, 1)}
        style={{ transform: timelineShift }}
        aria-hidden="true"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 6 6"
            refX="5"
            refY="3"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0 0L6 3L0 6Z" fill="var(--planner-baseline)" />
          </marker>
          <marker
            id="critical-arrow"
            viewBox="0 0 6 6"
            refX="5"
            refY="3"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0 0L6 3L0 6Z" fill="var(--planner-critical)" />
          </marker>
        </defs>
        {firstIndex >= 0 &&
          dependencies.map((link) => {
            const fromIndex = indexById.get(link.predecessorId),
              toIndex = indexById.get(link.successorId);
            if (fromIndex === undefined || toIndex === undefined) return null;
            if (
              Math.max(fromIndex, toIndex) < firstIndex ||
              Math.min(fromIndex, toIndex) > lastIndex
            )
              return null;
            const a = byId.get(link.predecessorId)!,
              b = byId.get(link.successorId)!,
              ap = barPosition(a, geometry),
              bp = barPosition(b, geometry);
            const fromFinish = link.type[0] === "F",
              toFinish = link.type[1] === "F",
              x1 = ap.x + (fromFinish ? ap.width : 0),
              x2 = bp.x + (toFinish ? bp.width : 0),
              y1 = fromIndex * ROW + 18,
              y2 = toIndex * ROW + 18;
            const out = x1 + (fromFinish ? 9 : -9),
              into = x2 + (toFinish ? 9 : -9),
              middleY = y2 > y1 ? y2 - 14 : y2 + 14;
            const path = toFinish
              ? `M${x1},${y1} H${Math.max(out, into) + 8} V${y2} H${x2 + 1}`
              : x2 > out + 8
                ? `M${x1},${y1} H${out} V${y2} H${x2 - 1}`
                : `M${x1},${y1} H${out} V${middleY} H${into} V${y2} H${x2 - 1}`;
            const red = showCritical && a.isCritical && b.isCritical;
            return (
              <path
                key={link.id}
                d={path}
                fill="none"
                stroke={
                  red ? "var(--planner-critical)" : "var(--planner-baseline)"
                }
                strokeWidth="1.25"
                strokeLinejoin="round"
                markerEnd={`url(#${red ? "critical-arrow" : "arrow"})`}
                opacity="0.85"
              />
            );
          })}
      </svg>
    </div>
  );
});
