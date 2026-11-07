import { useState } from "react";
import {
  ArrowUpRight,
  Copy,
  FolderKanban,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { projectSummary } from "../../store/selectors";
import { Modal } from "../../shared/ui/Modal";
import { ProjectSettingsForm } from "../../shared/ui/ProjectSettingsForm";
import { CreativeHeroBanner } from "../../shared/ui/CreativeHeroBanner";

export function PortfolioWorkspace() {
  const state = useWorkspaceStore((s) => s);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const onlyOne = state.projectOrder.length <= 1;
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
      <CreativeHeroBanner
        badgeCode="PF"
        title="Không gian điều phối đa dự án"
        description="Quản lý tập trung toàn bộ tiến độ WBS, biểu đồ Gantt, nguồn lực kỹ thuật, nghiệm thu FAT/SAT và hồ sơ baseline trong giao diện kính mờ hiện đại."
        primaryActionLabel="Khởi tạo dự án mới"
        onPrimaryAction={() => {
          state.clearActionError();
          setCreating(true);
        }}
        secondaryMeta={`Đang quản lý ${state.projectOrder.length} dự án độc lập`}
      />
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
                  <td className="portfolio-actions">
                    <button
                      className="icon-button"
                      aria-label={`Mở thiết lập ${p.name}`}
                      title="Mở thiết lập"
                      onClick={() => {
                        state.switchProject(p.id);
                        state.navigate("settings");
                      }}
                    >
                      <ArrowUpRight size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Nhân bản ${p.name}`}
                      title="Nhân bản dự án"
                      onClick={() => state.duplicateProject(p.id)}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      className="icon-button danger-icon"
                      aria-label={`Xóa ${p.name}`}
                      title={
                        onlyOne ? "Không thể xóa dự án cuối cùng" : "Xóa dự án"
                      }
                      disabled={onlyOne}
                      onClick={() => {
                        state.clearActionError();
                        setDeleting(p.id);
                      }}
                    >
                      <Trash2 size={15} />
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
      <div className="creative-plan-section" aria-hidden="true">
        <div className="creative-section-title">Thẻ dự án nhanh</div>
        <div className="creative-cards-grid">
          {rows.map((session, idx) => {
            const p = session.project,
              summary = projectSummary(session),
              tones = ["kpi-tile-indigo", "kpi-tile-pink", "kpi-tile-emerald"],
              code =
                p.contractCode?.slice(0, 2).toUpperCase() ||
                p.name.slice(0, 2).toUpperCase();
            return (
              <div key={p.id} className="creative-app-card">
                <div className="creative-card-top">
                  <span
                    className={`kpi-app-badge ${tones[idx % tones.length]}`}
                  >
                    {code}
                  </span>
                  <strong>{p.name}</strong>
                </div>
                <p>
                  {p.client || "Dự án kỹ thuật"} · {summary.leafCount} công việc
                  lá · Kết thúc {summary.finishDate}
                </p>
                <div className="creative-card-foot">
                  <span className="status-dot-pill">
                    <i /> {summary.physicalPct.toFixed(1)}% hoàn thành
                  </span>
                  <span
                    className="pill-open-tag"
                    onClick={() => {
                      state.switchProject(p.id);
                      state.navigate("schedule");
                    }}
                  >
                    Mở WBS
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {deleting && state.projects[deleting] && (
        <Modal title="Xóa dự án?" close={() => setDeleting(null)}>
          <p>
            Xóa vĩnh viễn{" "}
            <strong>{state.projects[deleting].project.name}</strong> cùng WBS,
            liên kết, baseline và lịch sử tiến độ trên thiết bị này. Không thể
            hoàn tác.
          </p>
          <p className="info-box">
            Nếu cần giữ lại, mở dự án rồi xuất JSON ở Dữ liệu & Báo cáo trước
            khi xóa.
          </p>
          {state.actionError && (
            <p role="alert" className="inline-error">
              {state.actionError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              className="secondary-button"
              onClick={() => setDeleting(null)}
            >
              Hủy
            </button>
            <button
              className="danger-button"
              onClick={() => {
                if (state.deleteProject(deleting)) setDeleting(null);
              }}
            >
              <Trash2 size={15} />
              Xóa vĩnh viễn
            </button>
          </div>
        </Modal>
      )}
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
