import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import {
  useWorkspaceStore,
  workspaceDocument,
} from "../../store/workspaceStore";
import {
  persistenceMode,
  flushPersistence,
} from "../../infrastructure/persistence/indexedDbRepository";
import {
  download,
  toRows,
  encodeCsv,
  exportExcel,
  importFile,
} from "./serialization";
import type { ProjectInput } from "../../domain/project";
import {
  externalizeAttachments,
  externalizeDocument,
  inlineAttachments,
  inlineDocument,
  missingAttachmentsMessage,
} from "../../infrastructure/persistence/attachmentStore";
import { Modal } from "../../shared/ui/Modal";
export function DataWorkspace() {
  const state = useProjectStore(),
    workspace = useWorkspaceStore((s) => s),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [incoming, setIncoming] = useState<ProjectInput | null>(null),
    [reset, setReset] = useState(false),
    [message, setMessage] = useState(""),
    [backup, setBackup] = useState<unknown>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi xử lý dữ liệu");
    } finally {
      setBusy(false);
    }
  };
  const name = state.project.name.replace(/[^\p{L}\p{N}_-]+/gu, "_");
  /** Exports carry file bytes inline so they restore on any device. */
  const exportProject = (
    write: (project: ProjectInput) => Promise<Blob> | Blob,
    filename: string,
  ) =>
    run(async () => {
      const { project, missing } = await inlineAttachments(state.project);
      download(await write(project), filename);
      setMessage(missingAttachmentsMessage(missing));
    });
  const attachmentStats = state.project.tasks.reduce(
    (sum, task) => {
      for (const a of task.attachments ?? []) {
        sum.count++;
        sum.bytes += a.size;
      }
      return sum;
    },
    { count: 0, bytes: 0 },
  );
  return (
    <div className="enterprise-module data-page">
      <div className="module-toolbar">
        <div>
          <h2>Dữ liệu & báo cáo</h2>
          <p>Lưu độc lập trên thiết bị · Xuất định kỳ để có bản sao dự phòng</p>
        </div>
        <span>
          {persistenceMode} ·{" "}
          {workspace.saving
            ? "Đang lưu…"
            : workspace.persistenceError
              ? "Lưu thất bại"
              : "Đã lưu"}
        </span>
      </div>
      {(error || state.error) && (
        <p role="alert" className="error-box">
          {error || state.error}
        </p>
      )}
      {message && (
        <p role="status" className="info-box">
          {message}
        </p>
      )}
      <div className="data-grid">
        <section className="panel">
          <h3>Xuất dự án</h3>
          <p>
            {state.project.tasks.length} công việc ·{" "}
            {state.project.dependencies.length} liên kết ·{" "}
            {state.project.baselines?.length ?? 0} baseline ·{" "}
            {attachmentStats.count} tệp đính kèm (
            {(attachmentStats.bytes / 1024 / 1024).toFixed(1)} MB)
          </p>
          <p>
            JSON, CSV và Excel giữ nguyên WBS, tiền nhiệm, nguồn lực, checklist,
            baseline và tài liệu đính kèm.
          </p>
          <div className="action-row">
            <button
              disabled={busy}
              onClick={() =>
                exportProject(
                  (project) =>
                    new Blob(
                      [
                        JSON.stringify(
                          { format: "forgeplan-v2", project },
                          null,
                          2,
                        ),
                      ],
                      { type: "application/json" },
                    ),
                  `${name}.json`,
                )
              }
            >
              JSON
            </button>
            <button
              disabled={busy}
              onClick={() =>
                exportProject(
                  (project) =>
                    new Blob([encodeCsv(toRows(project))], {
                      type: "text/csv;charset=utf-8",
                    }),
                  `${name}.csv`,
                )
              }
            >
              CSV
            </button>
            <button
              disabled={busy}
              onClick={() => exportProject(exportExcel, `${name}.xlsx`)}
            >
              Excel .xlsx
            </button>
          </div>
          <p className="muted">
            Excel có WBS Report để đọc và Project Data để nhập lại nguyên vẹn.
            CSV là định dạng trao đổi bản ghi, không phải bảng WBS phẳng.
          </p>
        </section>
        <section className="panel">
          <h3>Nhập dự án</h3>
          <p>
            Kiểm tra toàn bộ dữ liệu và chu trình liên kết trước khi thay thế dự
            án đang mở. Các dự án khác được giữ nguyên.
          </p>
          <label className="file-picker">
            Chọn JSON / CSV / Excel
            <input
              disabled={busy}
              type="file"
              accept=".json,.csv,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void run(async () => setIncoming(await importFile(file)));
                e.target.value = "";
              }}
            />
          </label>
        </section>
        <section className="panel">
          <h3>Sao lưu workspace</h3>
          <p>{workspace.projectOrder.length} dự án trên thiết bị này.</p>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const { document, missing } = await inlineDocument(
                  workspaceDocument(workspace),
                );
                download(
                  new Blob([JSON.stringify(document, null, 2)], {
                    type: "application/json",
                  }),
                  "ForgePlan_Workspace_Backup.json",
                );
                setMessage(missingAttachmentsMessage(missing));
              })
            }
          >
            Tải bản sao toàn workspace
          </button>
          <label className="file-picker">
            Khôi phục bản sao workspace
            <input
              type="file"
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void run(async () => {
                    if (file.size > 50 * 1024 * 1024)
                      throw new Error("Tệp vượt 50 MB");
                    setBackup(JSON.parse(await file.text()));
                  });
                e.target.value = "";
              }}
            />
          </label>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await flushPersistence();
                if (workspace.persistenceError)
                  throw new Error(workspace.persistenceError);
                setMessage("Đã hoàn tất các giao dịch lưu dữ liệu.");
              })
            }
          >
            Kiểm tra lưu dữ liệu
          </button>
        </section>
        <section className="panel">
          <h3>Khôi phục dữ liệu mẫu</h3>
          <p>
            Thay nội dung dự án hiện tại bằng dự án kỹ thuật mẫu. Có thể hoàn
            tác trong phiên làm việc.
          </p>
          <button className="danger" onClick={() => setReset(true)}>
            Reset Demo Data
          </button>
        </section>
      </div>
      {backup !== null && (
        <Modal
          title="Khôi phục toàn bộ workspace"
          close={() => setBackup(null)}
        >
          <p>
            Thay thế toàn bộ danh mục dự án bằng bản sao đã chọn. Dữ liệu sẽ
            được kiểm tra trước khi thay thế.
          </p>
          {workspace.actionError && (
            <p role="alert" className="error-box">
              {workspace.actionError}
            </p>
          )}
          <button
            className="primary-button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                // Files move to the attachment store before the document is
                // validated; rejected restores leave orphans for start-up GC.
                if (
                  workspace.restoreWorkspace(await externalizeDocument(backup))
                ) {
                  setBackup(null);
                  setMessage("Đã khôi phục workspace.");
                }
              })
            }
          >
            Xác nhận khôi phục workspace
          </button>
        </Modal>
      )}
      {incoming && (
        <Modal title="Xác nhận nhập dự án" close={() => setIncoming(null)}>
          <p>
            <strong>{incoming.name}</strong>
          </p>
          <p>
            {incoming.tasks.length} công việc · {incoming.dependencies.length}{" "}
            liên kết · {incoming.baselines?.length ?? 0} baseline
          </p>
          <p>Dữ liệu đã qua kiểm tra cấu trúc và bộ máy lập lịch.</p>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                if (state.replace(await externalizeAttachments(incoming))) {
                  setIncoming(null);
                  setMessage(
                    "Đã nhập dự án. Các màn hình dùng ngay dữ liệu mới.",
                  );
                }
              })
            }
          >
            Thay thế dự án hiện tại
          </button>
        </Modal>
      )}
      {reset && (
        <Modal title="Khôi phục dữ liệu mẫu?" close={() => setReset(false)}>
          <p>Bạn nên xuất dự án trước khi thay thế.</p>
          <button
            className="primary-button"
            onClick={() => {
              state.reset();
              setReset(false);
              setMessage("Đã khôi phục dữ liệu mẫu.");
            }}
          >
            Xác nhận khôi phục
          </button>
        </Modal>
      )}
    </div>
  );
}
