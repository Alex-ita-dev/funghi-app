// Local, per-analysis accounting. Weak keys and no timers, persistence or telemetry.
export type RequestCounts = Record<string, number>;
const scopes = new WeakMap<AbortSignal, RequestCounts>();
export function trackRequests(signal: AbortSignal, counts: RequestCounts) {
  scopes.set(signal, counts);
}
export function inheritMetrics(parent: AbortSignal, child: AbortSignal) {
  const counts = scopes.get(parent);
  if (counts) scopes.set(child, counts);
}
export function countRequest(signal: AbortSignal, url: string) {
  const counts = scopes.get(signal);
  if (!counts) return;
  const parsed = new URL(url);
  const provider = parsed.pathname.endsWith("getSamples")
    ? "landCover"
    : parsed.pathname.endsWith("elevation")
      ? "elevation"
      : parsed.pathname.endsWith("forecast")
        ? "weather"
        : "marine";
  counts[provider] = (counts[provider] ?? 0) + 1;
}
