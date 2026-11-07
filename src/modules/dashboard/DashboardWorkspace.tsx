import { useMemo, useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { overallProgress } from "../../domain/execution";
import { earnedValue, plannedFraction } from "../../domain/analytics";
import {
  WorkingClock,
  addCalendarDays,
  calendarDaysBetween,
} from "../schedule/engine/schedulingEngine";
import { TaskDetailDrawer } from "../../shared/ui/TaskDetailDrawer";
import { CreativeHeroBanner } from "../../shared/ui/CreativeHeroBanner";
const number = (n: number) =>
  n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
export function DashboardWorkspace() {
  const state = useProjectStore(),
    { project, result } = state,
    [editor, setEditor] = useState<string | null>(null),
    [threshold, setThreshold] = useState(20),
    [warningPage, setWarningPage] = useState(0);
  const leaves = useMemo(
      () => result.tasks.filter((t) => !t.isSummary),
      [result],
    ),
    task = result.tasks.find((t) => t.id === editor),
    evm = earnedValue(project, result);
  const overloaded = new Set(
    result.overloads
      .filter(
        (d) =>
          project.resources.find((r) => r.id === d.resourceId)?.kind ===
          "engineer",
      )
      .map((d) => d.resourceId),
  );
  const milestones = leaves.filter(
    (t) =>
      (t.duration === 0 || t.milestoneType) &&
      t.physicalPct < 100 &&
      t.endDate >= project.statusDate &&
      t.endDate <= addCalendarDays(project.statusDate, 14),
  );
  const warnings = leaves.filter(
      (t) => t.durationPct - t.physicalPct > threshold,
    ),
    pageIndex = Math.min(
      warningPage,
      Math.max(0, Math.ceil(warnings.length / 50) - 1),
    );
  const curve = useMemo(() => {
    const baseline = state.baseline,
      from = [
        project.startDate,
        ...(baseline?.tasks.map((t) => t.startDate) ?? []),
      ].sort()[0],
      to = [
        result.finishDate,
        project.statusDate,
        ...(baseline?.tasks.map((t) => t.endDate) ?? []),
      ]
        .sort()
        .at(-1)!;
    const range = Math.max(1, calendarDaysBetween(from, to)),
      clock = new WorkingClock(from, project.calendar),
      baseClock = new WorkingClock(
        from,
        baseline?.calendar ?? project.calendar,
      );
    const weights = leaves.reduce(
      (n, t) => n + (t.progressWeight ?? Math.max(1, t.duration)),
      0,
    );
    const samples = Array.from({ length: Math.min(100, range) + 1 }, (_, i) =>
      addCalendarDays(from, Math.round((i * range) / Math.min(100, range))),
    );
    const current = samples.map((date) =>
      weights
        ? leaves.reduce(
            (n, t) =>
              n +
              (t.progressWeight ?? Math.max(1, t.duration)) *
                plannedFraction(t, date, clock) *
                100,
            0,
          ) / weights
        : 0,
    );
    const currentById = new Map(result.tasks.map((t) => [t.id, t]));
    const baselineLeaves =
      baseline?.tasks.filter(
        (t) => !(t.isSummary ?? currentById.get(t.id)?.isSummary),
      ) ?? [];
    const baseWeight = baselineLeaves.reduce(
      (n, t) => n + (t.progressWeight ?? Math.max(1, t.duration)),
      0,
    );
    const base = samples.map((date) =>
      baseWeight
        ? baselineLeaves.reduce(
            (n, b) =>
              n +
              (b.progressWeight ?? Math.max(1, b.duration)) *
                plannedFraction(b, date, baseClock) *
                100,
            0,
          ) / baseWeight
        : 0,
    );
    const path = (values: number[]) =>
      values
        .map(
          (v, i) =>
            `${i ? "L" : "M"}${50 + (i / (values.length - 1)) * 850},${230 - v * 2}`,
        )
        .join(" ");
    const observations = (project.progressHistory ?? []).filter(
      (p) => p.date >= from && p.date <= project.statusDate,
    );
    const actual = observations
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${50 + (calendarDaysBetween(from, p.date) / range) * 850},${230 - p.physicalPct * 2}`,
      )
      .join(" ");
    return {
      from,
      to,
      current: path(current),
      base: baseline ? path(base) : "",
      actual,
      observations,
      range,
    };
  }, [project, result, leaves, state.baseline]);
  return (
    <div className="enterprise-module dashboard">
      <div className="module-toolbar">
        <div>
          <h2>Dashboard điều hành</h2>
          <p>
            {project.name} · Ngày báo cáo {project.statusDate}
          </p>
        </div>
        <button
          className="pill-action-button"
          onClick={() =>
            state.commit(() => {}, "Đã ghi nhận tiến độ tại ngày báo cáo")
          }
        >
          Ghi nhận tiến độ hôm báo cáo
        </button>
      </div>
      <CreativeHeroBanner
        badgeCode="FP"
        title={project.name}
        description={`Tiến độ khối lượng đạt ${number(overallProgress(result.tasks))}% so với kế hoạch ${number(overallProgress(result.tasks, true))}% tại ngày báo cáo ${project.statusDate}. Theo dõi đường cong S-Curve, EVM và các mốc nghiệm thu quan trọng.`}
        primaryActionLabel="Chốt điểm tiến độ ngay"
        onPrimaryAction={() =>
          state.commit(() => {}, "Đã ghi nhận tiến độ tại ngày báo cáo")
        }
        secondaryMeta={`${leaves.length} công việc lá · ${milestones.length} mốc trong 14 ngày`}
      />
      <div className="kpi-grid">
        {[
          [
            "Ph",
            "Physical thực tế",
            `${number(overallProgress(result.tasks))}%`,
            "kpi-tile-pink",
          ],
          [
            "Du",
            "Duration kế hoạch",
            `${number(overallProgress(result.tasks, true))}%`,
            "kpi-tile-indigo",
          ],
          [
            "Cp",
            "Đường găng bị trễ",
            leaves.filter(
              (t) =>
                t.isCritical &&
                t.endDate < project.statusDate &&
                t.physicalPct < 100,
            ).length,
            "kpi-tile-rose",
          ],
          ["Rs", "Kỹ sư quá tải", overloaded.size, "kpi-tile-amber"],
          [
            "Ms",
            "Mốc sắp tới · 14 ngày",
            milestones.length,
            "kpi-tile-emerald",
          ],
        ].map(([code, label, value, tone]) => (
          <div key={label} className="kpi">
            <div className="kpi-head">
              <span className={`kpi-app-badge ${tone}`} aria-hidden="true">
                {code}
              </span>
              <small>{label}</small>
            </div>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h3>S-Curve · Tiến độ lũy kế</h3>
          <div className="chart-legend">
            <span style={{ color: "var(--planner-baseline)" }}>
              ● {state.baseline?.name ?? "Chưa chốt baseline"}
            </span>
            <span style={{ color: "var(--planner-task)" }}>
              ● Kế hoạch hiện tại
            </span>
            <span style={{ color: "var(--planner-success)" }}>
              ● Physical thực tế
            </span>
          </div>
        </div>
        <svg
          viewBox="0 0 940 270"
          role="img"
          aria-label="Đường cong kế hoạch và khối lượng thực tế"
        >
          {[0, 25, 50, 75, 100].map((n) => (
            <g key={n}>
              <line
                x1="50"
                x2="900"
                y1={230 - n * 2}
                y2={230 - n * 2}
                stroke="var(--border-default)"
              />
              <text x="10" y={234 - n * 2}>
                {n}%
              </text>
            </g>
          ))}
          <path
            d={curve.base}
            stroke="var(--planner-baseline)"
            strokeWidth="3"
            fill="none"
            strokeDasharray="5 4"
          />
          <path
            d={curve.current}
            stroke="var(--planner-task)"
            strokeWidth="3"
            fill="none"
          />
          <path
            d={curve.actual}
            stroke="var(--planner-success)"
            strokeWidth="3"
            fill="none"
          />
          {curve.observations.map((p) => (
            <circle
              key={p.date}
              cx={
                50 +
                (calendarDaysBetween(curve.from, p.date) / curve.range) * 850
              }
              cy={230 - p.physicalPct * 2}
              r="4"
              fill="var(--planner-success)"
            >
              <title>
                {p.date}: {number(p.physicalPct)}%
              </title>
            </circle>
          ))}
          <text x="50" y="260">
            {curve.from}
          </text>
          <text x="810" y="260">
            {curve.to}
          </text>
        </svg>
        <p className="muted">
          Physical thực tế chỉ hiển thị các lần ghi nhận, không suy diễn lịch
          sử. Baseline giữ phạm vi và trọng số tại thời điểm chốt; thay đổi phạm
          vi có thể làm hai đường khác nhau.
        </p>
      </section>
      <section className="panel">
        <h3>Earned Value Management · VND</h3>
        {evm.BAC ? (
          <div className="metric-grid">
            {Object.entries(evm).map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <b>{v === null ? "—" : number(v)}</b>
              </div>
            ))}
          </div>
        ) : (
          <p>
            Nhập ngân sách và chi phí thực tế trong chi tiết công việc để tính
            PV, EV, AC, SPI và CPI.
          </p>
        )}
        <p className="muted">
          SV = EV − PV (giá trị tiền); độ lệch lịch theo ngày nằm ở cột Variance
          của WBS.
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h3>Cảnh báo sớm</h3>
          <label>
            Ngưỡng lệch (điểm %){" "}
            <input
              type="number"
              min="0"
              max="100"
              value={threshold}
              onChange={(e) =>
                setThreshold(Math.max(0, Math.min(100, Number(e.target.value))))
              }
            />
          </label>
        </div>
        <table className="enterprise-table">
          <thead>
            <tr>
              <th>WBS</th>
              <th>Công việc</th>
              <th>Duration %</th>
              <th>Physical %</th>
              <th>Chênh lệch</th>
            </tr>
          </thead>
          <tbody>
            {warnings.slice(pageIndex * 50, (pageIndex + 1) * 50).map((t) => (
              <tr key={t.id} onClick={() => setEditor(t.id)}>
                <td>{t.wbs}</td>
                <td>
                  <button>{t.name}</button>
                </td>
                <td>{number(t.durationPct)}%</td>
                <td>{number(t.physicalPct)}%</td>
                <td className="danger">
                  {number(t.durationPct - t.physicalPct)} pp
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="action-row">
          <span>
            {warnings.length} cảnh báo · Trang {pageIndex + 1}/
            {Math.max(1, Math.ceil(warnings.length / 50))}
          </span>
          <button
            disabled={pageIndex === 0}
            onClick={() => setWarningPage(pageIndex - 1)}
          >
            Trước
          </button>
          <button
            disabled={(pageIndex + 1) * 50 >= warnings.length}
            onClick={() => setWarningPage(pageIndex + 1)}
          >
            Sau
          </button>
        </div>
      </section>
      <section className="panel">
        <h3>Cột mốc sắp tới</h3>
        {milestones.length ? (
          milestones.map((t) => (
            <button
              className="conflict-task"
              key={t.id}
              onClick={() => setEditor(t.id)}
            >
              {t.wbs} · {t.name} · {t.endDate} ·{" "}
              {t.milestoneType ?? "Milestone"}
            </button>
          ))
        ) : (
          <p>Không có mốc chưa hoàn tất trong 14 ngày tới.</p>
        )}
      </section>
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
