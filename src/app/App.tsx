import { FloatingThemeDock, ThemeSwitcher } from "../theme/ThemeProvider";
import { ExportPlanMenu } from "../modules/plan-export/ExportPlanMenu";
import { ResourcesWorkspace } from "../modules/resources/ResourcesWorkspace";
import { ExecutionWorkspace } from "../modules/execution/ExecutionWorkspace";
import { DashboardWorkspace } from "../modules/dashboard/DashboardWorkspace";
import { DataWorkspace } from "../modules/data/DataWorkspace";
import { Component, lazy, Suspense, type ReactNode } from "react";
import {
  Bell,
  ChevronRight,
  Cloud,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  X,
} from "lucide-react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { useShallow } from "zustand/react/shallow";
import {
  selectOpenCriticalCount,
  selectOverloadCount,
  selectProjectNames,
} from "../store/shellSelectors";
import { PortfolioWorkspace } from "../modules/portfolio/PortfolioWorkspace";
import { ProjectSettings } from "../modules/project-settings/ProjectSettings";
import { moduleRegistry } from "./moduleRegistry";
import { useWorkspaceRouter } from "./useWorkspaceRouter";
import { layoutVariables } from "../shared/designTokens";
import { workWeekLabel } from "../domain/calendarText";

const ScheduleWorkspace = lazy(() =>
  import("../modules/schedule").then((module) => ({
    default: module.ScheduleWorkspace,
  })),
);

class WorkspaceBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="empty-module" role="alert">
        <h2>Không mở được phân hệ</h2>
        <p>
          Dữ liệu dự án đã lưu vẫn được giữ nguyên. Bạn có thể chuyển sang phân
          hệ khác hoặc tải lại trang.
        </p>
        <button className="secondary-button" onClick={() => location.reload()}>
          Tải lại trang
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

/**
 * The shell is split so each piece subscribes only to the state it shows.
 * Selecting a row, typing in a cell or a save-status change re-renders the
 * one small component that displays it, not the whole shell and the active
 * module under it. App itself only follows the sidebar width.
 */
