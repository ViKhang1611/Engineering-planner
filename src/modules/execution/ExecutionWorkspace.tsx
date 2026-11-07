import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useProjectStore } from "../../store/useProjectStore";
import {
  DEFAULT_EXECUTION_RULES,
  statuses,
  taskStatus,
  transition,
  type ExecutionStatus,
} from "../../domain/execution";
import type { ExecutionRules, ScheduledTask } from "../../domain/project";
import { TaskDetailDrawer } from "../../shared/ui/TaskDetailDrawer";
function Column({
  status,
  tasks,
  open,
  move,
}: {
  status: ExecutionStatus;
  tasks: ScheduledTask[];
  open: (id: string) => void;
  move: (id: string, s: ExecutionStatus) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    virtual = useVirtualizer({
      count: tasks.length,
      getScrollElement: () => ref.current,
      estimateSize: () => 158,
      overscan: 3,
    });
  return (
    <section
      className={`kanban-column ${status}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("application/forgeplan-task");
        if (id) move(id, status);
      }}
    >
      <h3>
        {statuses[status]} <span>{tasks.length}</span>
      </h3>
      <div ref={ref} className="kanban-scroll">
        <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map((row) => {
            const t = tasks[row.index];
            return (
              <article
                key={t.id}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData("application/forgeplan-task", t.id)
                }
                className="kanban-card"
                style={{
                  position: "absolute",
                  top: row.start,
                  left: 0,
                  right: 0,
                  height: 148,
                }}
              >
                <button className="card-title" onClick={() => open(t.id)}>
                  <small>
                    {t.wbs} {t.isCritical && "· Đường găng"}
                  </small>
                  <strong>{t.name}</strong>
                </button>
                <div className="card-meta">
                  {t.endDate} · {t.milestoneType ?? `${t.duration} ngày`}
                </div>
                <progress max={100} value={t.physicalPct} />
                <div className="card-meta">
                  <span>Physical {t.physicalPct}%</span>
                  <select
                    aria-label={`Trạng thái ${t.name}`}
                    value={status}
                    onChange={(e) =>
                      move(t.id, e.target.value as ExecutionStatus)
                    }
                  >
                    {Object.entries(statuses).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            );
          })}
        </div>
        {!tasks.length && <p className="muted">Kéo công việc vào đây</p>}
      </div>
    </section>
  );
}
/** Per-project Physical % used when manual-progress cards are dragged. */
function ExecutionRulesBar({
  rules,
  save,
}: {
  rules: ExecutionRules;
  save: (rules: ExecutionRules) => boolean;
}) {
  const [active, setActive] = useState(String(rules.activeMinPct)),
    [review, setReview] = useState(String(rules.reviewPct));
  const dirty =
    Number(active) !== rules.activeMinPct || Number(review) !== rules.reviewPct;
  return (
    <form
      className="execution-rules"
      onSubmit={(e) => {
        e.preventDefault();
        save({ activeMinPct: Number(active), reviewPct: Number(review) });
      }}
    >
      <span>Khi kéo thẻ nhập tay:</span>
      <label>
        Đang thi công tối thiểu
        <input
          type="number"
          min={1}
          max={99}
          required
          value={active}
          onChange={(e) => setActive(e.target.value)}
        />
        %
      </label>
      <label>
        Chờ nghiệm thu
        <input
          type="number"
          min={1}
          max={99}
          required
          value={review}
          onChange={(e) => setReview(e.target.value)}
        />
        %
      </label>
      <button className="secondary-button" disabled={!dirty}>
        Lưu tỷ lệ
      </button>
      <small>Thẻ đo theo checklist dùng % của checklist.</small>
    </form>
  );
}
export function ExecutionWorkspace() {
  const state = useProjectStore(),
    [search, setSearch] = useState(""),
    [resource, setResource] = useState(""),
    [editor, setEditor] = useState<string | null>(null);
  const tasks = state.result.tasks.filter(
    (t) =>
      !t.isSummary &&
      t.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (!resource || t.assignments.some((a) => a.resourceId === resource)),
  );
  const task = state.result.tasks.find((t) => t.id === editor);
  const move = (id: string, status: ExecutionStatus) => {
    state.commit((p) => {
      const t = p.tasks.find((t) => t.id === id);
      if (!t) throw new Error("Công việc không tồn tại");
      transition(t, status, p.statusDate, p.executionRules);
    }, `Đã chuyển sang ${statuses[status]}`);
  };
  return (
    <div className="enterprise-module">
      <div className="module-toolbar">
        <div>
          <h2>Thi công & nghiệm thu</h2>
          <p>
            Kéo thả hoặc chọn trạng thái. Hoàn thành sẽ đánh dấu toàn bộ
            checklist và nghiệm thu.
          </p>
        </div>
        <input
          aria-label="Tìm công việc Kanban"
          placeholder="Tìm công việc…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Lọc nguồn lực"
          value={resource}
          onChange={(e) => setResource(e.target.value)}
        >
          <option value="">Tất cả nguồn lực</option>
          {state.project.resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      {state.error && (
        <p role="alert" className="error-box">
          {state.error}
        </p>
      )}
      <ExecutionRulesBar
        rules={state.project.executionRules ?? DEFAULT_EXECUTION_RULES}
        save={(rules) =>
          state.commit((p) => {
            p.executionRules = rules;
          }, "Đã lưu tỷ lệ khi kéo thả Kanban")
        }
      />
      <div className="kanban-board">
        {(Object.keys(statuses) as ExecutionStatus[]).map((status) => (
          <Column
            key={status}
            status={status}
            tasks={tasks.filter((t) => taskStatus(t) === status)}
            open={setEditor}
            move={move}
          />
        ))}
      </div>
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
