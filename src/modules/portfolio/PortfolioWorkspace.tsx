import { useState } from "react";
import { ArrowUpRight, FolderKanban, Plus, Search } from "lucide-react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { projectSummary } from "../../store/selectors";
import { Modal } from "../../shared/ui/Modal";
import { ProjectSettingsForm } from "../../shared/ui/ProjectSettingsForm";

export function PortfolioWorkspace() {
  const state = useWorkspaceStore((s) => s);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const rows = state.projectOrder
    .map((id) => state.projects[id])
    .filter(({ project }) =>
      `${project.name} ${project.contractCode ?? ""} ${project.client ?? ""}`
        .toLocaleLowerCase("vi-VN")
        .includes(query.toLocaleLowerCase("vi-VN")),
    );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return (
    <section className="module-page" aria-label="Danh mục dự án">
      <div className="module-page-heading">
        <div>
          <div className="eyebrow">ENGINEERING PORTFOLIO</div>
          <h2>Danh mục dự án</h2>
          <p>
            Mỗi dự án có WBS, lịch làm việc, nguồn lực và lịch sử chỉnh sửa
            riêng.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            state.clearActionError();
            setCreating(true);
          }}
        >
          <Plus size={16} />
          Tạo dự án
        </button>
      </div>
      <div className="portfolio-toolbar">
        <div className="search-box">
          <Search size={15} />
          <input
            aria-label="Tìm dự án"
            placeholder="Tìm dự án, hợp đồng, chủ đầu tư…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="numeric">
          {rows.length} / {state.projectOrder.length} dự án
        </span>
      </div>
      <div className="data-table-wrap">
        <table className="enterprise-table">
          <thead>
            <tr>
              <th>Dự án</th>
              <th>Chủ đầu tư</th>
              <th>Bắt đầu</th>
              <th>Kết thúc dự kiến</th>
              <th>Công việc</th>
              <th>Physical %</th>
              <th>Baseline</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((session) => {
              const p = session.project,
                summary = projectSummary(session);
              return (
                <tr
                  key={p.id}
                  className={
                    state.activeProjectId === p.id ? "portfolio-active" : ""
                  }
                >
                  <td>
                    <button
                      className="project-link"
                      onClick={() => {
                        state.switchProject(p.id);
                        state.navigate("schedule");
                      }}
                    >
                      <FolderKanban size={15} />
                      <span title={p.name}>{p.name}</span>
                    </button>
                  </td>
                  <td title={p.client}>{p.client || "—"}</td>
                  <td className="numeric">{p.startDate}</td>
                  <td className="numeric">{summary.finishDate}</td>
                  <td className="numeric">{summary.leafCount}</td>
                  <td className="numeric">
                    <span className="portfolio-progress">
                      <i style={{ width: `${summary.physicalPct}%` }} />
                    </span>
                    {summary.physicalPct.toFixed(1)}%
                  </td>
                  <td className="numeric" title={summary.baselineName}>
                    {summary.baselineName}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Mở thiết lập ${p.name}`}
                      onClick={() => {
                        state.switchProject(p.id);
                        state.navigate("settings");
                      }}
                    >
                      <ArrowUpRight size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-module">Không tìm thấy dự án phù hợp.</div>
        )}
      </div>
      <p className="module-note">
        Khối lượng nghiệm thu được tổng hợp từ các công việc lá, theo trọng số
        thời lượng.
      </p>
      {creating && (
        <Modal
          title="Tạo dự án kỹ thuật"
          close={() => {
            setCreating(false);
            state.clearActionError();
          }}
        >
          <ProjectSettingsForm
            initial={{
              name: "",
              contractCode: "",
              client: "",
              startDate: today,
              statusDate: today,
              holidays: [],
            }}
            submitLabel="Tạo và mở dự án"
            onSubmit={(input) => !!state.createProject(input)}
          />
          {state.actionError && (
            <p role="alert" className="inline-error">
              {state.actionError}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
