import { z } from "zod";
import {
  environmentSchema,
  finite,
  type Environment,
  type EnvironmentalDay,
} from "../lib/mycoScore";
import type { Coordinate } from "../lib/model";
export const CACHE_TTL = 6 * 3600000;
export const CACHE_MAX_AGE = 7 * 86400000;
export const CACHE_LIMIT = 32;
const CACHE_KEY = "mycotrail.mycoscore.v1";
export const gridPoint = (p: Coordinate): Coordinate => ({
  lat: Number(p.lat.toFixed(2)),
  lng: Number(p.lng.toFixed(2)),
});
const key = (p: Coordinate) => `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
let memory: Environment[] = [];
export function clearEnvironmentMemory() {
  memory = [];
}
function prune(rows: Environment[], now: number) {
  return rows
    .filter((r) => now >= r.fetchedAt && now - r.fetchedAt < CACHE_MAX_AGE)
    .sort((a, b) => b.fetchedAt - a.fetchedAt)
    .filter((r, i, all) => all.findIndex((x) => key(x) === key(r)) === i)
    .slice(0, CACHE_LIMIT);
}
function readCache(now: number) {
  try {
    const stored = z
      .array(environmentSchema)
      .max(100)
      .parse(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]"));
    memory = prune([...memory, ...stored], now);
  } catch {
    memory = prune(memory, now);
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memory));
  } catch {
    /* memory-only if storage unavailable */
  }
  return memory;
}
export function cacheEnvironment(env: Environment, now = Date.now()) {
  memory = prune(
    [env, ...readCache(now).filter((r) => key(r) !== key(env))],
    now,
  );
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memory));
  } catch {
    /* quota/private browser */
  }
}
export function cachedEnvironment(p: Coordinate, now = Date.now()) {
  return readCache(now).find((r) => key(r) === key(gridPoint(p)));
}
const series = z
  .object({ time: z.array(z.string()).max(800) })
  .catchall(z.unknown());
const responseSchema = z.object({
  elevation: z.unknown().optional(),
  daily: series,
  hourly: series.optional(),
});
const DAY = 86400000;
export function parseEnvironment(
  raw: unknown,
  point: Coordinate,
  now: number,
): Environment {
  const data = responseSchema.parse(raw);
  const today = Math.floor(now / DAY) * DAY;
  const daily = new Map(data.daily.time.map((date, i) => [date, i]));
  const hourly = data.hourly;
  const range = (v: unknown, min: number, max: number) =>
    finite(v) && v >= min && v <= max ? v : null;
  function read(name: string, date: string, min: number, max: number) {
    const i = daily.get(date),
      values = data.daily[name];
    return i !== undefined && Array.isArray(values)
      ? range(values[i], min, max)
      : null;
  }
  function mean(name: string, date: string, min: number, max: number) {
    const values = hourly?.[name];
    if (!hourly || !Array.isArray(values)) return null;
    const samples = hourly.time
      .flatMap((t, i) =>
        t.startsWith(date + "T") ? [range(values[i], min, max)] : [],
      )
      .filter(finite);
    return samples.length >= 20 && samples.length <= 24
      ? samples.reduce((s, n) => s + n, 0) / samples.length
      : null;
  }
  const days: EnvironmentalDay[] = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(today - (30 - i) * DAY).toISOString().slice(0, 10);
    const rain = read("rain_sum", date, 0, 2000),
      showers = read("showers_sum", date, 0, 2000);
    return {
      date,
      rain: rain !== null && showers !== null ? rain + showers : null,
      air: read("temperature_2m_mean", date, -100, 70),
      min: read("temperature_2m_min", date, -100, 70),
      max: read("temperature_2m_max", date, -100, 70),
      et0: read("et0_fao_evapotranspiration", date, 0, 100),
      humidity: mean("relative_humidity_2m", date, 0, 100),
      soil: mean("soil_temperature_6cm", date, -100, 80),
      moisture: mean("soil_moisture_3_to_9cm", date, 0, 1),
    };
  });
  return {
    version: 1,
    ...gridPoint(point),
    fetchedAt: now,
    elevationM: range(data.elevation, -500, 9000),
    aspect: null,
    slopeDegrees: null,
    days,
  };
}
export async function loadEnvironment(
  point: Coordinate,
  signal: AbortSignal,
  now = Date.now(),
): Promise<{ data: Environment; cached: boolean; stale: boolean }> {
  signal.throwIfAborted();
  const rounded = gridPoint(point),
    cached = cachedEnvironment(rounded, now);
  if (cached && now - cached.fetchedAt < CACHE_TTL)
    return { data: cached, cached: true, stale: false };
  if (!navigator.onLine) {
    if (cached) return { data: cached, cached: true, stale: true };
    throw new Error("myco.offline");
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 12000);
  try {
    const params = new URLSearchParams({
      latitude: String(rounded.lat),
      longitude: String(rounded.lng),
      past_days: "30",
      forecast_days: "0",
      timezone: "GMT",
      temperature_unit: "celsius",
      precipitation_unit: "mm",
      daily:
        "rain_sum,showers_sum,temperature_2m_mean,temperature_2m_min,temperature_2m_max,et0_fao_evapotranspiration",
      hourly:
        "relative_humidity_2m,soil_temperature_6cm,soil_moisture_3_to_9cm",
    });
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      {
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    );
    if (!response.ok) throw new Error("myco.error");
    const data = parseEnvironment(await response.json(), rounded, now);
    signal.throwIfAborted();
    if (
      !data.days.some((d) =>
        Object.entries(d).some(([k, v]) => k !== "date" && finite(v)),
      )
    )
      throw new Error("myco.missing");
    cacheEnvironment(data, now);
    return { data, cached: false, stale: false };
  } catch (error) {
    if (signal.aborted) throw error;
    if (cached) return { data: cached, cached: true, stale: true };
    throw new Error("myco.error");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
