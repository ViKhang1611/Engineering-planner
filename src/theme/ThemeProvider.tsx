import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { Moon, Palette, Sparkles, Sun, X } from "lucide-react";
import {
  APPEARANCE_STORAGE_KEY,
  defaultAppearance,
  findTheme,
  THEME_STORAGE_KEY,
  themeVariables,
  themes,
  wallpapers,
  type CustomAppearance,
  type GlassIntensity,
  type ThemeId,
  type ThemePreset,
  type WallpaperId,
} from "./themes";

const Context = createContext<{
  theme: ThemePreset;
  setTheme: (id: ThemeId) => void;
  appearance: CustomAppearance;
  updateAppearance: (patch: Partial<CustomAppearance>) => void;
  customizerOpen: boolean;
  setCustomizerOpen: (open: boolean) => void;
  error: string;
} | null>(null);

function loadAppearance(): CustomAppearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return defaultAppearance;
    const parsed = JSON.parse(raw) as Partial<CustomAppearance>;
    return {
      wallpaper: wallpapers.some((w) => w.id === parsed.wallpaper)
        ? (parsed.wallpaper as WallpaperId)
        : defaultAppearance.wallpaper,
      glass:
        parsed.glass === "crystal" ||
        parsed.glass === "frosted" ||
        parsed.glass === "solid"
          ? parsed.glass
          : defaultAppearance.glass,
      showHeroBanner:
        typeof parsed.showHeroBanner === "boolean"
          ? parsed.showHeroBanner
          : defaultAppearance.showHeroBanner,
    };
  } catch {
    return defaultAppearance;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setCurrent] = useState(() => {
    try {
      return findTheme(localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      return themes[0];
    }
  });
  const [appearance, setAppearance] =
    useState<CustomAppearance>(loadAppearance);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme.id;
    root.dataset.glass = appearance.glass;
    root.dataset.wallpaper = appearance.wallpaper;
    root.style.colorScheme = theme.dark ? "dark" : "light";
    for (const [key, value] of Object.entries(themeVariables(theme)))
      root.style.setProperty(key, value);

    const wp =
      wallpapers.find((w) => w.id === appearance.wallpaper) ?? wallpapers[0];
    root.style.setProperty(
      "--wallpaper-bg",
      theme.dark ? wp.darkBg : wp.lightBg,
    );
    root.style.setProperty("--hero-banner-bg", wp.bannerGradient);

    const alphaMap: Record<
      GlassIntensity,
      { shell: string; panel: string; sidebar: string; blur: string }
    > = theme.dark
      ? {
          crystal: {
            shell: "rgba(15, 23, 42, 0.56)",
            panel: "rgba(24, 35, 54, 0.62)",
            sidebar: "rgba(15, 23, 42, 0.48)",
            blur: "28px",
          },
          frosted: {
            shell: "rgba(15, 23, 42, 0.74)",
            panel: "rgba(24, 35, 54, 0.78)",
            sidebar: "rgba(15, 23, 42, 0.64)",
            blur: "24px",
          },
          solid: {
            shell: "rgba(15, 23, 42, 0.94)",
            panel: "rgba(24, 35, 54, 0.96)",
            sidebar: "rgba(15, 23, 42, 0.92)",
            blur: "10px",
          },
        }
      : {
          crystal: {
            shell: "rgba(255, 255, 255, 0.44)",
            panel: "rgba(255, 255, 255, 0.58)",
            sidebar: "rgba(255, 255, 255, 0.36)",
            blur: "28px",
          },
          frosted: {
            shell: "rgba(255, 255, 255, 0.62)",
            panel: "rgba(255, 255, 255, 0.74)",
            sidebar: "rgba(255, 255, 255, 0.48)",
            blur: "24px",
          },
          solid: {
            shell: "rgba(255, 255, 255, 0.92)",
            panel: "rgba(255, 255, 255, 0.96)",
            sidebar: "rgba(255, 255, 255, 0.88)",
            blur: "10px",
          },
        };
    const glassCfg = alphaMap[appearance.glass];
    root.style.setProperty("--glass-shell-bg", glassCfg.shell);
    root.style.setProperty("--glass-panel-bg", glassCfg.panel);
    root.style.setProperty("--glass-sidebar-bg", glassCfg.sidebar);
    root.style.setProperty("--glass-blur", glassCfg.blur);
    root.style.setProperty(
      "--glass-border",
      theme.dark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.65)",
    );
  }, [theme, appearance]);

  const setTheme = (id: ThemeId) => {
    const next = findTheme(id);
    setCurrent(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next.id);
      setError("");
    } catch {
      setError("Theme đã đổi nhưng trình duyệt không cho lưu lựa chọn.");
    }
  };

  const updateAppearance = (patch: Partial<CustomAppearance>) => {
    setAppearance((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage restriction on custom appearance
      }
      return next;
    });
  };

  return (
    <Context.Provider
      value={{
        theme,
        setTheme,
        appearance,
        updateAppearance,
        customizerOpen,
        setCustomizerOpen,
        error,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useTheme() {
  const context = useContext(Context);
  if (!context) throw new Error("ThemeProvider is required");
  return context;
}

export function ThemeSwitcher() {
  const { theme, setTheme, customizerOpen, setCustomizerOpen, error } =
    useTheme();
  return (
    <div className="theme-controls-wrap">
      <label className="theme-switcher" title={error || "Chủ đề giao diện"}>
        <span>Theme</span>
        <select
          aria-label="Theme giao diện"
          value={theme.id}
          onChange={(e) => setTheme(e.target.value as ThemeId)}
        >
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {error && <span role="status">!</span>}
      </label>
      <button
        type="button"
        className={`custom-ui-trigger ${customizerOpen ? "active" : ""}`}
        onClick={() => setCustomizerOpen(!customizerOpen)}
        title="Tuỳ chỉnh giao diện Glass & Nền Pastel"
      >
        <Sparkles size={13} />
        <span>Custom UI</span>
      </button>
    </div>
  );
}

export function FloatingThemeDock() {
  const {
    theme,
    setTheme,
    appearance,
    updateAppearance,
    customizerOpen,
    setCustomizerOpen,
  } = useTheme();

  const toggleDarkLight = () => {
    setTheme(theme.dark ? "slate" : "dark");
  };

  return (
    <>
      {customizerOpen && (
        <aside
          className="appearance-studio-popover"
          aria-label="Bảng tuỳ chỉnh giao diện"
        >
          <div className="studio-head">
            <div className="studio-title">
              <Palette size={15} />
              <strong>Custom Glass Studio</strong>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Đóng bảng tuỳ chỉnh"
              onClick={() => setCustomizerOpen(false)}
            >
              <X size={15} />
            </button>
          </div>

          <div className="studio-section">
            <span className="studio-label">PHỐI MÀU NỀN PASTEL / MESH</span>
            <div className="wallpaper-grid">
              {wallpapers.map((wp) => (
                <button
                  key={wp.id}
                  type="button"
                  className={`wallpaper-swatch ${appearance.wallpaper === wp.id ? "selected" : ""}`}
                  onClick={() => updateAppearance({ wallpaper: wp.id })}
                  title={wp.name}
                >
                  <i style={{ background: wp.preview }} />
                  <span>{wp.name.replace(/ \(.*\)/, "")}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="studio-section">
            <span className="studio-label">ĐỘ TRONG SUỐT KÍNH MỜ (GLASS)</span>
            <div className="glass-mode-pills">
              {(
                [
                  ["crystal", "Kính trong"],
                  ["frosted", "Kính mờ chuẩn"],
                  ["solid", "Nền đặc"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={appearance.glass === id ? "active" : ""}
                  onClick={() => updateAppearance({ glass: id })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-section">
            <span className="studio-label">CHỦ ĐỀ MÀU KỸ THUẬT (5 THEME)</span>
            <div className="preset-pills">
              {themes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={theme.id === t.id ? "active" : ""}
                  onClick={() => setTheme(t.id)}
                >
                  <i style={{ background: t.accent }} />
                  {t.shortName}
                </button>
              ))}
            </div>
          </div>

          <div className="studio-section studio-row">
            <span>Banner Hero chuyển sắc</span>
            <button
              type="button"
              role="switch"
              aria-checked={appearance.showHeroBanner}
              className={`studio-switch ${appearance.showHeroBanner ? "on" : ""}`}
              onClick={() =>
                updateAppearance({ showHeroBanner: !appearance.showHeroBanner })
              }
            >
              <i />
            </button>
          </div>
        </aside>
      )}

      <div className="floating-theme-dock">
        <button
          type="button"
          className="dock-Customize-btn"
          onClick={() => setCustomizerOpen(!customizerOpen)}
          title="Tuỳ chỉnh màu nền & hiệu ứng kính"
          aria-label="Mở bảng tuỳ chỉnh giao diện"
        >
          <Palette size={16} />
        </button>
        <button
          type="button"
          className="dock-moon-btn"
          onClick={toggleDarkLight}
          title={
            theme.dark
              ? "Chuyển sang giao diện Sáng Pastel"
              : "Chuyển sang giao diện Tối CAD"
          }
          aria-label="Chuyển chế độ Sáng hoặc Tối"
        >
          {theme.dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </div>
    </>
  );
}
