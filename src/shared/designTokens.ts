import type { CSSProperties } from "react";

/** Geometry shared by JS renderers and the App Shell CSS custom properties. */
export const layout = {
  rowHeight: 36,
  timelineHeaderHeight: 56,
  appHeaderHeight: 48,
  sidebarWidth: 208,
  compactSidebarWidth: 56,
  controlRadius: 6,
} as const;

export const layoutVariables = {
  "--row-height": `${layout.rowHeight}px`,
  "--timeline-header-height": `${layout.timelineHeaderHeight}px`,
  "--shell-header-height": `${layout.appHeaderHeight}px`,
  "--sidebar-width": `${layout.sidebarWidth}px`,
  "--sidebar-compact-width": `${layout.compactSidebarWidth}px`,
  "--control-radius": `${layout.controlRadius}px`,
} as CSSProperties;
