export type ThemeId = "slate" | "classic" | "dark" | "blueprint" | "contrast";
export type WallpaperId =
  | "aurora"
  | "sunset"
  | "ocean"
  | "twilight"
  | "meadow"
  | "minimal";
export type GlassIntensity = "crystal" | "frosted" | "solid";

export interface WallpaperPreset {
  id: WallpaperId;
  name: string;
  preview: string;
  lightBg: string;
  darkBg: string;
  bannerGradient: string;
}

export const wallpapers: WallpaperPreset[] = [
  {
    id: "aurora",
    name: "Aurora Pastel (Mẫu Creative)",
    preview: "linear-gradient(135deg, #8b93d6 0%, #d8c8f0 48%, #f69db5 100%)",
    lightBg:
      "radial-gradient(circle at 8% 12%, #8e94d9 0%, transparent 45%), radial-gradient(circle at 88% 16%, #c6bef2 0%, transparent 48%), radial-gradient(circle at 14% 88%, #f594b3 0%, transparent 52%), radial-gradient(circle at 88% 85%, #f79ca8 0%, transparent 48%), linear-gradient(135deg, #9fa5e4 0%, #dcd6f7 48%, #f7b2c4 100%)",
    darkBg:
      "radial-gradient(circle at 12% 15%, #312e81 0%, transparent 48%), radial-gradient(circle at 85% 20%, #1e1b4b 0%, transparent 50%), radial-gradient(circle at 18% 85%, #831843 0%, transparent 52%), radial-gradient(circle at 88% 85%, #4c1d95 0%, transparent 48%), linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #3b0764 100%)",
    bannerGradient:
      "linear-gradient(112deg, #db2777 0%, #f43f5e 34%, #fb923c 70%, #facc15 100%)",
  },
  {
    id: "sunset",
    name: "Sunset Coral",
    preview: "linear-gradient(135deg, #f43f5e 0%, #fb923c 50%, #fde047 100%)",
    lightBg:
      "radial-gradient(circle at 10% 15%, #fda4af 0%, transparent 48%), radial-gradient(circle at 88% 15%, #fed7aa 0%, transparent 50%), radial-gradient(circle at 20% 85%, #f472b6 0%, transparent 50%), radial-gradient(circle at 85% 85%, #fb923c 0%, transparent 48%), linear-gradient(135deg, #fecdd3 0%, #ffedd5 50%, #fde68a 100%)",
    darkBg:
      "radial-gradient(circle at 15% 15%, #7f1d1d 0%, transparent 50%), radial-gradient(circle at 85% 85%, #7c2d12 0%, transparent 50%), linear-gradient(135deg, #1c1917 0%, #450a0a 52%, #431407 100%)",
    bannerGradient:
      "linear-gradient(112deg, #7c3aed 0%, #db2777 45%, #fb923c 100%)",
  },
  {
    id: "ocean",
    name: "Ocean Breeze",
    preview: "linear-gradient(135deg, #38bdf8 0%, #818cf8 52%, #c084fc 100%)",
    lightBg:
      "radial-gradient(circle at 10% 18%, #7dd3fc 0%, transparent 48%), radial-gradient(circle at 88% 15%, #c7d2fe 0%, transparent 50%), radial-gradient(circle at 16% 86%, #a5b4fc 0%, transparent 52%), radial-gradient(circle at 86% 84%, #f0abfc 0%, transparent 48%), linear-gradient(135deg, #bae6fd 0%, #e0e7ff 50%, #f3e8ff 100%)",
    darkBg:
      "radial-gradient(circle at 12% 18%, #0c4a6e 0%, transparent 50%), radial-gradient(circle at 85% 82%, #312e81 0%, transparent 50%), linear-gradient(135deg, #082f49 0%, #0f172a 52%, #1e1b4b 100%)",
    bannerGradient:
      "linear-gradient(112deg, #0284c7 0%, #4f46e5 48%, #db2777 100%)",
  },
  {
    id: "twilight",
    name: "Cyber Lavender",
    preview: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    lightBg:
      "radial-gradient(circle at 12% 15%, #a5b4fc 0%, transparent 48%), radial-gradient(circle at 88% 18%, #e9d5ff 0%, transparent 50%), radial-gradient(circle at 18% 85%, #f9a8d4 0%, transparent 50%), linear-gradient(135deg, #c7d2fe 0%, #f3e8ff 50%, #fce7f3 100%)",
    darkBg:
      "radial-gradient(circle at 15% 20%, #3b0764 0%, transparent 50%), radial-gradient(circle at 85% 80%, #1e1b4b 0%, transparent 50%), linear-gradient(135deg, #090d16 0%, #1e1b4b 50%, #4a044e 100%)",
    bannerGradient:
      "linear-gradient(112deg, #4f46e5 0%, #9333ea 45%, #ec4899 80%, #f97316 100%)",
  },
  {
    id: "meadow",
    name: "Mint & Peach",
    preview: "linear-gradient(135deg, #6ee7b7 0%, #bfdbfe 50%, #fbcfe8 100%)",
    lightBg:
      "radial-gradient(circle at 12% 15%, #a7f3d0 0%, transparent 48%), radial-gradient(circle at 88% 18%, #bfdbfe 0%, transparent 50%), radial-gradient(circle at 20% 85%, #fbcfe8 0%, transparent 50%), linear-gradient(135deg, #d1fae5 0%, #e0f2fe 50%, #fce7f3 100%)",
    darkBg:
      "radial-gradient(circle at 15% 20%, #064e3b 0%, transparent 50%), radial-gradient(circle at 85% 80%, #1e3a8a 0%, transparent 50%), linear-gradient(135deg, #022c22 0%, #0f172a 55%, #1e1b4b 100%)",
    bannerGradient:
      "linear-gradient(112deg, #059669 0%, #0ea5e9 52%, #6366f1 100%)",
  },
  {
    id: "minimal",
    name: "Studio Pearl",
    preview: "linear-gradient(135deg, #cbd5e1 0%, #e2e8f0 50%, #f8fafc 100%)",
    lightBg:
      "radial-gradient(circle at 15% 15%, #dbeafe 0%, transparent 50%), radial-gradient(circle at 85% 85%, #fae8ff 0%, transparent 50%), linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 50%, #e0e7ff 100%)",
    darkBg: "linear-gradient(135deg, #090d16 0%, #0f172a 50%, #1e293b 100%)",
    bannerGradient:
      "linear-gradient(112deg, #2563eb 0%, #7c3aed 50%, #db2777 100%)",
  },
];

export interface CustomAppearance {
  wallpaper: WallpaperId;
  glass: GlassIntensity;
  showHeroBanner: boolean;
}

export const APPEARANCE_STORAGE_KEY = "forgeplan.appearance.v1";

export const defaultAppearance: CustomAppearance = {
  wallpaper: "aurora",
  glass: "frosted",
  showHeroBanner: true,
};

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
