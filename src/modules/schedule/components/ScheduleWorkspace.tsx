import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ListTree, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { TaskDetailDrawer as TaskEditor } from "../../../shared/ui/TaskDetailDrawer";
import { overallProgress } from "../../../domain/execution";
import { useProjectStore } from "../../../store/useProjectStore";
import {
  externalizeAttachments,
  inlineAttachments,
  missingAttachmentsMessage,
} from "../../../infrastructure/persistence/attachmentStore";
import { download } from "../../data/serialization";
import {
  addCalendarDays,
  calendarDaysBetween,
  isWorkingDay,
  nextWorkingDate,
  shiftMinutes,
} from "../engine/schedulingEngine";
import type { ProjectInput, ScheduledTask } from "../engine/types";
import {
  cols,
  dayWidthFor,
  gridWidthOf,
  ROW,
  type TimelineGeometry,
  type Zoom,
} from "./scheduleShared";
import { createHoverStore } from "./hoverStore";
import { TaskRow, type RowActions } from "./TaskRow";
import { DependencyLayer } from "./DependencyLayer";
import {
  ScheduleHeader,
  TimelineBackground,
  type TimelineDay,
} from "./TimelineParts";
import {
  CommandRibbon,
  ScheduleHeading,
  StatusBar,
  ViewRibbon,
} from "./ScheduleChrome";
import {
  BaselineDialog,
  CalendarDialog,
  DeleteTasksDialog,
  HelpDialog,
  LinkDialog,
  LoadDialog,
  ProposalDialog,
} from "./ScheduleDialogs";
import { useGanttDrag } from "./useGanttDrag";
import { useColumnPrefs } from "./useColumnPrefs";
import { shiftLabel, workWeekLabel } from "../../../domain/calendarText";
import { withDescendants } from "../model/createScheduleSession";

type Dialog = "link" | "calendar" | "help" | "load" | "baseline" | null;

/**
 * WBS grid + Gantt for the active project. This component owns view state
 * (zoom, filters, scroll, dialogs) and wires the session to memoized parts:
 * rows re-render only when their own data changes, hover lives in a small
 * external store, and horizontal offsets are CSS variables.
 */
