export type ThemeId = "slate" | "classic" | "dark" | "blueprint" | "contrast";
export interface ThemePreset {
  id: ThemeId;
  name: string;
  shortName: string;
  dark: boolean;
  slate: string[];
  accent: string;
  task: string;
  critical: string;
  physical: string;
  duration: string;
  baseline: string;
  summary: string;
  milestone: string;
  hover: string;
  selection: string;
  dangerSurface: string;
  dangerText: string;
  successSurface: string;
  onAccent: string;
}
const slate = [
  "#f8fafc",
  "#f1f5f9",
  "#e2e8f0",
  "#cbd5e1",
  "#94a3b8",
  "#64748b",
  "#475569",
  "#334155",
  "#1e293b",
  "#0f172a",
];
const common = {
  slate,
  dark: false,
  physical: "#059669",
  duration: "#0ea5e9",
  baseline: "#94a3b8",
  summary: "#1e293b",
  milestone: "#d97706",
  hover: "#eef2ff",
  selection: "#e0e7ff",
  dangerSurface: "#fef2f2",
  dangerText: "#b91c1c",
  successSurface: "#d1fae5",
  onAccent: "#ffffff",
};
export const themes: ThemePreset[] = [
  {
    ...common,
    id: "slate",
    name: "Modern Enterprise Slate",
    shortName: "Enterprise Slate",
    accent: "#4f46e5",
    task: "#4f46e5",
    critical: "#e11d48",
  },
  {
    ...common,
    id: "classic",
    name: "MS Project Classic",
    shortName: "MS Project Classic",
    accent: "#107c41",
    task: "#0078d4",
    critical: "#d13438",
    physical: "#107c41",
    duration: "#69afe5",
    summary: "#144c2d",
    hover: "#edf7ef",
    selection: "#d9eddf",
  },
  {
    ...common,
    id: "dark",
    name: "Industrial Dark / CAD Mode",
    shortName: "CAD Dark",
    dark: true,
    slate: [
      "#0f172a",
      "#1e293b",
      "#3a4b63",
      "#52657e",
      "#7990ae",
      "#a9bad0",
      "#bac9db",
      "#d1ddeb",
      "#e3ebf5",
      "#f1f5f9",
    ],
    accent: "#06b6d4",
    task: "#06b6d4",
    critical: "#f43f5e",
    physical: "#34d399",
    duration: "#a78bfa",
    baseline: "#94a3b8",
    summary: "#e2e8f0",
    milestone: "#fbbf24",
    hover: "#163647",
    selection: "#1b485b",
    dangerSurface: "#401f2a",
    dangerText: "#fda4af",
    successSurface: "#143c35",
    onAccent: "#082f49",
  },
  {
    ...common,
    id: "blueprint",
    name: "Blueprint Technical",
    shortName: "Blueprint",
    slate: [
      "#eff5fc",
      "#e1ebf8",
      "#9fb5d2",
      "#8aa4c6",
      "#6d89ad",
      "#48678f",
      "#355782",
      "#244771",
      "#1e3a8a",
      "#10264d",
    ],
    accent: "#1e3a8a",
    task: "#1d4ed8",
    critical: "#b45309",
    duration: "#f59e0b",
    baseline: "#7188a6",
    summary: "#1e3a8a",
    milestone: "#d97706",
    hover: "#e5effc",
    selection: "#c9dcf9",
  },
  {
    ...common,
    id: "contrast",
    name: "High-Contrast Construction",
    shortName: "Construction",
    slate: [
      "#ffffff",
      "#f0f0f0",
      "#525252",
      "#737373",
      "#5c5c5c",
      "#404040",
      "#262626",
      "#171717",
      "#0a0a0a",
      "#000000",
    ],
    accent: "#003f88",
    task: "#003f88",
    critical: "#c00000",
    physical: "#006b35",
    duration: "#9c5300",
    baseline: "#606060",
    summary: "#000000",
    milestone: "#8a4b00",
    hover: "#e4eeff",
    selection: "#bfd6ff",
    dangerSurface: "#ffe6e6",
    dangerText: "#960000",
    successSurface: "#d8f3df",
  },
];
export const THEME_STORAGE_KEY = "forgeplan.theme.v1";
export function findTheme(id: string | null) {
  return themes.find((t) => t.id === id) ?? themes[0];
}
export function themeVariables(t: ThemePreset): Record<string, string> {
  const vars: Record<string, string> = {};
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].forEach(
    (step, i) => (vars[`--color-slate-${step}`] = t.slate[i]),
  );
  const semantic = {
    "surface-base": t.dark ? "#182336" : "#ffffff",
    "surface-canvas": t.slate[0],
    "surface-muted": t.slate[1],
    "text-primary": t.slate[9],
    "text-secondary": t.slate[7],
    "text-muted": t.slate[5],
    "border-default": t.slate[2],
    "planner-hover": t.hover,
    "planner-selection": t.selection,
    "planner-task": t.task,
    "planner-critical": t.critical,
    "planner-success": t.physical,
    "planner-duration": t.duration,
    "planner-baseline": t.baseline,
    "planner-summary": t.summary,
    "planner-milestone": t.milestone,
    accent: t.accent,
    "on-accent": t.onAccent,
    danger: t.critical,
    "danger-text": t.dangerText,
    "danger-surface": t.dangerSurface,
    "success-surface": t.successSurface,
    "color-indigo-50": t.hover,
    "color-indigo-100": t.selection,
    "color-indigo-200": t.selection,
    "color-indigo-300": t.task,
    "color-indigo-400": t.task,
    "color-indigo-500": t.accent,
    "color-indigo-600": t.accent,
    "color-indigo-700": t.accent,
    "color-indigo-900": t.slate[9],
    "color-rose-50": t.dangerSurface,
    "color-rose-100": t.dangerSurface,
    "color-rose-300": t.critical,
    "color-rose-500": t.critical,
    "color-rose-600": t.critical,
    "color-rose-700": t.dangerText,
    "color-rose-800": t.dangerText,
    "color-red-50": t.dangerSurface,
    "color-red-200": t.critical,
    "color-red-600": t.critical,
    "color-red-700": t.dangerText,
    "color-emerald-100": t.successSurface,
    "color-emerald-300": t.physical,
    "color-emerald-600": t.physical,
    "color-amber-600": t.milestone,
    "color-amber-700": t.milestone,
  };
  for (const [key, value] of Object.entries(semantic)) vars[`--${key}`] = value;
  return vars;
}
