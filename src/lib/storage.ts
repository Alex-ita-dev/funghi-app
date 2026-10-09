import {
  type PhotoMeta,
  type PhotoEdit,
  type PhotoChange,
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
} from "./photos";
import { type AppData, emptyData, recoverData, dataSchema } from "./model";
import {
  defaultSettings,
  mergeSettings,
  settingsSchema,
  type SettingsPatch,
  type UserSettings,
} from "./preferences";
let connection: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open("mycotrail", 2);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("data"))
          database.createObjectStore("data");
        if (!database.objectStoreNames.contains("photoMeta"))
          database
            .createObjectStore("photoMeta", { keyPath: "id" })
            .createIndex("findingId", "findingId");
        if (!database.objectStoreNames.contains("photos"))
          database.createObjectStore("photos");
        if (!database.objectStoreNames.contains("photoThumbs"))
          database.createObjectStore("photoThumbs");
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Database occupato: chiudi le altre schede."));
    });
  return connection;
}
// Same DB/store, separate versioned record. Never replace or migrate `main`.
// Read both records in one transaction, before creating preferences: even an
// empty legacy journal counts as an existing installation.
export async function readSettings(
  locales: readonly string[],
): Promise<UserSettings> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("data", "readwrite");
    const store = tx.objectStore("data");
    const main = store.get("main");
    const prefs = store.get("settings");
    let result: UserSettings;
    let validationError: unknown;
    prefs.onsuccess = () => {
      try {
        result =
          prefs.result === undefined
            ? defaultSettings(locales, main.result !== undefined)
            : settingsSchema.parse(prefs.result);
        if (prefs.result === undefined) store.put(result, "settings");
      } catch (error) {
        validationError = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(validationError ?? tx.error);
  });
}
export async function writeSettings(
  patch: SettingsPatch,
): Promise<UserSettings> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("data", "readwrite");
    const store = tx.objectStore("data");
    const request = store.get("settings");
    let result: UserSettings;
    let validationError: unknown;
    request.onsuccess = () => {
      try {
        result = mergeSettings(settingsSchema.parse(request.result), patch);
        store.put(result, "settings");
      } catch (error) {
        validationError = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(validationError ?? tx.error);
  });
}
export async function readData(): Promise<AppData> {
  const database = await db();
  const raw = await new Promise<unknown>((resolve, reject) => {
    const request = database
      .transaction("data")
      .objectStore("data")
      .get("main");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return raw === undefined ? emptyData() : recoverData(raw);
}
export async function readPhotoMeta(findingId?: string): Promise<PhotoMeta[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const store = database.transaction("photoMeta").objectStore("photoMeta");
    const r = findingId
      ? store.index("findingId").getAll(findingId)
      : store.getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function readPhotoBlob(
  id: string,
  thumbnail = false,
): Promise<Blob | undefined> {
  const database = await db();
  const name = thumbnail ? "photoThumbs" : "photos";
  return new Promise((resolve, reject) => {
    const r = database.transaction(name).objectStore(name).get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function writeData(
  data: AppData,
  change?: PhotoChange,
): Promise<void> {
  // Validate before opening the atomic journal + photo transaction.
  dataSchema.parse(data);
  const incoming = change
    ? "replaceAll" in change
      ? change.replaceAll
      : change.photos
    : [];
  const grouped = new Map<string, PhotoEdit[]>();
  for (const p of incoming) {
    if (
      !data.finds.some((f) => f.id === p.findingId) ||
      (change && "findingId" in change && p.findingId !== change.findingId)
    )
      throw new Error("Invalid photo owner");
    if (
      p.blob &&
      (p.blob.type !== "image/jpeg" ||
        p.blob.size > MAX_PHOTO_BYTES ||
        !p.thumbnail ||
        p.thumbnail.size > 200000)
    )
      throw new Error("Invalid photo");
    grouped.set(p.findingId, [...(grouped.get(p.findingId) ?? []), p]);
  }
  if (new Set(incoming.map((p) => p.id)).size !== incoming.length)
    throw new Error("Duplicate photos");
  for (const rows of grouped.values())
    if (rows.length > MAX_PHOTOS || rows.filter((p) => p.primary).length !== 1)
      throw new Error("Invalid photo selection");
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(
      ["data", "photoMeta", "photos", "photoThumbs"],
      "readwrite",
    );
    const meta = tx.objectStore("photoMeta"),
      blobs = tx.objectStore("photos"),
      thumbs = tx.objectStore("photoThumbs");
    const main = tx.objectStore("data");
    // Only scan metadata if findings changed, never scan/decode full images on GPS updates.
    const previous = main.get("main");
    previous.onsuccess = () => {
      const oldIds = (previous.result?.finds ?? []).map(
        (f: { id: string }) => f.id,
      );
      const ids = new Set(data.finds.map((f) => f.id));
      if (!change && !oldIds.some((id: string) => !ids.has(id))) {
        main.put(data, "main");
        return;
      }
      const scan = meta.getAll();
      scan.onsuccess = () => {
        const existing = scan.result as PhotoMeta[];
        for (const p of incoming) {
          const old = existing.find((m) => m.id === p.id);
          if ((old && old.findingId !== p.findingId) || (!p.blob && !old)) {
            tx.abort();
            return;
          }
        }
        for (const row of existing) {
          if (
            !ids.has(row.findingId) ||
            (change &&
              ("replaceAll" in change ||
                (row.findingId === change.findingId &&
                  !incoming.some((p) => p.id === row.id))))
          ) {
            meta.delete(row.id);
            blobs.delete(row.id);
            thumbs.delete(row.id);
          }
        }
        for (const p of incoming) {
          const { blob, thumbnail, ...info } = p;
          meta.put(info);
          if (blob) {
            blobs.put(blob, p.id);
            thumbs.put(thumbnail, p.id);
          }
        }
        main.put(data, "main");
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Salvataggio interrotto"));
  });
}
export function download(content: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Capture all requested photo records in one readonly transaction: an edit in
// another task cannot mix old metadata with newly replaced/deleted image bytes.
export async function readPhotoArchive(
  data: AppData,
): Promise<import("./photos").Photo[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["photoMeta", "photos", "photoThumbs"]);
    const result: import("./photos").Photo[] = [];
    let failure: Error | undefined;
    let size = 0;
    const request = tx.objectStore("photoMeta").getAll();
    request.onsuccess = () => {
      for (const meta of request.result as PhotoMeta[]) {
        if (!data.finds.some((f) => f.id === meta.findingId)) continue;
        const blob = tx.objectStore("photos").get(meta.id),
          thumb = tx.objectStore("photoThumbs").get(meta.id);
        thumb.onsuccess = () => {
          if (!blob.result || !thumb.result) {
            failure = new Error("Foto mancanti: backup non creato.");
            tx.abort();
            return;
          }
          size += blob.result.size + thumb.result.size;
          if (size > 70 * 1024 * 1024) {
            failure = new Error("Il backup supera 100 MB.");
            tx.abort();
            return;
          }
          result.push({ ...meta, blob: blob.result, thumbnail: thumb.result });
        };
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(failure ?? tx.error);
  });
}
