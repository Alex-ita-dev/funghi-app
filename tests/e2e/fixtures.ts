import type { Page } from "@playwright/test";

// Seed V1 before application code runs, not by bypassing onboarding in production.
export async function seedLegacy(
  page: Page,
  data: unknown = { version: 1, savedAt: 1, car: null, trips: [], finds: [] },
) {
  await page.route("**/__test_seed", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Fixture</title>",
    }),
  );
  await page.goto("/__test_seed");
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("mycotrail", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("data");
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("data", "readwrite");
          tx.objectStore("data").put(data, "main");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    data,
  );
  await page.unroute("**/__test_seed");
}
export async function readRecord(page: Page, key: "main" | "settings") {
  return page.evaluate(
    (key) =>
      new Promise<any>((resolve, reject) => {
        const open = indexedDB.open("mycotrail", 1);
        open.onsuccess = () => {
          const db = open.result;
          const r = db.transaction("data").objectStore("data").get(key);
          r.onsuccess = () => {
            resolve(r.result);
            db.close();
          };
          r.onerror = () => reject(r.error);
        };
        open.onerror = () => reject(open.error);
      }),
    key,
  );
}
