import { type AppData, emptyData, recoverData } from "./model";
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
      const request = indexedDB.open("mycotrail", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("data");
      request.onsuccess = () => resolve(request.result);
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
export async function writeData(data: AppData): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("data", "readwrite");
    tx.objectStore("data").put(data, "main");
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
