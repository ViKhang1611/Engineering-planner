import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { selectActiveProject } from "../../store/selectors";
import { ProjectSettingsForm } from "../../shared/ui/ProjectSettingsForm";
import { DeleteProjectDialog } from "../../shared/ui/DeleteProjectDialog";

export function ProjectSettings() {
  const session = useWorkspaceStore(selectActiveProject);
  const update = useWorkspaceStore((state) => state.updateSettings);
  const onlyOne = useWorkspaceStore((state) => state.projectOrder.length <= 1);
  const clearActionError = useWorkspaceStore((state) => state.clearActionError);
  const navigate = useWorkspaceStore((state) => state.navigate);
  const [deleting, setDeleting] = useState(false);
  const p = session.project;
  return (
    <section className="module-page settings-page" aria-label="Thiết lập dự án">
      <div className="module-page-heading">
        <div>
          <div className="eyebrow">THÔNG TIN CHUNG</div>
          <h2>Thiết lập dự án</h2>
          <p>Thông tin hợp đồng và lịch làm việc dùng chung cho mọi phân hệ.</p>
        </div>
        <span className="phase-badge">Lịch 8h/ngày</span>
      </div>
      <div className="settings-panel">
        <ProjectSettingsForm
          key={p.id}
          initial={{
            name: p.name,
            contractCode: p.contractCode ?? "",
            client: p.client ?? "",
            startDate: p.startDate,
            statusDate: p.statusDate,
            holidays: p.calendar.holidays,
            calendar: {
              workWeek: p.calendar.workWeek,
              extraWorkingDays: p.calendar.extraWorkingDays,
              shift: p.calendar.shift,
            },
          }}
          onSubmit={(input) => update(p.id, input)}
        />
      </div>
      <p className="module-note">
        Thay đổi lịch sẽ tính lại ngày công việc, CPM và tải nguồn lực. Baseline
        đã chốt được giữ nguyên. Có thể hoàn tác thay đổi tại màn hình Lập tiến
        độ.
      </p>
      <section className="settings-panel danger-zone" aria-label="Xóa dự án">
        <div>
          <h3>Xóa dự án</h3>
          <p>
            {onlyOne
              ? "Đây là dự án duy nhất trong workspace. Tạo hoặc nhập dự án khác trước khi xóa."
              : "Xóa vĩnh viễn dự án này cùng toàn bộ WBS, baseline và lịch sử tiến độ. Không thể hoàn tác."}
          </p>
        </div>
        <button
          className="danger-button"
          disabled={onlyOne}
          onClick={() => {
            clearActionError();
            setDeleting(true);
          }}
        >
          <Trash2 size={15} />
          Xóa dự án
        </button>
      </section>
      {deleting && (
        <DeleteProjectDialog
          projectId={p.id}
          close={() => setDeleting(false)}
          onDeleted={() => navigate("portfolio")}
        />
      )}
    </section>
  );
}
