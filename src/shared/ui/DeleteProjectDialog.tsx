import { Trash2 } from "lucide-react";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { Modal } from "./Modal";

/**
 * Confirms permanently deleting a project. Deleting is not undoable, so the
 * dialog names the project and points at JSON export first.
 */
export function DeleteProjectDialog({
  projectId,
  close,
  onDeleted,
}: {
  projectId: string;
  close: () => void;
  onDeleted?: () => void;
}) {
  const record = useWorkspaceStore((s) => s.projects[projectId]);
  const actionError = useWorkspaceStore((s) => s.actionError);
  const deleteProject = useWorkspaceStore((s) => s.deleteProject);
  if (!record) return null;
  const { project } = record;
  return (
    <Modal title="Xóa dự án?" close={close}>
      <p>
        Xóa vĩnh viễn <strong>{project.name}</strong> cùng{" "}
        {project.tasks.length} công việc, liên kết, baseline và lịch sử tiến độ
        trên thiết bị này. Không thể hoàn tác.
      </p>
      <p className="info-box">
        Nếu cần giữ lại, mở dự án rồi xuất JSON ở Dữ liệu & Báo cáo trước khi
        xóa.
      </p>
      {actionError && (
        <p role="alert" className="inline-error">
          {actionError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className="secondary-button" onClick={close}>
          Hủy
        </button>
        <button
          className="danger-button"
          onClick={() => {
            if (deleteProject(projectId)) {
              close();
              onDeleted?.();
            }
          }}
        >
          <Trash2 size={15} />
          Xóa vĩnh viễn
        </button>
      </div>
    </Modal>
  );
}