export function ScheduleWorkspace() {
  const {
    project,
    result,
    baseline,
    selected,
    collapsed,
    canUndo,
    canRedo,
    notice,
    error,
  } = useProjectStore(
    useShallow((s) => ({
      project: s.project,
      result: s.result,
      baseline: s.baseline,
      selected: s.selected,
      collapsed: s.collapsed,
      canUndo: s.history.length > 0,
      canRedo: s.future.length > 0,
      notice: s.notice,
      error: s.error,
    })),
  );
  // Session actions keep their identity for the life of the project session.
  const session = useProjectStore(
    useShallow((s) => ({
      select: s.select,
      toggle: s.toggle,
      addTask: s.addTask,
      removeTasks: s.removeTasks,
      indent: s.indent,
      link: s.link,
      commit: s.commit,
      updateTask: s.updateTask,
      captureBaseline: s.captureBaseline,
      selectBaseline: s.selectBaseline,
      undo: s.undo,
      redo: s.redo,
      replace: s.replace,
      loadLarge: s.loadLarge,
      reset: s.reset,
      clearError: s.clearError,
      setError: s.setError,
    })),
  );

  const [pane, setPane] = useState(
      Math.min(704, Math.floor(window.innerWidth * 0.49)),
    ),
    [gridX, setGridX] = useState(0),
    [timelineX, setTimelineX] = useState(0),
    [workspaceWidth, setWorkspaceWidth] = useState(window.innerWidth);
  const [critical, setCritical] = useState(true),
    [compare, setCompare] = useState(false),
    [overloadOnly, setOverloadOnly] = useState(false),
    [zoom, setZoom] = useState<Zoom>("day"),
    [query, setQuery] = useState(""),
    [editor, setEditor] = useState<string | null>(null),
    [dialog, setDialog] = useState<Dialog>(null),
    [deleting, setDeleting] = useState<string[] | null>(null),
    [linkDefaults, setLinkDefaults] = useState({
      predecessor: "",
      successor: "",
    });
  const [hover] = useState(createHoverStore);
  const columnPrefs = useColumnPrefs();
  const { columns } = columnPrefs;
  const gridWidth = gridWidthOf(columns);
  const { drag, startDrag, proposal, setProposal } = useGanttDrag();
  const viewport = useRef<HTMLDivElement>(null),
    container = useRef<HTMLDivElement>(null),
    gridScroll = useRef<HTMLDivElement>(null),
    timelineScroll = useRef<HTMLDivElement>(null);
  const closeDialog = useCallback(() => setDialog(null), []),
    closeProposal = useCallback(() => setProposal(null), [setProposal]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      setWorkspaceWidth(width);
      setPane((old) => Math.min(Math.max(300, old), width - 260));
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const { undo, redo } = session;
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
          if (event.shiftKey) redo();
          else undo();
        }
        if (event.key === "y") {
          event.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [undo, redo]);

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

  // Timeline scale and range.
  const dayWidth = dayWidthFor(zoom);
  const start = useMemo(() => {
    const timelineStart = addCalendarDays(
      nextWorkingDate(project.startDate, project.calendar),
      -1,
    );
    return compare && baseline
      ? baseline.tasks.reduce(
          (date, task) => (task.startDate < date ? task.startDate : date),
          timelineStart,
        )
      : timelineStart;
  }, [project.startDate, project.calendar, compare, baseline]);
  const latest = useMemo(
    () =>
      compare && baseline
        ? baseline.tasks.reduce(
            (date, task) => (task.endDate > date ? task.endDate : date),
            result.finishDate,
          )
        : result.finishDate,
    [compare, baseline, result.finishDate],
  );
  const shift = project.calendar.shift;
  const geometry = useMemo<TimelineGeometry>(
    () => ({ start, dayWidth, shift: shiftMinutes({ shift }) }),
    [start, dayWidth, shift],
  );
  const totalDays = Math.max(40, calendarDaysBetween(start, latest) + 10),
    timelineWidth = totalDays * dayWidth;
  const timePaneWidth = Math.max(0, workspaceWidth - pane - 4),
    firstDay = Math.max(0, Math.floor(timelineX / dayWidth) - 1),
    lastDay = Math.min(
      totalDays,
      Math.ceil((timelineX + timePaneWidth) / dayWidth) + 1,
    );
  const days = useMemo<TimelineDay[]>(
    () =>
      Array.from({ length: Math.max(0, lastDay - firstDay) }, (_, offset) => {
        const index = firstDay + offset,
          date = addCalendarDays(start, index);
        return { index, date, off: !isWorkingDay(date, project.calendar) };
      }),
    [firstDay, lastDay, start, project.calendar],
  );
  const baselineMap = useMemo(
    () => new Map(baseline?.tasks.map((task) => [task.id, task]) ?? []),
    [baseline],
  );
  const varianceCalendar = baseline?.calendar ?? project.calendar;
  const todayX =
    calendarDaysBetween(start, project.statusDate) * dayWidth + dayWidth / 2;
  const leaves = useMemo(
    () => result.tasks.filter((task) => !task.isSummary),
    [result],
  );
  const physical = useMemo(() => overallProgress(result.tasks), [result]);
  const activeEditor = editor ? byId.get(editor) : undefined;

  // Row callbacks read the latest render through a ref, so the object passed
  // to every memoized row keeps one identity.
  const latestRef = useRef({
    rows,
    virtualizer,
    collapsed,
    project,
    dayWidth,
    selected,
  });
  latestRef.current = {
    rows,
    virtualizer,
    collapsed,
    project,
    dayWidth,
    selected,
  };
  const rowActions = useMemo<RowActions>(
    () => ({
      select: (id, multi) => session.select(id, multi),
      openEditor: (id) => setEditor(id),
      toggle: (id) => session.toggle(id),
      keyDown: (event, index, task) => {
        const { rows, virtualizer, collapsed } = latestRef.current;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const target = Math.min(
            rows.length - 1,
            Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)),
          );
          session.select(rows[target].id);
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
        // Only when the row itself has focus, never while typing in a cell.
        if (event.key === "Delete" && event.target === event.currentTarget) {
          event.preventDefault();
          const { selected } = latestRef.current;
          setDeleting(selected.includes(task.id) ? selected : [task.id]);
        }
        if (
          event.key === "ArrowLeft" &&
          task.isSummary &&
          !collapsed.has(task.id)
        )
          session.toggle(task.id);
        if (
          event.key === "ArrowRight" &&
          task.isSummary &&
          collapsed.has(task.id)
        )
          session.toggle(task.id);
      },
      startDrag: (event, task, mode) => {
        const { project, dayWidth } = latestRef.current;
        startDrag(event, task, mode, {
          project,
          dayWidth,
          select: (id) => session.select(id),
        });
      },
    }),
    // startDrag only closes over stable state setters; everything that
    // changes per render is read from latestRef.
    [session, startDrag],
  );

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
  const openLinks = () => {
    const ids = selected.filter((id) => !byId.get(id)?.isSummary);
    setLinkDefaults({
      predecessor: ids[0] ?? leaves[0]?.id ?? "",
      successor:
        ids[1] ??
        leaves.find((task) => task.id !== (ids[0] ?? leaves[0]?.id))?.id ??
        "",
    });
    setDialog("link");
  };
  const exportData = async () => {
    try {
      // Portable JSON carries attachment bytes inline.
      const { project: portable, missing } = await inlineAttachments(project);
      download(
        new Blob(
          [
            JSON.stringify(
              { format: "forgeplan-v1", project: portable, baseline },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        "forgeplan-project.json",
      );
      if (missing.length) session.setError(missingAttachmentsMessage(missing));
    } catch (error) {
      session.setError(
        `Không xuất được: ${error instanceof Error ? error.message : "lỗi đọc tài liệu"}`,
      );
    }
  };
  const importData = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text());
      const data: ProjectInput = raw.project ?? raw;
      if (!data || !Array.isArray(data.tasks) || !data.calendar)
        throw new Error("Sai cấu trúc dự án.");
      session.replace(await externalizeAttachments(data), raw.baseline ?? null);
    } catch (error) {
      session.setError(
        `Không nhập được: ${error instanceof Error ? error.message : "JSON không hợp lệ"}`,
      );
    }
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
  const clearFilters = () => {
    setQuery("");
    setOverloadOnly(false);
  };
  const lastSelected = selected.at(-1);
  const deleteTargets = useMemo(
    () =>
      (deleting ?? [])
        .map((id) => byId.get(id))
        .filter((task): task is ScheduledTask => !!task),
    [deleting, byId],
  );
  const deleteSet = useMemo(
    () =>
      withDescendants(
        project.tasks,
        deleteTargets.map((task) => task.id),
      ),
    [project.tasks, deleteTargets],
  );

  return (
    <section className="schedule-module" aria-label="Module lập tiến độ">
      <ScheduleHeading
        name={project.name}
        calendarLabel={`${workWeekLabel(project.calendar)} · ${shiftLabel(project.calendar)}`}
        startDate={project.startDate}
        finishDate={result.finishDate}
        physical={physical}
        leafCount={leaves.length}
        rowCount={result.tasks.length}
        overloadedResources={peaks.size}
        onOpenCalendar={() => setDialog("calendar")}
      />
      <CommandRibbon
        hasSelection={selected.length > 0}
        canLink={leaves.length >= 2}
        hasBaseline={!!baseline}
        compare={compare}
        critical={critical}
        overloadOnly={overloadOnly}
        zoom={zoom}
        canUndo={canUndo}
        canRedo={canRedo}
        onAddTask={session.addTask}
        onIndent={session.indent}
        onOpenLinks={openLinks}
        onDelete={() => setDeleting(selected)}
        onOpenBaseline={() => setDialog("baseline")}
        onToggleCompare={() => setCompare(!compare)}
        onToggleCritical={() => setCritical(!critical)}
        onToggleOverload={() => setOverloadOnly(!overloadOnly)}
        onZoom={setZoom}
        onUndo={undo}
        onRedo={redo}
      />
      <ViewRibbon
        visibleCount={visible.length}
        query={query}
        onQuery={setQuery}
        detailsDisabled={!result.tasks.length}
        onDetails={() => setEditor(lastSelected ?? leaves[0]?.id ?? null)}
        onHelp={() => setDialog("help")}
        onExport={exportData}
        onImport={importData}
        onLoad={() => setDialog("load")}
        hiddenColumns={columnPrefs.hidden}
        onToggleColumn={columnPrefs.toggle}
      />
      <section
        ref={container}
        className="workspace"
        aria-label="Bảng WBS và biểu đồ Gantt"
        style={
          {
            "--pane": `${pane}px`,
            "--grid-x": `${gridX}px`,
            "--timeline-x": `${timelineX}px`,
          } as React.CSSProperties
        }
      >
        <ScheduleHeader
          days={days}
          lastDay={lastDay}
          dayWidth={dayWidth}
          timelineWidth={timelineWidth}
          zoom={zoom}
          statusDate={project.statusDate}
          columns={columns}
          gridWidth={gridWidth}
        />
        <div
          ref={viewport}
          role="grid"
          aria-label="Công việc dự án"
          aria-rowcount={rows.length}
          aria-colcount={columns.length}
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
            <TimelineBackground
              days={days}
              dayWidth={dayWidth}
              timelineWidth={timelineWidth}
              todayX={todayX}
              statusDate={project.statusDate}
            />
            {virtualRows.map((virtual) => {
              const task = rows[virtual.index].original;
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  index={virtual.index}
                  top={virtual.start}
                  chosen={selected.includes(task.id)}
                  focusable={
                    lastSelected === task.id ||
                    (!selected.length && virtual.index === 0)
                  }
                  collapsed={collapsed.has(task.id)}
                  showCritical={critical}
                  compare={compare}
                  base={baselineMap.get(task.id)}
                  varianceCalendar={varianceCalendar}
                  predecessors={incoming.get(task.id)?.join(", ") ?? ""}
                  resourceById={resourceById}
                  peaks={peaks}
                  geometry={geometry}
                  timelineWidth={timelineWidth}
                  drag={drag?.id === task.id ? drag : null}
                  hover={hover}
                  actions={rowActions}
                  columns={columns}
                  gridWidth={gridWidth}
                />
              );
            })}
            <DependencyLayer
              dependencies={project.dependencies}
              indexById={indexById}
              byId={byId}
              geometry={geometry}
              firstIndex={virtualRows.length ? virtualRows[0].index : -1}
              lastIndex={
                virtualRows.length
                  ? virtualRows[virtualRows.length - 1].index
                  : -1
              }
              showCritical={critical}
              timelineWidth={timelineWidth}
              height={virtualizer.getTotalSize()}
            />
            {!visible.length && (
              <div className="empty-state">
                <ListTree size={28} />
                <h3>Không có công việc phù hợp</h3>
                <p>Thay đổi bộ lọc hoặc thêm công việc đầu tiên.</p>
                <button
                  className="primary-button"
                  onClick={() => {
                    clearFilters();
                    if (!project.tasks.length) session.addTask();
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
            <div style={{ width: gridWidth, height: 1 }} />
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
      <StatusBar
        notice={notice}
        elapsedMs={result.elapsedMs}
        visibleCount={visible.length}
      />
      {error && (
        <div className="error-toast" role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button aria-label="Đóng lỗi" onClick={session.clearError}>
            <X size={16} />
          </button>
        </div>
      )}
      {dialog === "link" && (
        <LinkDialog
          leaves={leaves}
          initialPredecessor={linkDefaults.predecessor}
          initialSuccessor={linkDefaults.successor}
          onSubmit={session.link}
          close={closeDialog}
        />
      )}
      {dialog === "calendar" && (
        <CalendarDialog
          initial={{
            startDate: project.startDate,
            statusDate: project.statusDate,
            calendar: project.calendar,
          }}
          onSubmit={(values) =>
            session.commit((data) => {
              data.startDate = values.startDate;
              data.statusDate = values.statusDate;
              data.calendar = values.calendar;
            }, "Đã cập nhật lịch và tính lại toàn bộ dự án")
          }
          close={closeDialog}
        />
      )}
      {dialog === "baseline" && (
        <BaselineDialog
          taskCount={result.tasks.length}
          baselines={project.baselines ?? []}
          activeId={baseline?.id ?? ""}
          onSelect={session.selectBaseline}
          onCapture={() => {
            session.captureBaseline();
            setCompare(true);
            closeDialog();
          }}
          close={closeDialog}
        />
      )}
      {dialog === "load" && (
        <LoadDialog
          onLoadLarge={() => {
            session.loadLarge();
            clearFilters();
            closeDialog();
          }}
          onReset={() => {
            session.reset();
            clearFilters();
            closeDialog();
          }}
          close={closeDialog}
        />
      )}
      {dialog === "help" && <HelpDialog close={closeDialog} />}
      {deleteTargets.length > 0 && (
        <DeleteTasksDialog
          tasks={deleteTargets}
          total={deleteSet.size}
          links={
            project.dependencies.filter(
              (link) =>
                deleteSet.has(link.predecessorId) ||
                deleteSet.has(link.successorId),
            ).length
          }
          onConfirm={() => {
            if (session.removeTasks(deleteTargets.map((task) => task.id))) {
              if (editor && deleteSet.has(editor)) setEditor(null);
              setDeleting(null);
            }
          }}
          close={() => setDeleting(null)}
        />
      )}
      {proposal && (
        <ProposalDialog
          proposal={proposal}
          onConfirm={() => {
            if (session.updateTask(proposal.id, proposal.patch))
              closeProposal();
          }}
          close={closeProposal}
        />
      )}
    </section>
  );
}
