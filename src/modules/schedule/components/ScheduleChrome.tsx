import { memo, useRef } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftToLine,
  ArrowRightToLine,
  CalendarDays,
  CircleHelp,
  Download,
  Flag,
  GitBranch,
  Layers,
  Link2,
  ListTree,
  Plus,
  Redo2,
  Search,
  Settings2,
  ShieldCheck,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { ToolButton } from "./ToolButton";
import { dateLabel, number, type Zoom } from "./scheduleShared";

/** Project title, dates and the three headline metrics. */
export const ScheduleHeading = memo(function ScheduleHeading({
  name,
  startDate,
  finishDate,
  physical,
  leafCount,
  rowCount,
  overloadedResources,
  onOpenCalendar,
}: {
  name: string;
  startDate: string;
  finishDate: string;
  physical: number;
  leafCount: number;
  rowCount: number;
  overloadedResources: number;
  onOpenCalendar: () => void;
}) {
  return (
    <section className="project-heading">
      <div className="min-w-0">
        <div className="eyebrow mb-1">KẾ HOẠCH TRIỂN KHAI · PHÒNG TỰ ĐỘNG HÓA</div>
        <h2 className="text-xl font-semibold tracking-tight truncate">{name}</h2>
        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <CalendarDays size={13} />
            {dateLabel(startDate)} — {dateLabel(finishDate)}
          </span>
          <span className="hidden lg:inline">
            T2–T7 · 08:00–12:00 / 13:00–17:00
          </span>
          <button
            className="text-indigo-600 hover:underline"
            onClick={onOpenCalendar}
          >
            Thiết lập lịch
          </button>
        </div>
      </div>
      <div className="project-metrics">
        <div>
          <span>KHỐI LƯỢNG NGHIỆM THU</span>
          <strong className="text-indigo-600">
            {number(physical)}
            <small>%</small>
          </strong>
          <div className="metric-track">
            <i style={{ width: `${physical}%` }} />
          </div>
        </div>
        <div>
          <span>CÔNG VIỆC</span>
          <strong>
            {leafCount}
            <small> / {rowCount} dòng</small>
          </strong>
        </div>
        <div>
          <span>NGUỒN LỰC QUÁ TẢI</span>
          <strong
            className={
              overloadedResources ? "text-red-600" : "text-emerald-600"
            }
          >
            {overloadedResources}
            <small> nguồn lực</small>
          </strong>
        </div>
      </div>
    </section>
  );
});

export interface CommandRibbonProps {
  hasSelection: boolean;
  canLink: boolean;
  hasBaseline: boolean;
  compare: boolean;
  critical: boolean;
  overloadOnly: boolean;
  zoom: Zoom;
  canUndo: boolean;
  canRedo: boolean;
  onAddTask: () => void;
  onIndent: (outdent: boolean) => void;
  onOpenLinks: () => void;
  onOpenBaseline: () => void;
  onToggleCompare: () => void;
  onToggleCritical: () => void;
  onToggleOverload: () => void;
  onZoom: (zoom: Zoom) => void;
  onUndo: () => void;
  onRedo: () => void;
}

/** Editing commands, view toggles, zoom and undo/redo. */
export function CommandRibbon(p: CommandRibbonProps) {
  return (
    <div className="command-ribbon h-12">
      <ToolButton icon={<Plus size={16} />} onClick={p.onAddTask}>
        Thêm Task
      </ToolButton>
      <ToolButton
        icon={<ArrowRightToLine size={16} />}
        onClick={() => p.onIndent(false)}
        disabled={!p.hasSelection}
        title="Thụt lề"
      >
        Thụt lề
      </ToolButton>
      <ToolButton
        icon={<ArrowLeftToLine size={16} />}
        onClick={() => p.onIndent(true)}
        disabled={!p.hasSelection}
      >
        Nhô lề
      </ToolButton>
      <ToolButton
        icon={<Link2 size={15} />}
        onClick={p.onOpenLinks}
        disabled={!p.canLink}
      >
        Liên kết FS
      </ToolButton>
      <i className="ribbon-divider" />
      <ToolButton icon={<Flag size={15} />} onClick={p.onOpenBaseline}>
        Chốt Baseline
      </ToolButton>
      <ToolButton
        active={p.compare}
        disabled={!p.hasBaseline}
        icon={<Layers size={15} />}
        onClick={p.onToggleCompare}
        title="So sánh baseline"
      >
        So sánh
      </ToolButton>
      <i className="ribbon-divider" />
      <button
        className="toggle-label"
        role="switch"
        aria-checked={p.critical}
        onClick={p.onToggleCritical}
      >
        <span className={`switch ${p.critical ? "switch-on" : ""}`} />
        <GitBranch size={14} className="text-rose-600" />
        Đường găng
      </button>
      <ToolButton
        active={p.overloadOnly}
        icon={<AlertTriangle size={15} />}
        onClick={p.onToggleOverload}
      >
        Quá tải
      </ToolButton>
      <div className="flex-1 min-w-1" />
      <div className="segmented" aria-label="Mức zoom">
        {(["day", "week", "month"] as const).map((value, i) => (
          <button
            key={value}
            aria-pressed={p.zoom === value}
            className={p.zoom === value ? "active" : ""}
            onClick={() => p.onZoom(value)}
          >
            {["Ngày", "Tuần", "Tháng"][i]}
          </button>
        ))}
      </div>
      <ToolButton
        icon={<Undo2 size={15} />}
        onClick={p.onUndo}
        disabled={!p.canUndo}
        title="Hoàn tác Ctrl+Z"
      />
      <ToolButton
        icon={<Redo2 size={15} />}
        onClick={p.onRedo}
        disabled={!p.canRedo}
        title="Làm lại Ctrl+Y"
      />
    </div>
  );
}

