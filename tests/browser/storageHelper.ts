import type { Page } from "@playwright/test";
export async function readStored(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        // No version: open whatever schema the app created (v2+).
        const request = indexedDB.open("forgeplan-enterprise");
        request.onsuccess = () => {
          const db = request.result;
          const read = db
            .transaction("workspace")
            .objectStore("workspace")
            .get("current");
          read.onsuccess = () => {
            resolve(read.result.document);
            db.close();
          };
          read.onerror = () => reject(read.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}
