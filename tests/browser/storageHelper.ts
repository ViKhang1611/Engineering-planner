import type { Page } from "@playwright/test";
/** Rebuilds the saved workspace document from the v3 layout (meta + one record per project). */
export async function readStored(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        // No version: open whatever schema the app created (v3+).
        const request = indexedDB.open("forgeplan-enterprise");
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["workspace", "projects"]);
          const meta = tx.objectStore("workspace").get("meta");
          const projects = tx.objectStore("projects").getAll();
          tx.oncomplete = () => {
            const byId = new Map(
              projects.result.map((r: any) => [r.project.id, r]),
            );
            const { revision, projectOrder, ...rest } = meta.result;
            resolve({
              ...rest,
              projects: projectOrder.map((id: string) => byId.get(id)),
            });
            db.close();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}
