import { useMemo, useState } from "react";
import { cols, type ColumnKey } from "./scheduleShared";

const STORAGE_KEY = "forgeplan.schedule.hiddenColumns";
/** Columns that identify a row and cannot be hidden. */
export const FIXED_COLUMNS: readonly ColumnKey[] = ["wbs", "name"];

function load(): Set<ColumnKey> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(
      (Array.isArray(raw) ? raw : []).filter(
        (key): key is ColumnKey =>
          cols.some((c) => c.key === key) && !FIXED_COLUMNS.includes(key),
      ),
    );
  } catch {
    return new Set();
  }
}

/**
 * Hidden WBS grid columns, remembered per device (a view preference, not
 * project data, so it is not synced or exported).
 */
export function useColumnPrefs() {
  const [hidden, setHidden] = useState(load);
  const columns = useMemo(
    () => cols.filter((c) => !hidden.has(c.key)),
    [hidden],
  );
  const toggle = (key: ColumnKey) => {
    if (FIXED_COLUMNS.includes(key)) return;
    setHidden((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* Storage blocked: keep the choice for this session only. */
      }
      return next;
    });
  };
  return { columns, hidden, toggle };
}
