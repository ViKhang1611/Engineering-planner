import { useEffect } from "react";
import { workspaceStore } from "../store/workspaceStore";
import { WORKSPACE_VIEWS, type WorkspaceView } from "../domain/workspace";

/** Hash URLs work on any static host; all navigation state still lives in Zustand. */
export function useWorkspaceRouter() {
  useEffect(() => {
    const read = () => {
      const state = workspaceStore.getState();
      if (location.hash === "#/portfolio") {
        state.navigate("portfolio");
        return;
      }
      const match = location.hash.match(/^#\/projects\/([^/]+)\/([^/]+)$/);
      if (!match) return;
      try {
        const id = decodeURIComponent(match[1]);
        const view = match[2] as WorkspaceView;
        if (
          Object.hasOwn(state.projects, id) &&
          WORKSPACE_VIEWS.includes(view)
        ) {
          workspaceStore.setState({ activeProjectId: id, view });
        }
      } catch {
        /* Malformed URLs leave the last valid workspace intact. */
      }
    };
    const write = (replace = false) => {
      const state = workspaceStore.getState();
      const hash =
        state.view === "portfolio"
          ? "#/portfolio"
          : `#/projects/${encodeURIComponent(state.activeProjectId)}/${state.view}`;
      if (location.hash !== hash)
        window.history[replace ? "replaceState" : "pushState"](null, "", hash);
    };
    read();
    write(true);
    const unsubscribe = workspaceStore.subscribe((state, before) => {
      if (
        state.activeProjectId !== before.activeProjectId ||
        state.view !== before.view
      )
        write();
    });
    window.addEventListener("hashchange", read);
    return () => {
      unsubscribe();
      window.removeEventListener("hashchange", read);
    };
  }, []);
}
