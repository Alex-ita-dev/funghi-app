import { it, expect } from "vitest";
import "fake-indexeddb/auto";
import { emptyData } from "../src/lib/model";
import { readData, readPhotoMeta } from "../src/lib/storage";
it("upgrades a real V1 database without rewriting existing journal bytes", async () => {
  const data = {
    ...emptyData(),
    finds: [
      {
        id: "legacy",
        kind: "spot",
        title: "Castagno",
        notes: "Note originali",
        createdAt: 100,
        lat: 43.123456,
        lng: 11.987654,
        source: "map",
        accuracy: null,
      },
    ],
  };
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.open("mycotrail", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("data");
    r.onsuccess = () => {
      const db = r.result;
      const t = db.transaction("data", "readwrite");
      t.objectStore("data").put(data, "main");
      t.oncomplete = () => {
        db.close();
        resolve();
      };
    };
    r.onerror = reject;
  });
  expect(await readData()).toEqual(data);
  expect(await readPhotoMeta()).toEqual([]);
  const stored = await new Promise((resolve) => {
    const r = indexedDB.open("mycotrail");
    r.onsuccess = () => {
      expect(r.result.version).toBe(2);
      const g = r.result.transaction("data").objectStore("data").get("main");
      g.onsuccess = () => {
        resolve(g.result);
        r.result.close();
      };
    };
  });
  expect(stored).toEqual(data);
});