export function App() {
  useWorkspaceRouter();
  const sidebarCollapsed = useWorkspaceStore((s) => s.sidebarCollapsed);
  return (
    <div
      style={layoutVariables}
      className={`enterprise-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
    >
      <a href="#workspace-main" className="skip-link">
        Chuyển tới vùng làm việc
      </a>
      <ShellSidebar />
      <div className="shell-body">
        <header className="shell-header">
          <ShellContext />
          <ThemeSwitcher />
          <ExportPlanMenu />
          <ContractCode />
          <StorageStatus />
          <HeaderStatusCluster />
        </header>
        <ShellViewbar />
        <ShellAlerts />
        <WorkspaceMain />
      </div>
      <FloatingThemeDock />
    </div>
  );
}

function ShellSidebar() {
  const { sidebarCollapsed, view, projectCount, toggleSidebar, navigate } =
    useWorkspaceStore(
      useShallow((s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        view: s.view,
        projectCount: s.projectOrder.length,
        toggleSidebar: s.toggleSidebar,
        navigate: s.navigate,
      })),
    );
  const criticalCount = useWorkspaceStore(selectOpenCriticalCount);
  const overloadCount = useWorkspaceStore(selectOverloadCount);
  return (
    <aside className="shell-sidebar" aria-label="Điều hướng chính">
      <div className="shell-brand">
        <div className="window-dots" aria-hidden="true">
          <span className="dot-close" />
          <span className="dot-min" />
          <span className="dot-max" />
        </div>
        <span className="brand-mark">
          <Layers size={18} />
        </span>
        <span className="sidebar-text">
          <strong>ForgePlan</strong>
          <small>CREATIVE WORKSPACE</small>
        </span>
      </div>
      <button
        className="sidebar-collapse"
        aria-label={
          sidebarCollapsed
            ? "Mở rộng thanh điều hướng"
            : "Thu gọn thanh điều hướng"
        }
        title={sidebarCollapsed ? "Mở rộng điều hướng" : "Thu gọn điều hướng"}
        onClick={toggleSidebar}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen size={17} />
        ) : (
          <PanelLeftClose size={17} />
        )}
        <span className="sidebar-text">Thu gọn điều hướng</span>
      </button>
      <nav>
        {moduleRegistry.map(({ id, label, icon: Icon }, index) => {
          const badge =
            id === "portfolio"
              ? projectCount
              : id === "resources" && overloadCount > 0
                ? overloadCount
                : id === "dashboard" && criticalCount > 0
                  ? criticalCount
                  : null;
          return (
            <div key={id}>
              {index === 0 && (
                <div className="nav-section sidebar-text">DANH MỤC</div>
              )}
              {index === 1 && (
                <div className="nav-section sidebar-text">KHÔNG GIAN DỰ ÁN</div>
              )}
              {index === 4 && (
                <div className="nav-section sidebar-text">
                  ĐIỀU HÀNH & HỆ THỐNG
                </div>
              )}
              <button
                className={`nav-item ${view === id ? "active" : ""}`}
                aria-label={label}
                aria-current={view === id ? "page" : undefined}
                title={label}
                onClick={() => navigate(id)}
              >
                <Icon size={17} />
                <span className="sidebar-text">{label}</span>
                {badge !== null && (
                  <span
                    className="nav-pill-badge sidebar-text"
                    aria-hidden="true"
                  >
                    {badge}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="avatar">PM</div>
        <span className="sidebar-text">
          <strong>Không gian kỹ thuật</strong>
          <small>Phiên làm việc độc lập</small>
        </span>
      </div>
    </aside>
  );
}

function ShellContext() {
  const { view, activeProjectId, projectOrder, switchProject } =
    useWorkspaceStore(
      useShallow((s) => ({
        view: s.view,
        activeProjectId: s.activeProjectId,
        projectOrder: s.projectOrder,
        switchProject: s.switchProject,
      })),
    );
  const names = useWorkspaceStore(useShallow(selectProjectNames));
  const module = moduleRegistry.find((item) => item.id === view)!;
  const ModuleIcon = module.icon;
  return (
    <div className="shell-context">
      <ModuleIcon size={16} />
      <h1>{module.label}</h1>
      <ChevronRight size={13} />
      <label className="sr-only" htmlFor="project-switcher">
        Dự án đang làm việc
      </label>
      <select
        id="project-switcher"
        value={activeProjectId}
        onChange={(e) => switchProject(e.target.value)}
      >
        {projectOrder.map((id, i) => (
          <option key={id} value={id}>
            {names[i]}
          </option>
        ))}
      </select>
    </div>
  );
}

function ContractCode() {
  const contractCode = useWorkspaceStore(
    (s) => s.projects[s.activeProjectId].project.contractCode,
  );
  return (
    <span className="contract-code numeric" title={contractCode}>
      {contractCode || "Chưa có mã HĐ"}
    </span>
  );
}

function StorageStatus() {
  const { persistenceError, saving } = useWorkspaceStore(
    useShallow((s) => ({
      persistenceError: s.persistenceError,
      saving: s.saving,
    })),
  );
  return (
    <span
      className={`storage-state ${persistenceError ? "storage-error" : ""}`}
    >
      <ShieldCheck size={14} />
      {persistenceError
        ? "Chưa lưu được"
        : saving
          ? "Đang lưu…"
          : "Đã lưu trên thiết bị"}
    </span>
  );
}

function HeaderStatusCluster() {
  const criticalCount = useWorkspaceStore(selectOpenCriticalCount);
  return (
    <div className="header-status-cluster" aria-hidden="true">
      <span className="header-bell-chip" title="Việc đường găng cần chú ý">
        <Bell size={15} />
        {criticalCount > 0 && <i>{criticalCount}</i>}
      </span>
      <span className="header-cloud-chip">
        <Cloud size={15} />
      </span>
      <span className="header-profile-ring">PM</span>
    </div>
  );
}

const PROJECT_TABS = moduleRegistry.filter((item) =>
  ["schedule", "resources", "execution"].includes(item.id),
);

function ShellViewbar() {
  const { view, navigate, revision, calendar } = useWorkspaceStore(
    useShallow((s) => ({
      view: s.view,
      navigate: s.navigate,
      revision: s.projects[s.activeProjectId].revision,
      calendar: s.projects[s.activeProjectId].project.calendar,
    })),
  );
  return (
    <div className="shell-viewbar">
      <div className="workspace-tabs" aria-label="Chế độ xem dự án">
        {PROJECT_TABS.map((item) => (
          <button
            key={item.id}
            aria-pressed={view === item.id}
            onClick={() => navigate(item.id)}
          >
            <item.icon size={14} />
            {item.id === "schedule"
              ? "WBS + Gantt"
              : item.id === "resources"
                ? "Tải nguồn lực"
                : "Kanban / FAT–SAT"}
          </button>
        ))}
      </div>
      <span className="shell-calendar">
        {workWeekLabel(calendar)} · <span className="numeric">8h/ngày</span>
      </span>
      <span className="revision numeric">r{revision}</span>
    </div>
  );
}

function ShellAlerts() {
  const s = useWorkspaceStore(
    useShallow((state) => ({
      persistenceError: state.persistenceError,
      persistenceBlocked: state.persistenceBlocked,
      retryPersistence: state.retryPersistence,
      syncConflict: state.syncConflict,
      resolveSyncConflict: state.resolveSyncConflict,
      syncNotice: state.syncNotice,
      clearSyncNotice: state.clearSyncNotice,
      actionError: state.view !== "portfolio" ? state.actionError : "",
      clearActionError: state.clearActionError,
    })),
  );
  return (
    <>
      {s.persistenceError && (
        <div className="shell-alert" role="alert">
          <AlertTriangle size={16} />
          <span>{s.persistenceError}</span>
          {!s.persistenceBlocked && (
            <button onClick={s.retryPersistence}>Thử lưu lại</button>
          )}
        </div>
      )}
      {s.syncConflict && (
        <div className="shell-alert sync-conflict" role="alert">
          <AlertTriangle size={16} />
          <span>
            {s.syncConflict.projectNames.join(", ")} vừa được lưu ở tab khác
            trong khi bạn cũng đang sửa. Tạm dừng lưu cho đến khi bạn chọn bản
            giữ lại.
          </span>
          <button onClick={() => void s.resolveSyncConflict("theirs")}>
            Dùng bản từ tab khác
          </button>
          <button onClick={() => void s.resolveSyncConflict("mine")}>
            Giữ bản của tôi
          </button>
        </div>
      )}
      {s.syncNotice && (
        <div className="shell-alert shell-notice" role="status">
          <RefreshCw size={15} />
          <span>{s.syncNotice}</span>
          <button
            aria-label="Đóng thông báo đồng bộ"
            onClick={s.clearSyncNotice}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {s.actionError && (
        <div className="shell-alert" role="alert">
          <AlertTriangle size={16} />
          <span>{s.actionError}</span>
          <button aria-label="Đóng thông báo" onClick={s.clearActionError}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}

function WorkspaceMain() {
  const { view, activeProjectId } = useWorkspaceStore(
    useShallow((s) => ({ view: s.view, activeProjectId: s.activeProjectId })),
  );
  return (
    <main id="workspace-main" className="shell-main" tabIndex={-1}>
      <WorkspaceBoundary key={`${activeProjectId}/${view}`}>
        <Suspense
          fallback={
            <div className="empty-module" role="status">
              Đang tải module tiến độ…
            </div>
          }
        >
          {view === "schedule" ? (
            <ScheduleWorkspace key={activeProjectId} />
          ) : view === "portfolio" ? (
            <PortfolioWorkspace />
          ) : view === "settings" ? (
            <ProjectSettings key={activeProjectId} />
          ) : view === "resources" ? (
            <ResourcesWorkspace key={activeProjectId} />
          ) : view === "execution" ? (
            <ExecutionWorkspace key={activeProjectId} />
          ) : view === "dashboard" ? (
            <DashboardWorkspace key={activeProjectId} />
          ) : (
            <DataWorkspace key={activeProjectId} />
          )}
        </Suspense>
      </WorkspaceBoundary>
    </main>
  );
}
