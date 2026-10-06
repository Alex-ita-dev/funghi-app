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
  const update = useCallback((change: (old: AppData) => AppData) => {
    if (!ref.current) return;
    const next = change(ref.current);
    if (next === ref.current) return;
    const snapshot = { ...next, savedAt: Date.now() };
    ref.current = snapshot;
    setData(snapshot);
    setSaving(true);
    const seq = ++revision.current;
    tail.current = tail.current
      .then(() => writeData(snapshot))
      .then(() => {
        if (revision.current === seq) {
          setSaving(false);
          setError("");
        }
      })
      .catch(() => {
        setSaving(false);
        setError(
          "Salvataggio non riuscito: i nuovi dati sono solo in memoria. Esporta un backup prima di chiudere e libera spazio sul dispositivo.",
        );
      });
  }, []);
  return { data, update, error, saving, locked };
}
