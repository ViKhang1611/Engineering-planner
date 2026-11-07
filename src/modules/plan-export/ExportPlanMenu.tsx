import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { useTheme } from "../../theme/ThemeProvider";
import { Modal } from "../../shared/ui/Modal";
import { download } from "../data/serialization";
import { inlineAttachments } from "../../infrastructure/persistence/attachmentStore";
import {
  planRange,
  timelineColumns,
  safeFilename,
  type ExportOptions,
  type ExportJob,
} from "./model";
export function ExportPlanMenu() {
  const state = useProjectStore(),
    { theme } = useTheme(),
    [open, setOpen] = useState(false),
    [options, setOptions] = useState<ExportOptions | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [percent, setPercent] = useState(0),
    ref = useRef<HTMLDivElement>(null),
    worker = useRef<Worker | null>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      worker.current?.terminate();
    };
  }, []);
  const close = useCallback(() => {
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setOptions(null);
    setError("");
  }, []);
  useEffect(() => {
    close();
  }, [state.project.id, close]);
  const snapshot = {
      project: state.project,
      result: state.result,
      baseline: state.baseline,
      theme,
      exportedAt: new Date().toISOString(),
    },
    range = planRange(snapshot),
    columns = timelineColumns(range.start, range.end, options?.scale ?? "day");
  const start = async () => {
    if (!options) return;
    setBusy(true);
    setError("");
    setMessage("Đang chuẩn bị kế hoạch…");
    setPercent(0);
    try {
      // XLSX includes Project Data for round-trip, so it needs file bytes.
      const project =
        options.format === "xlsx"
          ? (await inlineAttachments(snapshot.project)).project
          : snapshot.project;
      const job: ExportJob = {
        snapshot: structuredClone({ ...snapshot, project }),
        options,
      };
      const w = new Worker(new URL("./export.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = w;
      w.onmessage = ({ data }) => {
        if (data.type === "progress") {
          setMessage(data.message);
          setPercent(
            data.total ? Math.round((data.completed / data.total) * 100) : 0,
          );
        } else if (data.type === "error") {
          setError(data.message);
          setBusy(false);
          w.terminate();
          worker.current = null;
        } else if (data.type === "done") {
          const format = job.options.format;
          download(
            new Blob([data.buffer], {
              type:
                format === "pdf"
                  ? "application/pdf"
                  : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }),
            `${safeFilename(job.snapshot.project.name)}_Gantt_${job.snapshot.exportedAt.slice(0, 10)}.${format}`,
          );
          setBusy(false);
          setMessage("Đã tải kế hoạch thành công.");
          w.terminate();
          worker.current = null;
        }
      };
      w.onerror = () => {
        setError("Không chạy được bộ xuất file. Tải lại trang và thử lại.");
        setBusy(false);
        w.terminate();
        worker.current = null;
      };
      w.postMessage(job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không khởi tạo được bộ xuất");
      setBusy(false);
    }
  };
  return (
    <div className="export-plan-menu" ref={ref}>
      <button
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {" "}
        <Download size={14} /> Xuất Kế hoạch <ChevronDown size={12} />
      </button>
      {open && (
        <div
          role="menu"
          className="export-dropdown"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          {(["xlsx", "pdf"] as const).map((format) => (
            <button
              key={format}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setOptions({ format, paper: "a4", scale: "day" });
                setMessage("");
                setError("");
              }}
            >
              {format === "xlsx"
                ? "Excel .xlsx · WBS + Gantt"
                : "PDF · A4/A3 ngang + Gantt"}
            </button>
          ))}
        </div>
      )}
      {options && (
        <Modal
          title={
            options.format === "pdf"
              ? "Xuất kế hoạch PDF"
              : "Xuất kế hoạch Excel"
          }
          close={close}
        >
          <div className="export-form">
            <p>
              <strong>{state.project.name}</strong>
            </p>
            <p>
              Toàn bộ {state.result.tasks.length} dòng · {range.start} →{" "}
              {range.end}. Bao gồm các nhánh đang thu gọn và các dòng ngoài vùng
              cuộn.
            </p>
            <label>
              Khổ giấy
              <select
                disabled={busy}
                value={options.paper}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    paper: e.target.value as ExportOptions["paper"],
                  })
                }
              >
                <option value="a4">A4 ngang</option>
                <option value="a3">A3 ngang</option>
              </select>
            </label>
            <label>
              Đơn vị timeline
              <select
                disabled={busy}
                value={options.scale}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    scale: e.target.value as ExportOptions["scale"],
                  })
                }
              >
                <option value="day">Ngày</option>
                <option value="week">Tuần</option>
                <option value="month">Tháng</option>
              </select>
            </label>
            <p className="muted">
              {columns.length} cột thời gian ·{" "}
              {state.baseline?.name ?? "Chưa chốt baseline"}. PDF tự chia trang,
              giữ đầy đủ bảng và timeline. Kế hoạch dài nên dùng tuần/tháng.
            </p>
            {message && (
              <div className="export-status" role="status">
                {message}
                {busy && (
                  <progress
                    aria-label="Tiến trình xuất kế hoạch"
                    max={100}
                    value={percent}
                  />
                )}
              </div>
            )}
            {error && (
              <p className="error-box" role="alert">
                {error}
              </p>
            )}
            <div className="action-row">
              <button className="secondary-button" onClick={close}>
                {busy ? "Hủy xuất" : "Đóng"}
              </button>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void start()}
              >
                {busy ? "Đang xuất…" : `Tải ${options.format.toUpperCase()}`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
