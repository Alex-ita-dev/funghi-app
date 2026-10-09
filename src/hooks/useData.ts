import type { PhotoChange } from "../lib/photos";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AppData } from "../lib/model";
import { readData, writeData } from "../lib/storage";

export function useData() {
  const [data, setData] = useState<AppData | null>(null);
  const ref = useRef<AppData | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const tail = useRef(Promise.resolve());
  const revision = useRef(0);
  useEffect(() => {
    let alive = true;
    let unlock: (() => void) | undefined;
    const load = async () => {
      try {
        const value = await readData();
        if (alive) {
          ref.current = value;
          setData(value);
        }
      } catch {
        if (alive)
          setError(
            "Impossibile leggere i dati salvati. Non verranno sovrascritti. Prova a riaprire MycoTrail in una finestra non privata del tuo browser.",
          );
      }
    };
    // Only one writer per browser profile: another tab cannot overwrite an outing.
    if (navigator.locks) {
      void navigator.locks.request(
        "mycotrail-writer",
        { ifAvailable: true },
        async (lock) => {
          if (!alive) return;
          if (!lock) {
            setLocked(true);
            return;
          }
          await load();
          if (alive)
            await new Promise<void>((resolve) => {
              unlock = resolve;
            });
        },
      );
    } else void load();
    return () => {
      alive = false;
      unlock?.();
    };
  }, []);
  const update = useCallback(
    (
      change: (old: AppData) => AppData,
      photos?: PhotoChange,
    ): Promise<boolean> => {
      if (!ref.current) return Promise.resolve(false);
      const seq = ++revision.current;
      setSaving(true);
      const operation = tail.current
        .then(async () => {
          const next = change(ref.current!);
          if (next === ref.current && !photos) return true;
          const snapshot = { ...next, savedAt: Date.now() };
          // Photo edits/imports become visible only after the atomic transaction commits.
          // Evaluate queued changes against the latest state so a GPS fix cannot
          // overwrite a concurrently saved finding or restored journal.
          if (!photos) {
            ref.current = snapshot;
            setData(snapshot);
          }
          await writeData(snapshot, photos);
          if (photos) {
            ref.current = snapshot;
            setData(snapshot);
          }
          return true;
        })
        .then((ok) => {
          if (revision.current === seq) {
            setSaving(false);
            setError("");
          }
          return ok;
        })
        .catch((cause: unknown) => {
          const error = cause as { name?: string; message?: string };
          console.error("Local save failed:", error?.name, error?.message);
          if (revision.current === seq) setSaving(false);
          setError(
            "Salvataggio non riuscito: i nuovi dati sono solo in memoria. Esporta un backup prima di chiudere e libera spazio sul dispositivo.",
          );
          return false;
        });
      tail.current = operation.then(() => {});
      return operation;
    },
    [],
  );
  return { data, update, error, saving, locked };
}
