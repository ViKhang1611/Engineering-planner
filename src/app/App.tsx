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
  X,
} from "lucide-react";
import { useWorkspaceStore } from "../store/workspaceStore";
import { PortfolioWorkspace } from "../modules/portfolio/PortfolioWorkspace";
import { ProjectSettings } from "../modules/project-settings/ProjectSettings";
import { moduleRegistry } from "./moduleRegistry";
import { useWorkspaceRouter } from "./useWorkspaceRouter";
import { layoutVariables } from "../shared/designTokens";

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

export function App() {
  useWorkspaceRouter();
  const state = useWorkspaceStore((s) => s);
  const active = state.projects[state.activeProjectId];
  const module = moduleRegistry.find((item) => item.id === state.view)!;
  const ModuleIcon = module.icon;
  const criticalCount = active.result.tasks.filter(
    (t) => !t.isSummary && t.isCritical && t.physicalPct < 100,
  ).length;
  const overloadCount = active.result.overloads.length;

  return (
    <div
      style={layoutVariables}
      className={`enterprise-shell ${state.sidebarCollapsed ? "sidebar-collapsed" : ""}`}
    >
      <a href="#workspace-main" className="skip-link">
        Chuyển tới vùng làm việc
      </a>
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
            state.sidebarCollapsed
              ? "Mở rộng thanh điều hướng"
              : "Thu gọn thanh điều hướng"
          }
          title={
            state.sidebarCollapsed ? "Mở rộng điều hướng" : "Thu gọn điều hướng"
          }
          onClick={state.toggleSidebar}
        >
          {state.sidebarCollapsed ? (
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
                ? state.projectOrder.length
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
                  <div className="nav-section sidebar-text">
                    KHÔNG GIAN DỰ ÁN
                  </div>
                )}
                {index === 4 && (
                  <div className="nav-section sidebar-text">
                    ĐIỀU HÀNH & HỆ THỐNG
                  </div>
                )}
                <button
                  className={`nav-item ${state.view === id ? "active" : ""}`}
                  aria-label={label}
                  aria-current={state.view === id ? "page" : undefined}
                  title={label}
                  onClick={() => state.navigate(id)}
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
      <div className="shell-body">
        <header className="shell-header">
          <div className="shell-context">
            <ModuleIcon size={16} />
            <h1>{module.label}</h1>
            <ChevronRight size={13} />
            <label className="sr-only" htmlFor="project-switcher">
              Dự án đang làm việc
            </label>
            <select
              id="project-switcher"
              value={state.activeProjectId}
              onChange={(e) => state.switchProject(e.target.value)}
            >
              {state.projectOrder.map((id) => (
                <option key={id} value={id}>
                  {state.projects[id].project.name}
                </option>
              ))}
            </select>
          </div>
          <ThemeSwitcher />
          <ExportPlanMenu />
          <span
            className="contract-code numeric"
            title={active.project.contractCode}
          >
            {active.project.contractCode || "Chưa có mã HĐ"}
          </span>
          <span
            className={`storage-state ${state.persistenceError ? "storage-error" : ""}`}
          >
            <ShieldCheck size={14} />
            {state.persistenceError
              ? "Chưa lưu được"
              : state.saving
                ? "Đang lưu…"
                : "Đã lưu trên thiết bị"}
          </span>
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
        </header>
        <div className="shell-viewbar">
          <div className="workspace-tabs" aria-label="Chế độ xem dự án">
            {moduleRegistry
              .filter((item) =>
                ["schedule", "resources", "execution"].includes(item.id),
              )
              .map((item) => (
                <button
                  key={item.id}
                  aria-pressed={state.view === item.id}
                  onClick={() => state.navigate(item.id)}
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
            T2–T7 · <span className="numeric">8h/ngày</span>
          </span>
          <span className="revision numeric">r{active.revision}</span>
        </div>
        {state.persistenceError && (
          <div className="shell-alert" role="alert">
            <AlertTriangle size={16} />
            <span>{state.persistenceError}</span>
            {!state.persistenceBlocked && (
              <button onClick={state.retryPersistence}>Thử lưu lại</button>
            )}
          </div>
        )}
        {state.actionError && state.view !== "portfolio" && (
          <div className="shell-alert" role="alert">
            <AlertTriangle size={16} />
            <span>{state.actionError}</span>
            <button
              aria-label="Đóng thông báo"
              onClick={state.clearActionError}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <main id="workspace-main" className="shell-main" tabIndex={-1}>
          <WorkspaceBoundary key={`${state.activeProjectId}/${state.view}`}>
            <Suspense
              fallback={
                <div className="empty-module" role="status">
                  Đang tải module tiến độ…
                </div>
              }
            >
              {state.view === "schedule" ? (
                <ScheduleWorkspace key={state.activeProjectId} />
              ) : state.view === "portfolio" ? (
                <PortfolioWorkspace />
              ) : state.view === "settings" ? (
                <ProjectSettings key={state.activeProjectId} />
              ) : state.view === "resources" ? (
                <ResourcesWorkspace key={state.activeProjectId} />
              ) : state.view === "execution" ? (
                <ExecutionWorkspace key={state.activeProjectId} />
              ) : state.view === "dashboard" ? (
                <DashboardWorkspace key={state.activeProjectId} />
              ) : (
                <DataWorkspace key={state.activeProjectId} />
              )}
            </Suspense>
          </WorkspaceBoundary>
        </main>
      </div>
      <FloatingThemeDock />
    </div>
  );
}
