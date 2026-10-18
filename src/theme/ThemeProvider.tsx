import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import {
  findTheme,
  THEME_STORAGE_KEY,
  themeVariables,
  themes,
  type ThemeId,
  type ThemePreset,
} from "./themes";
const Context = createContext<{
  theme: ThemePreset;
  setTheme: (id: ThemeId) => void;
  error: string;
} | null>(null);
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setCurrent] = useState(() => {
      try {
        return findTheme(localStorage.getItem(THEME_STORAGE_KEY));
      } catch {
        return themes[0];
      }
    }),
    [error, setError] = useState("");
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme.id;
    root.style.colorScheme = theme.dark ? "dark" : "light";
    for (const [key, value] of Object.entries(themeVariables(theme)))
      root.style.setProperty(key, value);
  }, [theme]);
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
  return (
    <Context.Provider value={{ theme, setTheme, error }}>
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
  const { theme, setTheme, error } = useTheme();
  return (
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
  );
}
