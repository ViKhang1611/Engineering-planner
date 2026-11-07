import { memo } from "react";
import {
  dateLabel,
  gridShift,
  HEADER,
  paneWidth,
  timelineLeft,
  timelineShift,
  type Column,
  type Zoom,
} from "./scheduleShared";

/** A calendar day column currently inside the horizontal viewport. */
export interface TimelineDay {
  index: number;
  date: string;
  off: boolean;
}

/** Sticky header: WBS column labels plus month/day labels of the timeline. */
export const ScheduleHeader = memo(function ScheduleHeader({
  days,
  lastDay,
  dayWidth,
  timelineWidth,
  zoom,
  statusDate,
  columns,
  gridWidth,
}: {
  columns: readonly Column[];
  gridWidth: number;
  days: TimelineDay[];
  lastDay: number;
  dayWidth: number;
  timelineWidth: number;
  zoom: Zoom;
  statusDate: string;
}) {
  const months = days.filter(
    (day, index) =>
      index === 0 || day.date.slice(0, 7) !== days[index - 1].date.slice(0, 7),
  );
  return (
    <div className="dual-header" style={{ height: HEADER }}>
      <div className="grid-header-clip" style={{ width: paneWidth }}>
        <div style={{ width: gridWidth, transform: gridShift }}>
          <div className="header-top">
            <span>WORK BREAKDOWN STRUCTURE</span>
            <span className="text-slate-400 font-normal">
              Nhấp đúp ô để sửa
            </span>
          </div>
          <div className="flex h-7">
            {columns.map((column) => (
              <div
                key={column.key}
                className={`column-label ${column.key === "name" ? "" : "numeric"}`}
                style={{ width: column.width }}
              >
                {column.label}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="timeline-header-clip" style={{ left: timelineLeft }}>
        <div
          className="relative h-14"
          style={{ width: timelineWidth, transform: timelineShift }}
        >
          {months.map((day, index) => (
            <div
              key={day.date}
              className="month-label"
              style={{
                left: day.index * dayWidth,
                width:
                  ((months[index + 1]?.index ?? lastDay) - day.index) *
                  dayWidth,
              }}
            >
              Tháng {Number(day.date.slice(5, 7))}, {day.date.slice(0, 4)}
            </div>
          ))}
          <div className="absolute left-0 top-7 h-7">
            {days.map((day) => {
              const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
              return (
                <div
                  key={day.date}
                  className={`day-label ${day.off ? "off-day" : ""} ${day.date === statusDate ? "report-day" : ""}`}
                  style={{ left: day.index * dayWidth, width: dayWidth }}
                  title={dateLabel(day.date)}
                >
                  {zoom === "day" ? (
                    <>
                      {parseInt(day.date.slice(8), 10)}
                      <small>{weekday === 0 ? "CN" : `T${weekday + 1}`}</small>
                    </>
                  ) : zoom === "week" ? (
                    day.date.slice(8)
                  ) : day.index % 7 === 0 ? (
                    day.date.slice(8)
                  ) : (
                    ""
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

/** Off-day shading and the status-date line behind the Gantt lanes. */
export const TimelineBackground = memo(function TimelineBackground({
  days,
  dayWidth,
  timelineWidth,
  todayX,
  statusDate,
}: {
  days: TimelineDay[];
  dayWidth: number;
  timelineWidth: number;
  todayX: number;
  statusDate: string;
}) {
  return (
    <div className="timeline-background" style={{ left: timelineLeft }}>
      <div
        className="relative h-full"
        style={{ width: timelineWidth, transform: timelineShift }}
      >
        {days.map((day) => (
          <div
            key={day.date}
            className={`background-day ${day.off ? "off-day" : ""}`}
            style={{ left: day.index * dayWidth, width: dayWidth }}
          />
        ))}
        <div
          className="today-line"
          style={{ left: todayX }}
          title={`Ngày báo cáo: ${dateLabel(statusDate)}`}
        />
      </div>
    </div>
  );
});
