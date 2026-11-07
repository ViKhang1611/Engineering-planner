import { useState } from "react";
import { CalendarDays, Check, Flag, Link2 } from "lucide-react";
import { Modal } from "../../../shared/ui/Modal";
import {
  CalendarFields,
  calendarDraft,
  calendarFromDraft,
  splitDates,
} from "../../../shared/ui/CalendarFields";
import type {
  Baseline,
  Calendar,
  Dependency,
  DependencyType,
  ScheduledTask,
  Task,
} from "../engine/types";

/** Create a dependency between two leaf tasks. Form state lives here. */
export function LinkDialog({
  leaves,
  initialPredecessor,
  initialSuccessor,
  onSubmit,
  close,
}: {
  leaves: ScheduledTask[];
  initialPredecessor: string;
  initialSuccessor: string;
  onSubmit: (link: Omit<Dependency, "id">) => boolean;
  close: () => void;
}) {
  const [predecessor, setPredecessor] = useState(initialPredecessor),
    [successor, setSuccessor] = useState(initialSuccessor),
    [linkType, setLinkType] = useState<DependencyType>("FS"),
    [lag, setLag] = useState("0");
  return (
    <Modal title="Liên kết công việc" close={close}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            onSubmit({
              predecessorId: predecessor,
              successorId: successor,
              type: linkType,
              lagDays: Number(lag),
            })
          )
            close();
        }}
      >
        <label className="field">
          Công việc trước
          <select
            aria-label="Công việc trước"
            value={predecessor}
            onChange={(event) => setPredecessor(event.target.value)}
          >
            {leaves.map((task) => (
              <option value={task.id} key={task.id}>
                {task.wbs} · {task.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Công việc sau
          <select
            aria-label="Công việc sau"
            value={successor}
            onChange={(event) => setSuccessor(event.target.value)}
          >
            {leaves.map((task) => (
              <option value={task.id} key={task.id}>
                {task.wbs} · {task.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            Loại liên kết
            <select
              value={linkType}
              onChange={(event) =>
                setLinkType(event.target.value as DependencyType)
              }
            >
              <option value="FS">FS · Kết thúc → Bắt đầu</option>
              <option value="SS">SS · Bắt đầu → Bắt đầu</option>
              <option value="FF">FF · Kết thúc → Kết thúc</option>
              <option value="SF">SF · Bắt đầu → Kết thúc</option>
            </select>
          </label>
          <label className="field">
            Lead / lag (ngày công)
            <input
              type="number"
              required
              step="0.125"
              value={lag}
              onChange={(event) => setLag(event.target.value)}
            />
          </label>
        </div>
        <p className="info-box">
          Lag dương tạo độ trễ; lag âm cho phép đi trước. Công việc sau được
          tính theo tất cả tiền nhiệm. Ctrl/Cmd+click chọn hai dòng trước khi mở
          hộp thoại.
        </p>
        <button type="submit" className="primary-button w-full">
          <Link2 size={15} />
          Tạo liên kết & tính lịch
        </button>
      </form>
    </Modal>
  );
}

export interface CalendarValues {
  startDate: string;
  statusDate: string;
  calendar: Calendar;
}

/** Project start, status date and the working calendar. Starts from saved values. */
export function CalendarDialog({
  initial,
  onSubmit,
  close,
}: {
  initial: CalendarValues;
  onSubmit: (values: CalendarValues) => boolean;
  close: () => void;
}) {
  const [projectStart, setProjectStart] = useState(initial.startDate),
    [statusDate, setStatusDate] = useState(initial.statusDate),
    [holidays, setHolidays] = useState(initial.calendar.holidays.join(", ")),
    [calendar, setCalendar] = useState(() => calendarDraft(initial.calendar));
  return (
    <Modal title="Lịch & ngày báo cáo" close={close}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            onSubmit({
              startDate: projectStart,
              statusDate,
              calendar: {
                ...calendarFromDraft(calendar),
                holidays: splitDates(holidays),
              },
            })
          )
            close();
        }}
      >
        <label className="field">
          Ngày bắt đầu dự án
          <input
            type="date"
            required
            value={projectStart}
            onChange={(event) => setProjectStart(event.target.value)}
          />
        </label>
        <label className="field">
          Ngày báo cáo
          <input
            type="date"
            required
            value={statusDate}
            onChange={(event) => setStatusDate(event.target.value)}
          />
        </label>
        <CalendarFields value={calendar} onChange={setCalendar} />
        <label className="field">
          Ngày lễ (yyyy-MM-dd, phân cách dấu phẩy)
          <textarea
            rows={3}
            placeholder="2026-10-20, 2026-10-21"
            value={holidays}
            onChange={(event) => setHolidays(event.target.value)}
          />
        </label>
        <p className="info-box">
          Mỗi ngày làm việc gồm hai ca 4 giờ. Ngày lễ luôn nghỉ, kể cả khi trùng
          ngày làm bù. Múi giờ Asia/Ho_Chi_Minh. Ngày báo cáo là cuối ngày; vạch
          hồng trên Gantt biểu diễn ngày báo cáo.
        </p>
        <button className="primary-button w-full" type="submit">
          <CalendarDays size={15} />
          Lưu lịch & tính lại
        </button>
      </form>
    </Modal>
  );
}

export function BaselineDialog({
  taskCount,
  baselines,
  activeId,
  onSelect,
  onCapture,
  close,
}: {
  taskCount: number;
  baselines: Baseline[];
  activeId: string;
  onSelect: (id: string) => void;
  onCapture: () => void;
  close: () => void;
}) {
  return (
    <Modal title="Chốt Baseline" close={close}>
      <p className="text-slate-600 leading-6 mb-4">
        Chụp ngày bắt đầu, kết thúc, thời lượng, công sức và Physical % của{" "}
        {taskCount} công việc. Bản chụp giữ nguyên khi lịch hiện hành thay đổi.
      </p>
      <label>
        Baseline đối chiếu
        <select value={activeId} onChange={(e) => onSelect(e.target.value)}>
          {baselines.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} · {new Date(b.createdAt).toLocaleString("vi-VN")}
            </option>
          ))}
        </select>
      </label>
      <p className="info-box mb-4">
        Mỗi lần chốt tạo một bản mới. Các bản trước được giữ nguyên.
      </p>
      <button className="primary-button w-full" onClick={onCapture}>
        <Flag size={15} />
        Xác nhận chốt Baseline
      </button>
    </Modal>
  );
}

