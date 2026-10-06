import { useCallback, useEffect, useRef, useState } from "react";
import { type Fix } from "../lib/model";
const options: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15000,
};
const normalize = (p: GeolocationPosition): Fix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  accuracy: p.coords.accuracy,
  timestamp: p.timestamp,
});
const message = (code: number) =>
  code === 1
    ? "GPS non autorizzato. Consenti la posizione nelle impostazioni del sito in Safari, poi riprova."
    : code === 2
      ? "Posizione non disponibile. Prova in un punto più aperto."
      : "Il GPS non risponde. Spostati all’aperto e riprova.";
export function useGps(onFix: (fix: Fix) => void) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const callback = useRef(onFix);
  callback.current = onFix;
  const accept = useCallback((position: GeolocationPosition) => {
    const next = normalize(position);
    setFix(next);
    setError("");
    callback.current(next);
    return next;
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
      (e) => setError(message(e.code)),
      options,
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, visible, accept]);
  const locate = useCallback(
    () =>
      new Promise<Fix>((resolve, reject) => {
        if (!navigator.geolocation || !window.isSecureContext) {
          const text =
            "Il GPS richiede HTTPS e un browser con geolocalizzazione.";
          setError(text);
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
            const text = message(e.code);
            setError(text);
            reject(new Error(text));
          },
          options,
        );
      }),
    [accept],
  );
  return { fix, error, enabled, pending, locate };
}