/** Search, detail/help buttons and JSON import/export. */
export function ViewRibbon({
  visibleCount,
  query,
  onQuery,
  detailsDisabled,
  onDetails,
  onHelp,
  onExport,
  onImport,
  onLoad,
}: {
  visibleCount: number;
  query: string;
  onQuery: (value: string) => void;
  detailsDisabled: boolean;
  onDetails: () => void;
  onHelp: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  onLoad: () => void;
}) {
  const importInput = useRef<HTMLInputElement>(null);
  return (
    <div className="view-ribbon">
      <div className="flex items-center gap-2 font-medium">
        <ListTree size={15} className="text-indigo-600" />
        WBS & Tiến độ<span className="count-chip">{visibleCount}</span>
      </div>
      <span className="text-slate-300 mx-3">|</span>
      <div className="search-box">
        <Search size={14} />
        <input
          aria-label="Tìm công việc"
          placeholder="Tìm tên hoặc mã WBS…"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        {query && (
          <button aria-label="Xóa tìm kiếm" onClick={() => onQuery("")}>
            <X size={12} />
          </button>
        )}
      </div>
      <div className="flex-1" />
      <button
        className="text-action"
        onClick={onDetails}
        disabled={detailsDisabled}
      >
        <Settings2 size={14} />
        Chi tiết
      </button>
      <button
        className="text-action"
        onClick={onHelp}
        aria-label="Hướng dẫn tiến độ"
      >
        <CircleHelp size={14} />
        Hướng dẫn
      </button>
      <button className="text-action" onClick={onExport}>
        <Download size={14} />
        Xuất JSON
      </button>
      <button
        className="text-action"
        onClick={() => importInput.current?.click()}
      >
        <Upload size={14} />
        Nhập
      </button>
      <button className="text-action" onClick={onLoad}>
        <Activity size={14} />
        5.000 task
      </button>
      <input
        ref={importInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (event) => {
          const input = event.target;
          const file = input.files?.[0];
          if (file) await onImport(file);
          input.value = "";
        }}
      />
    </div>
  );
}

/** Last action message, legend and engine timing. */
export const StatusBar = memo(function StatusBar({
  notice,
  elapsedMs,
  visibleCount,
}: {
  notice: string;
  elapsedMs: number;
  visibleCount: number;
}) {
  return (
    <footer className="status-bar">
      <span className="flex items-center gap-1.5 min-w-0 truncate">
        <ShieldCheck size={13} className="text-emerald-600" />
        {notice}
      </span>
      <span className="hidden md:flex items-center gap-3">
        <span className="legend-item">
          <i className="bg-indigo-600" />
          Physical
        </span>
        <span className="legend-item">
          <i className="bg-sky-500" />
          Duration
        </span>
        <span className="legend-item">
          <i className="bg-rose-600" />
          Đường găng
        </span>
        <span className="legend-item">
          <i className="bg-slate-400" />
          Baseline
        </span>
        <span className="legend-item">
          <i className="bg-amber-600 rotate-45" />
          Cột mốc
        </span>
      </span>
      <span className="numeric">
        {number(elapsedMs)}ms · {visibleCount.toLocaleString("vi-VN")} dòng ·
        36px
      </span>
    </footer>
  );
});