export function LoadDialog({
  onLoadLarge,
  onReset,
  close,
}: {
  onLoadLarge: () => void;
  onReset: () => void;
  close: () => void;
}) {
  return (
    <Modal title="Dữ liệu kiểm chứng hiệu năng" close={close}>
      <p className="text-slate-600 leading-6 mb-4">
        Nạp 5.000 dòng gồm 50 nhóm WBS và 4.950 công việc lá. Dữ liệu hiện tại
        được đưa vào lịch sử hoàn tác. Đây là bộ dữ liệu thao tác thử; không có
        liên kết trong bộ này. Hãy xuất JSON nếu cần lưu riêng.
      </p>
      <div className="flex gap-2">
        <button className="primary-button flex-1" onClick={onLoadLarge}>
          Nạp 5.000 task
        </button>
        <button className="secondary-button flex-1" onClick={onReset}>
          Khôi phục dự án mẫu
        </button>
      </div>
    </Modal>
  );
}

export function HelpDialog({ close }: { close: () => void }) {
  return (
    <Modal title="Thao tác với ForgePlan" close={close}>
      <div className="space-y-3 text-slate-600 leading-6">
        <p>
          <strong>Chỉnh dữ liệu:</strong> nhấp đúp tên, thời lượng, ngày bắt đầu
          hoặc Physical %. Enter lưu, Escape hủy. Nhấp đúp dòng để mở bảng chi
          tiết.
        </p>
        <p>
          <strong>Gantt:</strong> kéo thanh để đề xuất ngày bắt đầu; kéo mép
          phải đổi thời lượng. Xem thông tin thay đổi rồi xác nhận. Ctrl+Z hoàn
          tác.
        </p>
        <p>
          <strong>WBS:</strong> chọn dòng rồi thụt/nhô lề. Mũi tên trái/phải thu
          gọn/mở nhóm. Mũi tên lên/xuống chuyển dòng đã chọn; Enter mở chi tiết.
        </p>
        <p>
          <strong>Cuộn:</strong> cuộn dọc dùng chung hai vùng; dùng thanh cuộn
          dưới mỗi vùng hoặc Shift+cuộn để di chuyển ngang.
        </p>
        <p>
          <strong>Tiến độ:</strong> màu đậm là khối lượng nghiệm thu; vạch xanh
          trời dưới đáy là thời gian kế hoạch đã trôi qua đến ngày báo cáo.
        </p>
        <p className="info-box">
          Bản ứng dụng một trình duyệt, chưa có máy chủ, đăng nhập hay đồng bộ
          nhiều người. CPM chưa xét giới hạn nguồn lực; cảnh báo không tự san
          bằng lịch.
        </p>
      </div>
    </Modal>
  );
}

export interface ScheduleProposal {
  id: string;
  patch: Partial<Task>;
  description: string;
}

/** Confirmation for a Gantt drag before it is committed. */
export function ProposalDialog({
  proposal,
  onConfirm,
  close,
}: {
  proposal: ScheduleProposal;
  onConfirm: () => void;
  close: () => void;
}) {
  return (
    <Modal title="Xem trước thay đổi lịch" close={close}>
      <p className="leading-6 text-slate-600 mb-4">{proposal.description}</p>
      <p className="info-box mb-4">
        Lưu sẽ kiểm tra vòng lặp, tính lại tiến độ, đường găng và quá tải. Nếu
        dữ liệu không hợp lệ, lịch đang lưu được giữ nguyên.
      </p>
      <div className="flex justify-end gap-2">
        <button className="secondary-button" onClick={close}>
          Hủy
        </button>
        <button className="primary-button" onClick={onConfirm}>
          <Check size={15} />
          Lưu thay đổi
        </button>
      </div>
    </Modal>
  );
}
