import { useCallback, useEffect, useRef, useState } from "react";
import { type Fix } from "../lib/model";
import {
  normalizePosition,
  type LiveFix,
  type LocationPermission,
} from "../lib/location";
const options: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15000,
};
const message = (code: number) =>
  code === 1
    ? "GPS non autorizzato. Consenti la posizione nei permessi del sito e del browser, poi riprova. Trovi aiuto in Impostazioni."
    : code === 2
      ? "Posizione non disponibile. Prova in un punto più aperto."
      : "Il GPS non risponde. Spostati all’aperto e riprova.";
export function useGps(onFix: (fix: Fix) => void) {
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [permission, setPermission] = useState<LocationPermission>(
    navigator.geolocation ? "unknown" : "unsupported",
  );
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const callback = useRef(onFix);
  callback.current = onFix;
  const accept = useCallback((position: GeolocationPosition) => {
    const next = normalizePosition(position);
    setFix(next);
    setPermission("granted");
    setError("");
    // Keep the persisted V1 track schema unchanged; sensor metadata is live only.
    callback.current({
      lat: next.lat,
      lng: next.lng,
      accuracy: next.accuracy,
      timestamp: next.timestamp,
    });
    return next;
  }, []);
  useEffect(() => {
    let alive = true;
    let status: PermissionStatus | undefined;
    const change = () => {
      if (alive && status) setPermission(status.state);
    };
    const refresh = () => {
      if (!navigator.permissions || document.hidden) return;
      void navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => {
          if (!alive) return;
          status?.removeEventListener("change", change);
          status = result;
          change();
          status.addEventListener("change", change);
        })
        .catch(() => {});
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      status?.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    const listener = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, []);
  useEffect(() => {
    if (!enabled || !visible || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      accept,
      (e) => {
        setError(message(e.code));
        if (e.code === 1) {
          setPermission("denied");
          setEnabled(false);
        }
      },
      options,
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, visible, accept]);
  const locate = useCallback(
    () =>
      new Promise<LiveFix>((resolve, reject) => {
        if (!navigator.geolocation || !window.isSecureContext) {
          const text =
            "Il GPS richiede HTTPS e un browser con geolocalizzazione.";
          setError(text);
          setPermission("unsupported");
          reject(new Error(text));
          return;
        }
        setPending(true);
        navigator.geolocation.getCurrentPosition(
          (p) => {
            setPending(false);
            setEnabled(true);
            resolve(accept(p));
          },
          (e) => {
            setPending(false);
            if (e.code === 1) {
              setPermission("denied");
              setEnabled(false);
            }
            const text = message(e.code);
            setError(text);
            reject(new Error(text));
          },
          options,
        );
      }),
    [accept],
  );
  return { fix, error, enabled, pending, permission, locate };
}
