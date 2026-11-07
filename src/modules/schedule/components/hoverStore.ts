import { useSyncExternalStore } from "react";

/**
 * Hovered row id outside React state. Each row subscribes to "am I hovered",
 * so moving the pointer re-renders only the row left and the row entered,
 * not the whole schedule.
 */
export function createHoverStore() {
  let current: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(id: string | null) {
      if (id === current) return;
      current = id;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
export type HoverStore = ReturnType<typeof createHoverStore>;

export function useIsHovered(store: HoverStore, id: string) {
  return useSyncExternalStore(store.subscribe, () => store.get() === id);
}
