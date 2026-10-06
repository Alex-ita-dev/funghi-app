import { type Fix, distance } from "./model";

export type LiveFix = Fix & {
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
};
export type LocationPermission = PermissionState | "unknown" | "unsupported";
export const webLocationCapabilities = {
  backgroundTracking: false,
  openSystemSettings: false,
} as const;

// Native implementations must persist fixes outside the WebView before delivery.
export interface LocationAdapter {
  readonly backgroundTracking: boolean;
  locate(): Promise<LiveFix>;
  watch(
    onFix: (fix: LiveFix) => void,
    onError: (message: string) => void,
  ): Promise<() => void>;
  checkPermission(): Promise<LocationPermission>;
}
const finite = (n: number | null) =>
  n !== null && Number.isFinite(n) ? n : null;
export function normalizePosition(p: GeolocationPosition): LiveFix {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    accuracy: p.coords.accuracy,
    timestamp: p.timestamp,
    altitude: finite(p.coords.altitude),
    altitudeAccuracy: finite(p.coords.altitudeAccuracy),
    heading:
      p.coords.heading !== null &&
      p.coords.heading >= 0 &&
      p.coords.heading < 360
        ? finite(p.coords.heading)
        : null,
    speed: finite(p.coords.speed),
  };
}
export const normalizeDegrees = (n: number) => ((n % 360) + 360) % 360;
export function bearing(a: Fix, b: Fix): number {
  const r = Math.PI / 180;
  const dl = (b.lng - a.lng) * r;
  return normalizeDegrees(
    Math.atan2(
      Math.sin(dl) * Math.cos(b.lat * r),
      Math.cos(a.lat * r) * Math.sin(b.lat * r) -
        Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(dl),
    ) / r,
  );
}
export function movementHeading(
  previous: Fix | null,
  current: LiveFix,
): number | null {
  if (current.accuracy > 50) return null;
  if (current.heading !== null && (current.speed ?? 0) >= 0.7)
    return current.heading;
  if (!previous || previous.accuracy > 50) return null;
  const dt = (current.timestamp - previous.timestamp) / 1000;
  const metres = distance(previous, current);
  if (
    dt <= 0 ||
    dt > 30 ||
    metres < Math.max(10, previous.accuracy + current.accuracy) ||
    metres / dt > 12
  )
    return null;
  return bearing(previous, current);
}
export const cardinal = (heading: number) =>
  ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][
    Math.round(normalizeDegrees(heading) / 45) % 8
  ];
export const isRecent = (fix: Fix, now = Date.now()) =>
  now - fix.timestamp <= 30000 && fix.timestamp <= now + 5000;
export function coordinateText(fix: LiveFix, now = Date.now()): string {
  return `MycoTrail · ${isRecent(fix, now) ? "Posizione GPS" : "Ultima posizione nota (non attuale)"}\nLatitudine: ${fix.lat.toFixed(6)}\nLongitudine: ${fix.lng.toFixed(6)}\nPrecisione: ±${Math.round(fix.accuracy)} m\nQuota GPS: ${fix.altitude === null ? "non disponibile" : `${Math.round(fix.altitude)} m`}\nRilevata: ${new Date(fix.timestamp).toLocaleString("it-IT")}\nhttps://www.openstreetmap.org/?mlat=${fix.lat.toFixed(6)}&mlon=${fix.lng.toFixed(6)}#map=16/${fix.lat.toFixed(6)}/${fix.lng.toFixed(6)}`;
}
