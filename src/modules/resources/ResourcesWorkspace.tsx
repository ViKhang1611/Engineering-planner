import { useMemo, useState, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useProjectStore } from "../../store/useProjectStore";
import type { Resource } from "../../domain/project";
import { TaskDetailDrawer } from "../../shared/ui/TaskDetailDrawer";
import { Modal } from "../../shared/ui/Modal";
import {
  addCalendarDays,
  isWorkingDay,
  WorkingClock,
} from "../schedule/engine/schedulingEngine";
export function ResourcesWorkspace() {
  const state = useProjectStore(),
    [start, setStart] = useState(state.project.statusDate),
    [editor, setEditor] = useState<string | null>(null),
    [resource, setResource] = useState<Resource | null>(null),
    [expanded, setExpanded] = useState(new Set<string>()),
    [cell, setCell] = useState<{ resourceId: string; date: string } | null>(
      null,
    );
  const clock = useMemo(
    () => new WorkingClock(state.project.startDate, state.project.calendar),
    [state.project.startDate, state.project.calendar],
  );
  const dates = Array.from({ length: 14 }, (_, i) => addCalendarDays(start, i));
  const days = useMemo(
    () =>
      new Map(
        state.result.resourceDays.map((d) => [`${d.resourceId}/${d.date}`, d]),
      ),
    [state.result],
  );
  const rows = state.project.resources.flatMap((r) => [
    {
      id: r.id,
      resource: r,
      task: undefined as (typeof state.result.tasks)[number] | undefined,
    },
    ...(expanded.has(r.id)
      ? state.result.tasks
          .filter(
            (t) =>
              !t.isSummary && t.assignments.some((a) => a.resourceId === r.id),
          )
          .map((t) => ({ id: `${r.id}/${t.id}`, resource: r, task: t }))
      : []),
  ]);
  const ref = useRef<HTMLDivElement>(null),
    virtual = useVirtualizer({
      count: rows.length,
      getScrollElement: () => ref.current,
      estimateSize: () => 36,
      overscan: 5,
    });
  const task = state.result.tasks.find((t) => t.id === editor),
    detail = cell ? days.get(`${cell.resourceId}/${cell.date}`) : undefined;
  return (
    <div className="enterprise-module">
      <div className="module-toolbar">
        <div>
          <h2>Nguồn lực & phân bổ công việc</h2>
          <p>
            {state.result.overloads.length} ô quá tải · Chỉ cảnh báo, không tự
            dời lịch
          </p>
        </div>
        <button onClick={() => setStart(addCalendarDays(start, -14))}>
          ← 14 ngày
        </button>
        <input
          aria-label="Bắt đầu heatmap"
          type="date"
          value={start}
          onChange={(e) => {
            if (e.target.value) setStart(e.target.value);
          }}
        />
        <button onClick={() => setStart(addCalendarDays(start, 14))}>
          14 ngày →
        </button>
        <button
          className="primary-button"
          onClick={() =>
            setResource({
              id: crypto.randomUUID(),
              name: "Nguồn lực mới",
              kind: "engineer",
              capacityHours: 8,
            })
          }
        >
          + Nguồn lực
        </button>
      </div>
      {state.error && (
        <p className="error-box" role="alert">
          {state.error}
        </p>
      )}
      <div className="heatmap-scroll" ref={ref}>
        <div style={{ minWidth: 1350 }}>
          <div className="heatmap-row heatmap-head">
            <div>Nguồn lực / Công việc</div>
            {dates.map((d) => (
              <div
                key={d}
                className={
                  !isWorkingDay(d, state.project.calendar) ? "nonworking" : ""
                }
              >
                {d.slice(8)}/{d.slice(5, 7)}
              </div>
            ))}
          </div>
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {virtual.getVirtualItems().map((v) => {
              const row = rows[v.index],
                r = row.resource;
              return (
                <div
                  className="heatmap-row"
                  key={row.id}
                  style={{
                    position: "absolute",
                    top: v.start,
                    width: "100%",
                    height: 36,
                  }}
                >
                  <div>
                    {row.task ? (
                      <button
                        className="heatmap-task"
                        onClick={() => setEditor(row.task!.id)}
                      >
                        {row.task.wbs} {row.task.name}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() =>
                            setExpanded((old) => {
                              const next = new Set(old);
                              if (next.has(r.id)) next.delete(r.id);
                              else next.add(r.id);
                              return next;
                            })
                          }
                        >
                          {expanded.has(r.id) ? "▾" : "▸"}
                        </button>
                        <button onClick={() => setResource(structuredClone(r))}>
                          {r.name}
                        </button>
                        <small>
                          {r.kind === "material"
                            ? "Vật tư"
                            : `${r.capacityHours}h`}
                        </small>
                      </>
                    )}
                  </div>
                  {dates.map((date) => {
                    const d = days.get(`${r.id}/${date}`);
                    let hours = d?.hours ?? 0;
                    if (row.task) {
                      const t = row.task,
                        a = t.assignments.find((a) => a.resourceId === r.id)!;
                      hours = d?.taskIds.includes(t.id)
                        ? (Math.max(
                            0,
                            Math.min(t.earlyFinish, clock.startOf(date) + 480) -
                              Math.max(t.earlyStart, clock.startOf(date)),
                          ) /
                            60) *
                          a.units
                        : 0;
                    }
                    let quantity = 0;
                    if (r.kind === "material") {
                      const tasks = row.task ? [row.task] : state.result.tasks;
                      quantity = tasks
                        .filter((t) => !t.isSummary && t.startDate === date)
                        .reduce((n, t) => {
                          const a = t.assignments.find(
                            (a) => a.resourceId === r.id,
                          );
                          return n + (a ? (a.quantity ?? 1) : 0);
                        }, 0);
                    }
                    return (
                      <button
                        key={date}
                        className={`${!isWorkingDay(date, state.project.calendar) ? "nonworking" : ""} ${!row.task && hours > r.capacityHours ? "overloaded" : ""}`}
                        onClick={() => {
                          if (d) setCell({ resourceId: r.id, date });
                        }}
                      >
                        {r.kind === "material"
                          ? quantity
                            ? `${quantity} đv`
                            : "·"
                          : hours
                            ? `${Number(hours.toFixed(2))}h`
                            : "·"}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="conflict-panel">
        <h3>Xung đột nguồn lực</h3>
        {state.result.overloads.length ? (
          state.result.overloads.slice(0, 100).map((d) => (
            <button
              key={`${d.resourceId}/${d.date}`}
              onClick={() => setCell(d)}
            >
              {state.project.resources.find((r) => r.id === d.resourceId)?.name}{" "}
              · {d.date}:{" "}
              <b>
                {d.hours.toFixed(1)}h / {d.capacityHours}h
              </b>{" "}
              · {d.taskIds.length} công việc
            </button>
          ))
        ) : (
          <p>Không có ngày vượt công suất đã cấu hình.</p>
        )}
        {state.result.overloads.length > 100 && (
          <p>Đang liệt kê 100 xung đột đầu tiên; xem theo ngày trên lưới.</p>
        )}
      </div>
      {resource && (
        <Modal title="Danh mục nguồn lực" close={() => setResource(null)}>
          <div className="form-grid">
            <label className="full">
              Tên
              <input
                value={resource.name}
                onChange={(e) =>
                  setResource({ ...resource, name: e.target.value })
                }
              />
            </label>
            <label>
              Loại
              <select
                value={resource.kind}
                onChange={(e) =>
                  setResource({
                    ...resource,
                    kind: e.target.value as Resource["kind"],
                  })
                }
              >
                <option value="engineer">Kỹ sư · Work</option>
                <option value="equipment">Thiết bị</option>
                <option value="material">Vật tư</option>
              </select>
            </label>
            <label>
              Công suất giờ/ngày
              <input
                type="number"
                min="0.01"
                max="24"
                step="0.5"
                value={resource.capacityHours}
                onChange={(e) =>
                  setResource({
                    ...resource,
                    capacityHours: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          {state.error && <p role="alert">{state.error}</p>}
          <div className="action-row">
            <button
              onClick={() => {
                if (
                  state.commit((p) => {
                    if (
                      p.tasks.some((t) =>
                        t.assignments.some((a) => a.resourceId === resource.id),
                      )
                    )
                      throw new Error("Gỡ phân bổ trước khi xóa nguồn lực");
                    p.resources = p.resources.filter(
                      (r) => r.id !== resource.id,
                    );
                  }, "Đã xóa nguồn lực")
                )
                  setResource(null);
              }}
            >
              Xóa nguồn lực
            </button>
            <button
              className="primary-button"
              onClick={() => {
                if (
                  state.commit((p) => {
                    const index = p.resources.findIndex(
                      (r) => r.id === resource.id,
                    );
                    if (index < 0) p.resources.push(resource);
                    else p.resources[index] = resource;
                  }, "Đã lưu nguồn lực")
                )
                  setResource(null);
              }}
            >
              Lưu nguồn lực
            </button>
          </div>
        </Modal>
      )}
      {cell && (
        <Modal title={`Phân bổ ngày ${cell.date}`} close={() => setCell(null)}>
          <p>
            {detail?.hours.toFixed(2)}h / {detail?.capacityHours}h
          </p>
          {detail?.taskIds.map((id) => (
            <button
              className="conflict-task"
              key={id}
              onClick={() => {
                setCell(null);
                setEditor(id);
              }}
            >
              {state.result.tasks.find((t) => t.id === id)?.name} → Điều chỉnh
              phân bổ
            </button>
          ))}
        </Modal>
      )}
      {task && (
        <TaskDetailDrawer
          key={task.id}
          task={task}
          close={() => setEditor(null)}
        />
      )}
    </div>
  );
}
