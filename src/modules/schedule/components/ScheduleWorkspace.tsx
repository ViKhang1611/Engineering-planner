import { TaskDetailDrawer as TaskEditor } from "../../../shared/ui/TaskDetailDrawer";
import { variance } from "../../../domain/execution";
import { PredecessorCell } from "../../../shared/ui/PredecessorCell";
import { layout } from "../../../shared/designTokens";
import { projectSummary } from "../../../store/selectors";
import { Modal } from "../../../shared/ui/Modal";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  AlertTriangle,
  ArrowLeftToLine,
  ArrowRightToLine,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  Flag,
  FolderKanban,
  GitBranch,
  Layers,
  Link2,
  ListTree,
  Plus,
  Redo2,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Undo2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useProjectStore } from "../../../store/useProjectStore";
import {
  addCalendarDays,
  calendarDaysBetween,
  isWorkingDay,
  nextWorkingDate,
  WorkingClock,
} from "../engine/schedulingEngine";
import type {
  DependencyType,
  ProjectInput,
  ScheduledTask,
  Task,
} from "../engine/types";
const ROW = layout.rowHeight,
  HEADER = layout.timelineHeaderHeight;
const cols = [
  { key: "wbs", label: "WBS", width: 74 },
  { key: "name", label: "Tên công việc", width: 300 },
  { key: "duration", label: "Thời lượng", width: 84 },
  { key: "startDate", label: "Bắt đầu", width: 108 },
  { key: "endDate", label: "Kết thúc", width: 108 },
  { key: "predecessors", label: "Tiền nhiệm", width: 138 },
  { key: "resources", label: "Nguồn lực", width: 220 },
  { key: "physicalPct", label: "Physical %", width: 94 },
  { key: "durationPct", label: "Duration %", width: 94 },
  { key: "variance", label: "Variance (d)", width: 100 },
];
const GRID_WIDTH = cols.reduce((sum, column) => sum + column.width, 0);
const dateLabel = (value: string) =>
  `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
const number = (value: number) =>
  Number(value.toFixed(2)).toLocaleString("vi-VN");
function ToolButton({
  children,
  icon,
  onClick,
  disabled,
  active,
  title,
}: {
  children?: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`tool ${active ? "tool-active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon}
      {children && <span>{children}</span>}
    </button>
  );
}
function InlineCell({
  task,
  field,
  children,
}: {
  task: ScheduledTask;
  field: "name" | "duration" | "startDate" | "physicalPct";
  children: ReactNode;
}) {
  const update = useProjectStore((state) => state.updateTask);
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState("");
  const blocked =
    (field === "physicalPct" && task.progressMode === "checklist") ||
    (task.isSummary && field !== "name");
  const begin = () => {
    if (blocked) return;
    setValue(String(task[field]));
    setEditing(true);
  };
  const commit = () => {
    const patch =
      field === "startDate"
        ? { requestedStartDate: value || undefined }
        : { [field]: field === "name" ? value : Number(value) };
    if (update(task.id, patch)) setEditing(false);
  };
  if (editing)
    return (
      <input
        autoFocus
        aria-label={`Sửa ${field} ${task.name}`}
        className="cell-input"
        value={value}
        type={
          field === "startDate" ? "date" : field === "name" ? "text" : "number"
        }
        step={field === "duration" ? "0.125" : "1"}
        min={field === "name" || field === "startDate" ? undefined : 0}
        max={field === "physicalPct" ? 100 : undefined}
        onChange={(event) => setValue(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
      />
    );
  return (
    <span
      className={`cell-value ${!blocked ? "editable" : ""}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        begin();
      }}
      title={blocked ? "Giá trị tổng hợp tự động" : "Nhấp đúp để sửa"}
    >
      {children}
    </span>
  );
}
export function ScheduleWorkspace() {
  const state = useProjectStore();
  const { project, result, baseline, selected, collapsed } = state;
  const [pane, setPane] = useState(
      Math.min(704, Math.floor(window.innerWidth * 0.49)),
    ),
    [gridX, setGridX] = useState(0),
    [timelineX, setTimelineX] = useState(0),
    [workspaceWidth, setWorkspaceWidth] = useState(window.innerWidth);
  const [hover, setHover] = useState<string | null>(null),
    [critical, setCritical] = useState(true),
    [compare, setCompare] = useState(false),
    [overloadOnly, setOverloadOnly] = useState(false),
    [zoom, setZoom] = useState<"day" | "week" | "month">("day"),
    [query, setQuery] = useState(""),
    [editor, setEditor] = useState<string | null>(null),
    [dialog, setDialog] = useState<
      "link" | "calendar" | "help" | "load" | "baseline" | null
    >(null);
  const [predecessor, setPredecessor] = useState(""),
    [successor, setSuccessor] = useState(""),
    [linkType, setLinkType] = useState<DependencyType>("FS"),
    [lag, setLag] = useState("0");
  const [projectStart, setProjectStart] = useState(project.startDate),
    [statusDate, setStatusDate] = useState(project.statusDate),
    [holidays, setHolidays] = useState(project.calendar.holidays.join(", "));
  const [drag, setDrag] = useState<{
      id: string;
      mode: "move" | "resize";
      startX: number;
      delta: number;
    } | null>(null),
    [proposal, setProposal] = useState<{
      id: string;
      patch: Partial<Task>;
      description: string;
    } | null>(null);
  const viewport = useRef<HTMLDivElement>(null),
    container = useRef<HTMLDivElement>(null),
    gridScroll = useRef<HTMLDivElement>(null),
    timelineScroll = useRef<HTMLDivElement>(null),
    importInput = useRef<HTMLInputElement>(null);
  const closeDialog = useCallback(() => setDialog(null), []),
    closeProposal = useCallback(() => setProposal(null), []);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      setWorkspaceWidth(width);
      setPane((old) => Math.min(Math.max(300, old), width - 260));
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (event.target as HTMLElement).tagName,
        )
      ) {
        if (event.key === "z") {
          event.preventDefault();
          if (event.shiftKey) state.redo();
          else state.undo();
        }
        if (event.key === "y") {
          event.preventDefault();
          state.redo();
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [state.undo, state.redo]);
  const byId = useMemo(
    () => new Map(result.tasks.map((task) => [task.id, task])),
    [result],
  );
  const resourceById = useMemo(
    () => new Map(project.resources.map((resource) => [resource.id, resource])),
    [project.resources],
  );
  const peaks = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of result.overloads)
      map.set(
        item.resourceId,
        Math.max(map.get(item.resourceId) ?? 0, item.hours),
      );
    return map;
  }, [result]);
  const incoming = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of project.dependencies) {
      const items = map.get(link.successorId) ?? [];
      items.push(
        `${byId.get(link.predecessorId)?.wbs}${link.type}${link.lagDays ? `${link.lagDays > 0 ? "+" : ""}${link.lagDays}d` : ""}`,
      );
      map.set(link.successorId, items);
    }
    return map;
  }, [project.dependencies, byId]);
  const visible = useMemo(() => {
    const filtering = Boolean(query.trim() || overloadOnly),
      match = new Set<string>();
    if (filtering)
      for (const task of result.tasks)
        if (
          (!query.trim() ||
            `${task.wbs} ${task.name}`
              .toLocaleLowerCase("vi")
              .includes(query.toLocaleLowerCase("vi"))) &&
          (!overloadOnly || task.overloadedResourceIds.length)
        ) {
          let current: ScheduledTask | undefined = task;
          while (current && !match.has(current.id)) {
            match.add(current.id);
            current = current.parentId ? byId.get(current.parentId) : undefined;
          }
        }
    const hidden = new Set<string>();
    return result.tasks.filter((task) => {
      if (
        !filtering &&
        task.parentId &&
        (hidden.has(task.parentId) || collapsed.has(task.parentId))
      ) {
        hidden.add(task.id);
        return false;
      }
      return !filtering || match.has(task.id);
    });
  }, [result, collapsed, query, overloadOnly, byId]);
  const tableColumns = useMemo<ColumnDef<ScheduledTask>[]>(
    () =>
      cols.map((column) => ({
        id: column.key,
        accessorFn: (row) =>
          column.key in row ? row[column.key as keyof ScheduledTask] : "",
        size: column.width,
      })),
    [],
  );
  const table = useReactTable({
    data: visible,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });
  const rows = table.getRowModel().rows;
  const getKey = useCallback((index: number) => rows[index].id, [rows]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewport.current,
    estimateSize: () => ROW,
    overscan: 10,
    getItemKey: getKey,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const indexById = useMemo(
    () => new Map(visible.map((task, index) => [task.id, index])),
    [visible],
  );
  const dayWidth = zoom === "day" ? 42 : zoom === "week" ? 20 : 8;
  const timelineStart = addCalendarDays(
    nextWorkingDate(project.startDate, project.calendar),
    -1,
  );
  const earliestBaseline =
    compare && baseline
      ? baseline.tasks.reduce(
          (date, task) => (task.startDate < date ? task.startDate : date),
          timelineStart,
        )
      : timelineStart;
  const start = earliestBaseline;
  const latest =
    compare && baseline
      ? baseline.tasks.reduce(
          (date, task) => (task.endDate > date ? task.endDate : date),
          result.finishDate,
        )
      : result.finishDate;
  const totalDays = Math.max(40, calendarDaysBetween(start, latest) + 10),
    timelineWidth = totalDays * dayWidth;
  const timePaneWidth = Math.max(0, workspaceWidth - pane - 4),
    firstDay = Math.max(0, Math.floor(timelineX / dayWidth) - 1),
    lastDay = Math.min(
      totalDays,
      Math.ceil((timelineX + timePaneWidth) / dayWidth) + 1,
    );
  const days = Array.from(
    { length: Math.max(0, lastDay - firstDay) },
    (_, offset) => {
      const index = firstDay + offset,
        date = addCalendarDays(start, index);
      return { index, date, off: !isWorkingDay(date, project.calendar) };
    },
  );
  const baselineMap = useMemo(
    () => new Map(baseline?.tasks.map((task) => [task.id, task]) ?? []),
    [baseline],
  );
  const position = (task: {
    startDate: string;
    endDate: string;
    duration: number;
    startAt?: string;
    finishAt?: string;
  }) => {
    const fraction = (at?: string) => {
      if (!at) return 0;
      const hours = Number(at.slice(11, 13)),
        minutes = Number(at.slice(14, 16));
      return Math.max(
        0,
        Math.min(
          1,
          (hours * 60 + minutes - 480 - (hours >= 13 ? 60 : 0)) / 480,
        ),
      );
    };
    const x =
      calendarDaysBetween(start, task.startDate) * dayWidth +
      fraction(task.startAt) * dayWidth;
    const end =
      (calendarDaysBetween(start, task.endDate) +
        (task.finishAt ? fraction(task.finishAt) : 1)) *
      dayWidth;
    return { x, width: task.duration === 0 ? 0 : Math.max(3, end - x) };
  };
  const todayX =
    calendarDaysBetween(start, project.statusDate) * dayWidth + dayWidth / 2;
  const leaves = useMemo(
    () => result.tasks.filter((task) => !task.isSummary),
    [result],
  );
  const physical = useMemo(
    () => projectSummary(state).physicalPct,
    [result, baseline],
  );
  const activeEditor = editor ? byId.get(editor) : undefined;
  const changePane = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = event.clientX,
      initial = pane,
      element = event.currentTarget;
    const move = (moveEvent: PointerEvent) =>
      setPane(
        Math.min(
          workspaceWidth - 260,
          Math.max(300, initial + moveEvent.clientX - origin),
        ),
      );
    const stop = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", stop);
      element.removeEventListener("pointercancel", stop);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
  };
  const startDrag = (
    event: React.PointerEvent,
    task: ScheduledTask,
    mode: "move" | "resize",
  ) => {
    if (task.isSummary || (mode === "resize" && task.duration === 0)) return;
    event.stopPropagation();
    event.preventDefault();
    state.select(task.id);
    const node = event.currentTarget as HTMLElement;
    node.setPointerCapture(event.pointerId);
    const originX = event.clientX;
    setDrag({ id: task.id, mode, startX: originX, delta: 0 });
    const move = (e: PointerEvent) =>
      setDrag({
        id: task.id,
        mode,
        startX: originX,
        delta: e.clientX - originX,
      });
    const cleanup = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
      setDrag(null);
    };
    const cancel = () => cleanup();
    const up = (e: PointerEvent) => {
      cleanup();
      const deltaDays = Math.round((e.clientX - originX) / dayWidth);
      if (!deltaDays) return;
      if (mode === "move") {
        const requestedStartDate = nextWorkingDate(
          addCalendarDays(task.startDate, deltaDays),
          project.calendar,
        );
        setProposal({
          id: task.id,
          patch: { requestedStartDate },
          description: `Đặt “${task.name}” không bắt đầu trước ${dateLabel(requestedStartDate)}. Các liên kết có thể đẩy ngày bắt đầu muộn hơn.`,
        });
      } else {
        const clock = new WorkingClock(project.startDate, project.calendar),
          end = nextWorkingDate(
            addCalendarDays(task.endDate, deltaDays),
            project.calendar,
          );
        const duration = Math.max(
          0.125,
          (clock.startOf(end) + 480 - task.earlyStart) / 480,
        );
        setProposal({
          id: task.id,
          patch: { duration },
          description: `Đổi thời lượng “${task.name}” thành ${number(duration)} ngày công. Toàn bộ công việc phụ thuộc sẽ được tính lại.`,
        });
      }
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", cancel);
  };
  const openLinks = () => {
    const ids = selected.filter((id) => !byId.get(id)?.isSummary);
    setPredecessor(ids[0] ?? leaves[0]?.id ?? "");
    setSuccessor(
      ids[1] ??
        leaves.find((task) => task.id !== (ids[0] ?? leaves[0]?.id))?.id ??
        "",
    );
    setLinkType("FS");
    setLag("0");
    setDialog("link");
  };
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { format: "forgeplan-v1", project, baseline },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "forgeplan-project.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const scrollHorizontal = (
    event: React.WheelEvent,
    region: "grid" | "timeline",
  ) => {
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      const node =
        region === "grid" ? gridScroll.current : timelineScroll.current;
      if (node) node.scrollLeft += event.deltaX || event.deltaY;
    }
  };
  const focusRow = (
    event: React.KeyboardEvent,
    index: number,
    task: ScheduledTask,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const target = Math.min(
        rows.length - 1,
        Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)),
      );
      state.select(rows[target].id);
      virtualizer.scrollToIndex(target, { align: "auto" });
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(`[data-row-index="${target}"]`)
          ?.focus(),
      );
    }
    if (event.key === "Enter") {
      event.preventDefault();
      setEditor(task.id);
    }
    if (event.key === "ArrowLeft" && task.isSummary && !collapsed.has(task.id))
      state.toggle(task.id);
    if (event.key === "ArrowRight" && task.isSummary && collapsed.has(task.id))
      state.toggle(task.id);
  };
  return (
    <section className="schedule-module" aria-label="Module lập tiến độ">
      <section className="project-heading">
        <div className="min-w-0">
          <div className="eyebrow mb-1">
            KẾ HOẠCH TRIỂN KHAI · PHÒNG TỰ ĐỘNG HÓA
          </div>
          <h2 className="text-xl font-semibold tracking-tight truncate">
            {project.name}
          </h2>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <CalendarDays size={13} />
              {dateLabel(project.startDate)} — {dateLabel(result.finishDate)}
            </span>
            <span className="hidden lg:inline">
              T2–T7 · 08:00–12:00 / 13:00–17:00
            </span>
            <button
              className="text-indigo-600 hover:underline"
              onClick={() => {
                setProjectStart(project.startDate);
                setStatusDate(project.statusDate);
                setHolidays(project.calendar.holidays.join(", "));
                setDialog("calendar");
              }}
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
              {leaves.length}
              <small> / {result.tasks.length} dòng</small>
            </strong>
          </div>
          <div>
            <span>NGUỒN LỰC QUÁ TẢI</span>
            <strong
              className={peaks.size ? "text-red-600" : "text-emerald-600"}
            >
              {peaks.size}
              <small> nguồn lực</small>
            </strong>
          </div>
        </div>
      </section>
      <div className="command-ribbon h-12">
        <ToolButton icon={<Plus size={16} />} onClick={state.addTask}>
          Thêm Task
        </ToolButton>
        <ToolButton
          icon={<ArrowRightToLine size={16} />}
          onClick={() => state.indent(false)}
          disabled={!selected.length}
          title="Thụt lề"
        >
          Thụt lề
        </ToolButton>
        <ToolButton
          icon={<ArrowLeftToLine size={16} />}
          onClick={() => state.indent(true)}
          disabled={!selected.length}
        >
          Nhô lề
        </ToolButton>
        <ToolButton
          icon={<Link2 size={15} />}
          onClick={openLinks}
          disabled={leaves.length < 2}
        >
          Liên kết FS
        </ToolButton>
        <i className="ribbon-divider" />
        <ToolButton
          icon={<Flag size={15} />}
          onClick={() => setDialog("baseline")}
        >
          Chốt Baseline
        </ToolButton>
        <ToolButton
          active={compare}
          disabled={!baseline}
          icon={<Layers size={15} />}
          onClick={() => setCompare(!compare)}
          title="So sánh baseline"
        >
          So sánh
        </ToolButton>
        <i className="ribbon-divider" />
        <button
          className="toggle-label"
          role="switch"
          aria-checked={critical}
          onClick={() => setCritical(!critical)}
        >
          <span className={`switch ${critical ? "switch-on" : ""}`} />
          <GitBranch size={14} className="text-rose-600" />
          Đường găng
        </button>
        <ToolButton
          active={overloadOnly}
          icon={<AlertTriangle size={15} />}
          onClick={() => setOverloadOnly(!overloadOnly)}
        >
          Quá tải
        </ToolButton>
        <div className="flex-1 min-w-1" />
        <div className="segmented" aria-label="Mức zoom">
          {(["day", "week", "month"] as const).map((value, i) => (
            <button
              key={value}
              aria-pressed={zoom === value}
              className={zoom === value ? "active" : ""}
              onClick={() => setZoom(value)}
            >
              {["Ngày", "Tuần", "Tháng"][i]}
            </button>
          ))}
        </div>
        <ToolButton
          icon={<Undo2 size={15} />}
          onClick={state.undo}
          disabled={!state.history.length}
          title="Hoàn tác Ctrl+Z"
        />
        <ToolButton
          icon={<Redo2 size={15} />}
          onClick={state.redo}
          disabled={!state.future.length}
          title="Làm lại Ctrl+Y"
        />
      </div>
      <div className="view-ribbon">
        <div className="flex items-center gap-2 font-medium">
          <ListTree size={15} className="text-indigo-600" />
          WBS & Tiến độ<span className="count-chip">{visible.length}</span>
        </div>
        <span className="text-slate-300 mx-3">|</span>
        <div className="search-box">
          <Search size={14} />
          <input
            aria-label="Tìm công việc"
            placeholder="Tìm tên hoặc mã WBS…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button aria-label="Xóa tìm kiếm" onClick={() => setQuery("")}>
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex-1" />
        <button
          className="text-action"
          onClick={() => setEditor(selected.at(-1) ?? leaves[0]?.id ?? null)}
          disabled={!result.tasks.length}
        >
          <Settings2 size={14} />
          Chi tiết
        </button>
        <button
          className="text-action"
          onClick={() => setDialog("help")}
          aria-label="Hướng dẫn tiến độ"
        >
          <CircleHelp size={14} />
          Hướng dẫn
        </button>
        <button className="text-action" onClick={exportData}>
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
        <button className="text-action" onClick={() => setDialog("load")}>
          <Activity size={14} />
          5.000 task
        </button>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              const raw = JSON.parse(await file.text());
              const data: ProjectInput = raw.project ?? raw;
              if (!data || !Array.isArray(data.tasks) || !data.calendar)
                throw new Error("Sai cấu trúc dự án.");
              state.replace(data, raw.baseline ?? null);
            } catch (error) {
              state.setError(
                `Không nhập được: ${error instanceof Error ? error.message : "JSON không hợp lệ"}`,
              );
            }
            event.target.value = "";
          }}
        />
      </div>
      <section
        ref={container}
        className="workspace"
        aria-label="Bảng WBS và biểu đồ Gantt"
      >
        <div className="dual-header" style={{ height: HEADER }}>
          <div className="grid-header-clip" style={{ width: pane }}>
            <div
              style={{
                width: GRID_WIDTH,
                transform: `translateX(-${gridX}px)`,
              }}
            >
              <div className="header-top">
                <span>WORK BREAKDOWN STRUCTURE</span>
                <span className="text-slate-400 font-normal">
                  Nhấp đúp ô để sửa
                </span>
              </div>
              <div className="flex h-7">
                {cols.map((column) => (
                  <div
                    key={column.key}
                    className={`column-label ${column.key === "name" ? "" : "numeric"}`}
                    style={{ width: column.width }}
                  >
                    {column.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="timeline-header-clip" style={{ left: pane + 4 }}>
            <div
              className="relative h-14"
              style={{
                width: timelineWidth,
                transform: `translateX(-${timelineX}px)`,
              }}
            >
              {days
                .filter(
                  (day, index) =>
                    index === 0 ||
                    day.date.slice(0, 7) !== days[index - 1].date.slice(0, 7),
                )
                .map((day, index, groups) => (
                  <div
                    key={day.date}
                    className="month-label"
                    style={{
                      left: day.index * dayWidth,
                      width:
                        ((groups[index + 1]?.index ?? lastDay) - day.index) *
                        dayWidth,
                    }}
                  >
                    Tháng {Number(day.date.slice(5, 7))}, {day.date.slice(0, 4)}
                  </div>
                ))}
              <div className="absolute left-0 top-7 h-7">
                {days.map((day) => (
                  <div
                    key={day.date}
                    className={`day-label ${day.off ? "off-day" : ""} ${day.date === project.statusDate ? "report-day" : ""}`}
                    style={{ left: day.index * dayWidth, width: dayWidth }}
                    title={dateLabel(day.date)}
                  >
                    {zoom === "day" ? (
                      <>
                        {parseInt(day.date.slice(8), 10)}
                        <small>
                          {new Date(`${day.date}T00:00:00Z`).getUTCDay() === 0
                            ? "CN"
                            : `T${new Date(`${day.date}T00:00:00Z`).getUTCDay() + 1}`}
                        </small>
                      </>
                    ) : zoom === "week" ? (
                      day.date.slice(8)
                    ) : day.index % 7 === 0 ? (
                      day.date.slice(8)
                    ) : (
                      ""
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div
          ref={viewport}
          role="grid"
          aria-label="Công việc dự án"
          aria-rowcount={rows.length}
          aria-colcount={cols.length}
          className="shared-viewport"
          onWheel={(event) =>
            scrollHorizontal(
              event,
              event.clientX -
                (container.current?.getBoundingClientRect().left ?? 0) <
                pane
                ? "grid"
                : "timeline",
            )
          }
        >
          <div
            className="virtual-space"
            style={{ height: virtualizer.getTotalSize() || ROW * 5 }}
          >
            <div className="timeline-background" style={{ left: pane + 4 }}>
              <div
                className="relative h-full"
                style={{
                  width: timelineWidth,
                  transform: `translateX(-${timelineX}px)`,
                }}
              >
                {days.map((day) => (
                  <div
                    key={day.date}
                    className={`background-day ${day.off ? "off-day" : ""}`}
                    style={{ left: day.index * dayWidth, width: dayWidth }}
                  />
                ))}
                <div
                  className="today-line"
                  style={{ left: todayX }}
                  title={`Ngày báo cáo: ${dateLabel(project.statusDate)}`}
                />
              </div>
            </div>
            {virtualRows.map((virtual) => {
              const task = rows[virtual.index].original,
                chosen = selected.includes(task.id),
                highlighted = chosen || hover === task.id,
                pos = position(task),
                base = baselineMap.get(task.id),
                p = drag?.id === task.id ? drag : null,
                criticalTask = critical && task.isCritical;
              const rowStyle: CSSProperties = {
                height: ROW,
                transform: `translateY(${virtual.start}px)`,
              };
              return (
                <div
                  key={task.id}
                  role="row"
                  aria-rowindex={virtual.index + 1}
                  data-row-index={virtual.index}
                  data-task-id={task.id}
                  data-hovered={hover === task.id}
                  className={`virtual-row ${highlighted ? "row-highlight" : ""} ${chosen ? "row-selected" : ""} ${task.isSummary ? "summary-row" : ""}`}
                  style={rowStyle}
                  tabIndex={
                    selected.at(-1) === task.id ||
                    (!selected.length && virtual.index === 0)
                      ? 0
                      : -1
                  }
                  onMouseEnter={() => setHover(task.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={(event) => {
                    state.select(task.id, event.ctrlKey || event.metaKey);
                    if (
                      !event.ctrlKey &&
                      !event.metaKey &&
                      (event.target as HTMLElement).closest(
                        '[data-column="wbs"],.tree-name',
                      )
                    )
                      setEditor(task.id);
                  }}
                  onDoubleClick={() => setEditor(task.id)}
                  onKeyDown={(event) => focusRow(event, virtual.index, task)}
                  aria-selected={chosen}
                >
                  <div className="grid-row-clip" style={{ width: pane }}>
                    <div
                      className="grid-cells"
                      style={{
                        width: GRID_WIDTH,
                        transform: `translateX(-${gridX}px)`,
                      }}
                    >
                      {cols.map((column) => (
                        <div
                          key={column.key}
                          role="gridcell"
                          data-column={column.key}
                          className={`grid-cell ${column.key === "name" || column.key === "resources" ? "" : "numeric"}`}
                          style={{ width: column.width }}
                        >
                          {column.key === "wbs" && (
                            <span className="text-slate-400">{task.wbs}</span>
                          )}
                          {column.key === "name" && (
                            <div
                              className="tree-name"
                              style={{
                                paddingLeft: Math.min(task.depth, 30) * 16,
                              }}
                            >
                              {task.depth > 0 && (
                                <span
                                  className="tree-guide"
                                  style={{
                                    left:
                                      (Math.min(task.depth, 30) - 1) * 16 + 7,
                                  }}
                                />
                              )}
                              {task.isSummary ? (
                                <button
                                  className="tree-chevron"
                                  aria-label={`${collapsed.has(task.id) ? "Mở" : "Thu gọn"} ${task.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    state.toggle(task.id);
                                  }}
                                >
                                  {collapsed.has(task.id) ? (
                                    <ChevronRight size={14} />
                                  ) : (
                                    <ChevronDown size={14} />
                                  )}
                                </button>
                              ) : (
                                <span
                                  className={`task-type ${task.duration === 0 ? "milestone-type" : criticalTask ? "critical-type" : ""}`}
                                >
                                  {task.duration === 0 ? (
                                    "◆"
                                  ) : criticalTask ? (
                                    <GitBranch
                                      size={11}
                                      aria-label="Công việc găng"
                                    />
                                  ) : (
                                    "▪"
                                  )}
                                </span>
                              )}
                              <InlineCell task={task} field="name">
                                {task.name}
                              </InlineCell>
                            </div>
                          )}
                          {column.key === "duration" && (
                            <InlineCell task={task} field="duration">
                              {number(task.duration)}d
                            </InlineCell>
                          )}
                          {column.key === "startDate" && (
                            <InlineCell task={task} field="startDate">
                              {dateLabel(task.startDate)}
                            </InlineCell>
                          )}
                          {column.key === "endDate" && (
                            <span title={task.finishAt}>
                              {dateLabel(task.endDate)}
                            </span>
                          )}
                          {column.key === "predecessors" && (
                            <PredecessorCell
                              task={task}
                              value={incoming.get(task.id)?.join(", ") ?? ""}
                            />
                          )}
                          {column.key === "variance" && (
                            <span className="numeric">
                              {base
                                ? variance(
                                    task.endDate,
                                    base.endDate,
                                    baseline?.calendar?.holidays ??
                                      project.calendar.holidays,
                                  )
                                : "—"}
                            </span>
                          )}
                          {column.key === "resources" && (
                            <div className="flex items-center gap-1 overflow-hidden">
                              {task.assignments.map((assignment) => {
                                const resource = resourceById.get(
                                    assignment.resourceId,
                                  )!,
                                  overloaded =
                                    task.overloadedResourceIds.includes(
                                      resource.id,
                                    );
                                return (
                                  <span
                                    key={resource.id}
                                    className={
                                      overloaded
                                        ? "resource-pill overloaded"
                                        : "resource-pill"
                                    }
                                    title={
                                      overloaded
                                        ? `Cao điểm ${number(peaks.get(resource.id)!)}h/${resource.capacityHours}h/ngày. Mở chi tiết để sửa phân bổ.`
                                        : `${resource.name} · ${Math.round(assignment.units * 100)}%`
                                    }
                                  >
                                    {overloaded ? (
                                      <AlertTriangle size={11} />
                                    ) : (
                                      <Users size={11} />
                                    )}
                                    {resource.name}
                                    {overloaded
                                      ? ` · ${number(peaks.get(resource.id)!)}h/${resource.capacityHours}h`
                                      : ""}
                                  </span>
                                );
                              })}
                              {!task.assignments.length && (
                                <span className="text-slate-300">—</span>
                              )}
                            </div>
                          )}
                          {column.key === "physicalPct" && (
                            <InlineCell task={task} field="physicalPct">
                              <span
                                className={
                                  task.physicalPct === 100
                                    ? "text-emerald-700"
                                    : "text-indigo-700"
                                }
                              >
                                {number(task.physicalPct)}%
                              </span>
                            </InlineCell>
                          )}
                          {column.key === "durationPct" && (
                            <span className="text-sky-700">
                              {number(task.durationPct)}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="gantt-row-clip" style={{ left: pane + 4 }}>
                    <div
                      className="relative h-full"
                      style={{
                        width: timelineWidth,
                        transform: `translateX(-${timelineX}px)`,
                      }}
                    >
                      {compare && base && (
                        <div
                          className="baseline-bar"
                          style={{
                            left: position(base).x,
                            width: Math.max(
                              base.duration === 0 ? 8 : 4,
                              position(base).width,
                            ),
                          }}
                          title={`Baseline: ${dateLabel(base.startDate)} → ${dateLabel(base.endDate)}`}
                        />
                      )}
                      {task.isSummary ? (
                        <div
                          className="summary-bar"
                          style={{
                            left: pos.x,
                            width: Math.max(12, pos.width),
                          }}
                        >
                          <i />
                          <i />
                        </div>
                      ) : task.duration === 0 ? (
                        <div
                          className="milestone-hit"
                          style={{ left: pos.x - 10 + (p?.delta ?? 0) }}
                          onPointerDown={(event) =>
                            startDrag(event, task, "move")
                          }
                          title={`${task.name} · ${task.startAt}`}
                        >
                          <div
                            className={`milestone ${chosen ? "milestone-selected" : ""}`}
                          />
                        </div>
                      ) : (
                        <div
                          role="button"
                          aria-label={`Thanh Gantt ${task.name}`}
                          tabIndex={-1}
                          className={`task-bar ${criticalTask ? "critical-bar" : ""} ${chosen ? "bar-selected" : ""} ${task.physicalPct === 100 && !criticalTask ? "complete-bar" : ""}`}
                          style={{
                            left: pos.x + (p?.mode === "move" ? p.delta : 0),
                            width: Math.max(
                              5,
                              pos.width + (p?.mode === "resize" ? p.delta : 0),
                            ),
                          }}
                          onPointerDown={(event) =>
                            startDrag(event, task, "move")
                          }
                          title={`${task.name}\nPhysical ${number(task.physicalPct)}% · Duration ${number(task.durationPct)}%\n${task.startAt} → ${task.finishAt}\nFloat: ${number(task.totalFloat / 480)} ngày`}
                        >
                          <div
                            className="physical-fill"
                            style={{ width: `${task.physicalPct}%` }}
                          />
                          <span className="bar-caption">
                            {pos.width > 70
                              ? `${number(task.physicalPct)}%`
                              : ""}
                          </span>
                          <div
                            className="duration-fill"
                            style={{ width: `${task.durationPct}%` }}
                          />
                          <div
                            className="resize-handle"
                            title="Kéo đổi thời lượng"
                            onPointerDown={(event) =>
                              startDrag(event, task, "resize")
                            }
                          />
                        </div>
                      )}
                      {(pos.width > 20 || task.duration === 0) && (
                        <span
                          className={`gantt-label ${task.isSummary ? "font-semibold" : ""}`}
                          style={{ left: pos.x + Math.max(0, pos.width) + 10 }}
                        >
                          {task.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="dependency-clip" style={{ left: pane + 4 }}>
              <svg
                width={timelineWidth}
                height={Math.max(virtualizer.getTotalSize(), 1)}
                style={{ transform: `translateX(-${timelineX}px)` }}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="arrow"
                    viewBox="0 0 6 6"
                    refX="5"
                    refY="3"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M0 0L6 3L0 6Z" fill="var(--planner-baseline)" />
                  </marker>
                  <marker
                    id="critical-arrow"
                    viewBox="0 0 6 6"
                    refX="5"
                    refY="3"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M0 0L6 3L0 6Z" fill="var(--planner-critical)" />
                  </marker>
                </defs>
                {project.dependencies.map((link) => {
                  const fromIndex = indexById.get(link.predecessorId),
                    toIndex = indexById.get(link.successorId);
                  if (
                    fromIndex === undefined ||
                    toIndex === undefined ||
                    !virtualRows.length
                  )
                    return null;
                  const min = virtualRows[0].index,
                    max = virtualRows[virtualRows.length - 1].index;
                  if (
                    Math.max(fromIndex, toIndex) < min ||
                    Math.min(fromIndex, toIndex) > max
                  )
                    return null;
                  const a = byId.get(link.predecessorId)!,
                    b = byId.get(link.successorId)!,
                    ap = position(a),
                    bp = position(b);
                  const fromFinish = link.type[0] === "F",
                    toFinish = link.type[1] === "F",
                    x1 = ap.x + (fromFinish ? ap.width : 0),
                    x2 = bp.x + (toFinish ? bp.width : 0),
                    y1 = fromIndex * ROW + 18,
                    y2 = toIndex * ROW + 18;
                  const out = x1 + (fromFinish ? 9 : -9),
                    into = x2 + (toFinish ? 9 : -9),
                    middleY = y2 > y1 ? y2 - 14 : y2 + 14;
                  const path = toFinish
                    ? `M${x1},${y1} H${Math.max(out, into) + 8} V${y2} H${x2 + 1}`
                    : x2 > out + 8
                      ? `M${x1},${y1} H${out} V${y2} H${x2 - 1}`
                      : `M${x1},${y1} H${out} V${middleY} H${into} V${y2} H${x2 - 1}`;
                  const red = critical && a.isCritical && b.isCritical;
                  return (
                    <path
                      key={link.id}
                      d={path}
                      fill="none"
                      stroke={red ? "var(--planner-critical)" : "var(--planner-baseline)"}
                      strokeWidth="1.25"
                      strokeLinejoin="round"
                      markerEnd={`url(#${red ? "critical-arrow" : "arrow"})`}
                      opacity="0.85"
                    />
                  );
                })}
              </svg>
            </div>
            {!visible.length && (
              <div className="empty-state">
                <ListTree size={28} />
                <h3>Không có công việc phù hợp</h3>
                <p>Thay đổi bộ lọc hoặc thêm công việc đầu tiên.</p>
                <button
                  className="primary-button"
                  onClick={() => {
                    setQuery("");
                    setOverloadOnly(false);
                    if (!project.tasks.length) state.addTask();
                  }}
                >
                  Hiển thị công việc
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="horizontal-scrollbars">
          <div
            ref={gridScroll}
            className="horizontal-proxy"
            style={{ width: pane }}
            onScroll={(event) => setGridX(event.currentTarget.scrollLeft)}
          >
            <div style={{ width: GRID_WIDTH, height: 1 }} />
          </div>
          <div className="w-1 bg-slate-200" />
          <div
            ref={timelineScroll}
            className="horizontal-proxy flex-1"
            onScroll={(event) => setTimelineX(event.currentTarget.scrollLeft)}
          >
            <div style={{ width: timelineWidth, height: 1 }} />
          </div>
        </div>
        <div
          className="splitter"
          style={{ left: pane }}
          role="separator"
          tabIndex={0}
          aria-label="Đổi độ rộng bảng WBS"
          aria-orientation="vertical"
          aria-valuenow={Math.round(pane)}
          aria-valuemin={300}
          aria-valuemax={Math.round(workspaceWidth - 260)}
          onPointerDown={changePane}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              setPane((value) =>
                Math.max(
                  300,
                  Math.min(
                    workspaceWidth - 260,
                    value + (event.key === "ArrowRight" ? 20 : -20),
                  ),
                ),
              );
            }
          }}
        >
          <span />
        </div>
        {activeEditor && (
          <TaskEditor
            key={activeEditor.id}
            task={activeEditor}
            close={() => setEditor(null)}
          />
        )}
      </section>
      <footer className="status-bar">
        <span className="flex items-center gap-1.5 min-w-0 truncate">
          <ShieldCheck size={13} className="text-emerald-600" />
          {state.notice}
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
          {number(result.elapsedMs)}ms ·{" "}
          {visible.length.toLocaleString("vi-VN")} dòng · 36px
        </span>
      </footer>
      {state.error && (
        <div className="error-toast" role="alert">
          <AlertTriangle size={18} />
          <span>{state.error}</span>
          <button aria-label="Đóng lỗi" onClick={state.clearError}>
            <X size={16} />
          </button>
        </div>
      )}
      {dialog === "link" && (
        <Modal title="Liên kết công việc" close={closeDialog}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                state.link({
                  predecessorId: predecessor,
                  successorId: successor,
                  type: linkType,
                  lagDays: Number(lag),
                })
              )
                closeDialog();
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
              tính theo tất cả tiền nhiệm. Ctrl/Cmd+click chọn hai dòng trước
              khi mở hộp thoại.
            </p>
            <button type="submit" className="primary-button w-full">
              <Link2 size={15} />
              Tạo liên kết & tính lịch
            </button>
          </form>
        </Modal>
      )}
      {dialog === "calendar" && (
        <Modal title="Lịch & ngày báo cáo" close={closeDialog}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                state.commit((data) => {
                  data.startDate = projectStart;
                  data.statusDate = statusDate;
                  data.calendar.holidays = holidays
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean);
                }, "Đã cập nhật lịch và tính lại toàn bộ dự án")
              )
                closeDialog();
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
              Thứ Hai–Thứ Bảy: 08:00–12:00, 13:00–17:00. Nghỉ Chủ Nhật và ngày
              lễ. Múi giờ Asia/Ho_Chi_Minh. Ngày báo cáo là cuối ngày; vạch hồng
              trên Gantt biểu diễn ngày báo cáo.
            </p>
            <button className="primary-button w-full" type="submit">
              <CalendarDays size={15} />
              Lưu lịch & tính lại
            </button>
          </form>
        </Modal>
      )}
      {dialog === "baseline" && (
        <Modal title="Chốt Baseline" close={closeDialog}>
          <p className="text-slate-600 leading-6 mb-4">
            Chụp ngày bắt đầu, kết thúc, thời lượng, công sức và Physical % của{" "}
            {result.tasks.length} công việc. Bản chụp giữ nguyên khi lịch hiện
            hành thay đổi.
          </p>
          <label>
            Baseline đối chiếu
            <select
              value={baseline?.id ?? ""}
              onChange={(e) => state.selectBaseline(e.target.value)}
            >
              {project.baselines?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {new Date(b.createdAt).toLocaleString("vi-VN")}
                </option>
              ))}
            </select>
          </label>
          <p className="info-box mb-4">
            Mỗi lần chốt tạo một bản mới. Các bản trước được giữ nguyên.
          </p>
          <button
            className="primary-button w-full"
            onClick={() => {
              state.captureBaseline();
              setCompare(true);
              closeDialog();
            }}
          >
            <Flag size={15} />
            Xác nhận chốt Baseline
          </button>
        </Modal>
      )}
      {dialog === "load" && (
        <Modal title="Dữ liệu kiểm chứng hiệu năng" close={closeDialog}>
          <p className="text-slate-600 leading-6 mb-4">
            Nạp 5.000 dòng gồm 50 nhóm WBS và 4.950 công việc lá. Dữ liệu hiện
            tại được đưa vào lịch sử hoàn tác. Đây là bộ dữ liệu thao tác thử;
            không có liên kết trong bộ này. Hãy xuất JSON nếu cần lưu riêng.
          </p>
          <div className="flex gap-2">
            <button
              className="primary-button flex-1"
              onClick={() => {
                state.loadLarge();
                setQuery("");
                setOverloadOnly(false);
                closeDialog();
              }}
            >
              Nạp 5.000 task
            </button>
            <button
              className="secondary-button flex-1"
              onClick={() => {
                state.reset();
                setQuery("");
                setOverloadOnly(false);
                closeDialog();
              }}
            >
              Khôi phục dự án mẫu
            </button>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="Thao tác với ForgePlan" close={closeDialog}>
          <div className="space-y-3 text-slate-600 leading-6">
            <p>
              <strong>Chỉnh dữ liệu:</strong> nhấp đúp tên, thời lượng, ngày bắt
              đầu hoặc Physical %. Enter lưu, Escape hủy. Nhấp đúp dòng để mở
              bảng chi tiết.
            </p>
            <p>
              <strong>Gantt:</strong> kéo thanh để đề xuất ngày bắt đầu; kéo mép
              phải đổi thời lượng. Xem thông tin thay đổi rồi xác nhận. Ctrl+Z
              hoàn tác.
            </p>
            <p>
              <strong>WBS:</strong> chọn dòng rồi thụt/nhô lề. Mũi tên trái/phải
              thu gọn/mở nhóm. Mũi tên lên/xuống chuyển dòng đã chọn; Enter mở
              chi tiết.
            </p>
            <p>
              <strong>Cuộn:</strong> cuộn dọc dùng chung hai vùng; dùng thanh
              cuộn dưới mỗi vùng hoặc Shift+cuộn để di chuyển ngang.
            </p>
            <p>
              <strong>Tiến độ:</strong> màu đậm là khối lượng nghiệm thu; vạch
              xanh trời dưới đáy là thời gian kế hoạch đã trôi qua đến ngày báo
              cáo.
            </p>
            <p className="info-box">
              Bản ứng dụng một trình duyệt, chưa có máy chủ, đăng nhập hay đồng
              bộ nhiều người. CPM chưa xét giới hạn nguồn lực; cảnh báo không tự
              san bằng lịch.
            </p>
          </div>
        </Modal>
      )}
      {proposal && (
        <Modal title="Xem trước thay đổi lịch" close={closeProposal}>
          <p className="leading-6 text-slate-600 mb-4">
            {proposal.description}
          </p>
          <p className="info-box mb-4">
            Lưu sẽ kiểm tra vòng lặp, tính lại tiến độ, đường găng và quá tải.
            Nếu dữ liệu không hợp lệ, lịch đang lưu được giữ nguyên.
          </p>
          <div className="flex justify-end gap-2">
            <button className="secondary-button" onClick={closeProposal}>
              Hủy
            </button>
            <button
              className="primary-button"
              onClick={() => {
                if (state.updateTask(proposal.id, proposal.patch))
                  closeProposal();
              }}
            >
              <Check size={15} />
              Lưu thay đổi
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
