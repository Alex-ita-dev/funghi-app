// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  computeMycoScore,
  summarizeEnvironment,
  classifyScore,
  curve,
  type Environment,
} from "../src/lib/mycoScore";
import {
  cacheEnvironment,
  cachedEnvironment,
  clearEnvironmentMemory,
  CACHE_TTL,
  CACHE_MAX_AGE,
  CACHE_LIMIT,
  loadEnvironment,
  parseEnvironment,
} from "../src/services/mycoEnvironment";
import { formatTemperature, formatPrecipitation } from "../src/lib/units";
import { defaultSettings } from "../src/lib/preferences";
const now = Date.UTC(2026, 9, 9, 12),
  day = 86400000;
const point = { lat: 43.52, lng: 11.49 };
const env = (): Environment => ({
  version: 1,
  ...point,
  fetchedAt: now,
  elevationM: 260,
  aspect: null,
  slopeDegrees: null,
  days: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 9, 9) - (30 - i) * day)
      .toISOString()
      .slice(0, 10),
    rain: i === 25 ? 10 : 3,
    air: 17,
    min: 12,
    max: 22,
    humidity: 80,
    soil: 16,
    moisture: 0.3,
    et0: 2,
  })),
});
function response() {
  const e = env();
  return {
    elevation: 260,
    daily: {
      time: e.days.map((d) => d.date),
      rain_sum: e.days.map((d) => d.rain),
      showers_sum: e.days.map(() => 0),
      temperature_2m_mean: e.days.map((d) => d.air),
      temperature_2m_min: e.days.map((d) => d.min),
      temperature_2m_max: e.days.map((d) => d.max),
      et0_fao_evapotranspiration: e.days.map((d) => d.et0),
    },
    hourly: {
      time: e.days.flatMap((d) =>
        Array.from(
          { length: 24 },
          (_, h) => `${d.date}T${String(h).padStart(2, "0")}:00`,
        ),
      ),
      relative_humidity_2m: Array(720).fill(80),
      soil_temperature_6cm: Array(720).fill(16),
      soil_moisture_3_to_9cm: Array(720).fill(0.3),
    },
  };
}
beforeEach(() => {
  localStorage.clear();
  clearEnvironmentMemory();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("scores favourable conditions above dry, saturated, hot and frozen conditions", () => {
  const good = computeMycoScore(env()).score!;
  for (const patch of [
    { moisture: 0.04 },
    { moisture: 0.6 },
    { air: 40, soil: 36 },
    { air: -4, soil: -2 },
  ]) {
    const e = env();
    e.days = e.days.map((d) => ({ ...d, ...patch }));
    expect(computeMycoScore(e).score).toBeLessThan(good);
  }
});
it("penalizes excessive rain, immediate rain, long drought and evaporation", () => {
  const good = computeMycoScore(env()).score!;
  for (const patch of [{ rain: 100 }, { rain: 6 }, { rain: 0 }, { et0: 15 }]) {
    const e = env();
    e.days = e.days.map((d) => ({ ...d, ...patch }));
    expect(computeMycoScore(e).score).toBeLessThan(good);
    expect(computeMycoScore(e).score).toBeLessThan(100);
  }
});
it("always returns a bounded integer or unavailable, never NaN, for both profiles", () => {
  for (const profile of ["generic", "porcini"] as const)
    for (let i = -30; i < 80; i++) {
      const e = env();
      e.days = e.days.map((d) => ({
        ...d,
        air: i,
        soil: i,
        moisture: i / 100,
        rain: Math.abs(i) * 10,
        et0: Math.abs(i),
      }));
      const r = computeMycoScore(e, profile);
      expect(Number.isInteger(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  expect(curve(NaN, [0, 1, 2, 3])).toBeNull();
  expect(curve(Infinity, [0, 1, 2, 3])).toBeNull();
});
it("renormalizes missing factors and distinguishes an absent measurement from zero", () => {
  const e = env();
  e.days = e.days.map((d) => ({ ...d, moisture: null }));
  const result = computeMycoScore(e);
  expect(result.coverage).toBe(75);
  expect(result.reliability).toBe("medium");
  expect(result.factors.find((f) => f.id === "moisture")!.score).toBeNull();
  expect(result.score).toBe(
    Math.round(
      result.factors.reduce((s, f) => s + (f.score ?? 0) * f.weight, 0) / 75,
    ),
  );
  e.days = e.days.map((d) => ({ ...d, moisture: 0 }));
  expect(computeMycoScore(e).score).toBeLessThan(result.score!);
});
it("returns no score and low completeness when all environmental factors are absent", () => {
  const e = env();
  e.days = e.days.map((d) => ({
    ...d,
    rain: null,
    air: null,
    min: null,
    max: null,
    humidity: null,
    soil: null,
    moisture: null,
    et0: null,
  }));
  expect(computeMycoScore(e)).toMatchObject({
    score: null,
    classification: null,
    reliability: "low",
    coverage: 0,
    explanations: [],
  });
});
it("does not fill rain gaps or infer last rainfall across a missing day", () => {
  const e = env();
  e.days[29].rain = null;
  const m = summarizeEnvironment(e);
  expect(m.rain7).toBeNull();
  expect(m.rain30).toBeNull();
  expect(m.postRain).toBeNull();
  e.days = e.days.map((d) => ({ ...d, rain: 0 }));
  expect(summarizeEnvironment(e).postRain).toBe(30);
});
it("requires 80% coverage for means and every day for totals", () => {
  const e = env();
  e.days[29].air = null;
  expect(summarizeEnvironment(e).air).toBe(17);
  e.days[28].air = null;
  expect(summarizeEnvironment(e).air).toBeNull();
});
it("classifies all boundary values and derives explanations from computed factors", () => {
  expect([0, 24, 25, 44, 45, 64, 65, 79, 80, 100].map(classifyScore)).toEqual([
    "poor",
    "poor",
    "low",
    "low",
    "fair",
    "fair",
    "good",
    "good",
    "veryGood",
    "veryGood",
  ]);
  const e = env();
  expect(computeMycoScore(e).reliability).toBe("high");
  e.days = e.days.map((d) => ({ ...d, moisture: 0 }));
  const r = computeMycoScore(e);
  expect(r.explanations[0].id).toBe("moisture");
  expect(r.explanations.every((x) => r.factors.includes(x))).toBe(true);
});
it("unit formatting never modifies raw inputs or score", () => {
  const e = env(),
    before = JSON.stringify(e),
    score = computeMycoScore(e).score;
  const p = defaultSettings(["en"], true).preferences;
  expect(formatTemperature(20, { ...p, temperatureUnit: "F" })).toBe("68 °F");
  expect(formatPrecipitation(25.4, { ...p, precipitationUnit: "in" })).toBe(
    "1 in",
  );
  expect(JSON.stringify(e)).toBe(before);
  expect(computeMycoScore(e).score).toBe(score);
});
it("adapts 30 completed UTC days, liquid rain plus showers and hourly soil means", () => {
  const raw = response();
  raw.daily.showers_sum[29] = 2;
  const e = parseEnvironment(raw, point, now);
  expect(e.days).toHaveLength(30);
  expect(e.days[29]).toMatchObject({ date: "2026-10-08", rain: 5, soil: 16 });
  expect(e.days[29].moisture).toBeCloseTo(0.3);
  expect(e.aspect).toBeNull();
  expect(e.slopeDegrees).toBeNull();
});
it("rejects malformed JSON structure, treats invalid numbers and incomplete hours as missing", () => {
  expect(() => parseEnvironment({ error: true }, point, now)).toThrow();
  const raw = response();
  raw.hourly.soil_moisture_3_to_9cm = Array(720).fill(-1);
  raw.hourly.relative_humidity_2m = Array(720).fill(null);
  const e = parseEnvironment(raw, point, now);
  expect(e.days[29].moisture).toBeNull();
  expect(e.days[29].humidity).toBeNull();
});
it("reuses nearby cells, persists cache, expires at TTL and bounds retention and records", () => {
  cacheEnvironment(env(), now);
  clearEnvironmentMemory();
  expect(cachedEnvironment({ lat: 43.521, lng: 11.491 }, now)).toBeDefined();
  for (let i = 0; i < 40; i++)
    cacheEnvironment({ ...env(), lat: i, fetchedAt: now + i }, now + i);
  expect(
    JSON.parse(localStorage.getItem("mycotrail.mycoscore.v1")!),
  ).toHaveLength(CACHE_LIMIT);
  expect(
    cachedEnvironment({ lat: 39, lng: 11.49 }, now + CACHE_MAX_AGE + 100),
  ).toBeUndefined();
  expect(
    JSON.parse(localStorage.getItem("mycotrail.mycoscore.v1")!),
  ).toHaveLength(0);
});
it("uses valid cache with no network, refreshes after TTL and sends only environmental parameters", async () => {
  cacheEnvironment(env(), now);
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(response())));
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  expect(
    (await loadEnvironment(point, signal, now + CACHE_TTL - 1)).cached,
  ).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
  await loadEnvironment(point, signal, now + CACHE_TTL);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.searchParams.get("past_days")).toBe("30");
  expect(url.searchParams.get("forecast_days")).toBe("0");
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
});
it("supports stale offline cache and rejects offline with no compatible cell", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  cacheEnvironment(env(), now);
  expect(
    (
      await loadEnvironment(
        point,
        new AbortController().signal,
        now + CACHE_TTL,
      )
    ).stale,
  ).toBe(true);
  await expect(
    loadEnvironment({ lat: 0, lng: 0 }, new AbortController().signal, now),
  ).rejects.toThrow("myco.offline");
});
it("handles HTTP failures and invalid JSON, preserving stale data", async () => {
  for (const response of [
    new Response("bad", { status: 429 }),
    new Response("not JSON"),
    new Response("{}"),
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(
      loadEnvironment(point, new AbortController().signal, now),
    ).rejects.toThrow("myco.error");
  }
  cacheEnvironment(env(), now);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
  expect(
    (
      await loadEnvironment(
        point,
        new AbortController().signal,
        now + CACHE_TTL,
      )
    ).stale,
  ).toBe(true);
});
it("cancels without caching late responses or substituting stale data", async () => {
  const controller = new AbortController();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => {
      controller.abort();
      return new Response(JSON.stringify(response()));
    }),
  );
  await expect(
    loadEnvironment(point, controller.signal, now),
  ).rejects.toThrow();
  expect(cachedEnvironment(point, now)).toBeUndefined();
});
it("times out and releases a stuck request", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(
        (_url, opts) =>
          new Promise((_, reject) =>
            opts.signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          ),
      ),
  );
  const promise = expect(
    loadEnvironment(point, new AbortController().signal, now),
  ).rejects.toThrow("myco.error");
  await vi.advanceTimersByTimeAsync(12000);
  await promise;
});
it("keeps memory cache usable when persistence is unavailable and ignores corrupt storage", () => {
  localStorage.setItem("mycotrail.mycoscore.v1", "invalid");
  expect(cachedEnvironment(point, now)).toBeUndefined();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  cacheEnvironment(env(), now);
  expect(cachedEnvironment(point, now)).toBeDefined();
});
