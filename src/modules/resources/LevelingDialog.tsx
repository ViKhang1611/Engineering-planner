import { useMemo } from "react";
import { Modal } from "../../shared/ui/Modal";
import type { ProjectInput } from "../../domain/project";
import { suggestLeveling } from "../../domain/leveling";

const dmy = (value: string) =>
  `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;

/**
 * Preview of the leveling heuristic: which tasks would be delayed and how
 * the finish date moves. "Áp dụng" commits all start constraints at once.
 */
export function LevelingDialog({
  project,
  apply,
  close,
}: {
  project: ProjectInput;
  apply: (changes: { taskId: string; toStart: string }[]) => boolean;
  close: () => void;
}) {
  const suggestion = useMemo(() => suggestLeveling(project), [project]);
  const { changes } = suggestion;
  return (
    <Modal title="Gợi ý giãn lịch theo nguồn lực" close={close}>
      <p className="leading-6 text-slate-600 mb-3">
        Xếp lại từng công việc theo thứ tự phụ thuộc (ưu tiên việc bắt đầu sớm,
        ít dự trữ) vào thời điểm sớm nhất mà kỹ sư/thiết bị còn đủ công suất,
        bằng cách đặt “bắt đầu sớm nhất”. Công việc chỉ bị dời muộn hơn, không
        bao giờ sớm hơn. Có thể hoàn tác sau khi áp dụng.
      </p>
      <dl className="leveling-summary">
        <div>
          <dt>Ô quá tải</dt>
          <dd className="numeric">
            {suggestion.overloadsBefore} → {suggestion.overloadsAfter}
          </dd>
        </div>
        <div>
          <dt>Kết thúc dự án</dt>
          <dd className="numeric">
            {dmy(suggestion.finishBefore)} → {dmy(suggestion.finishAfter)}
          </dd>
        </div>
        <div>
          <dt>Công việc bị dời</dt>
          <dd className="numeric">{changes.length}</dd>
        </div>
      </dl>
      {changes.length > 0 ? (
        <div className="leveling-table-wrap">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Công việc</th>
                <th>Bắt đầu hiện tại</th>
                <th>Bắt đầu sớm nhất mới</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.taskId}>
                  <td title={c.name}>{c.name}</td>
                  <td className="numeric">{dmy(c.fromStart)}</td>
                  <td className="numeric">{dmy(c.toStart)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="info-box">Không tìm được công việc nào có thể dời.</p>
      )}
      {suggestion.unresolvable.length > 0 && (
        <p className="info-box mt-3">
          {suggestion.unresolvable.length} ô quá tải do một công việc vượt công
          suất ngay cả khi làm một mình. Giảm tỷ lệ phân bổ hoặc tăng công suất
          nguồn lực trong chi tiết công việc.
        </p>
      )}
      {suggestion.truncated && (
        <p className="info-box mt-3">
          Dừng sau giới hạn số vòng tính. Áp dụng rồi chạy lại để xử lý phần còn
          lại.
        </p>
      )}
      <div className="flex justify-end gap-2 mt-4">
        <button className="secondary-button" onClick={close}>
          Hủy
        </button>
        <button
          className="primary-button"
          disabled={!changes.length}
          onClick={() => {
            if (apply(changes)) close();
          }}
        >
          Áp dụng {changes.length} thay đổi
        </button>
      </div>
    </Modal>
  );
}
