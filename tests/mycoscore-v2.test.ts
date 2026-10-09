// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGrid, areaConfig, offset } from "../src/lib/mycoArea";
import {
  deriveTerrain,
  aspectDirection,
  emptyTerrain,
  terrainStencil,
} from "../src/lib/mycoTerrain";
import {
  computeMycoScoreV2,
  seasonScore,
  algorithmVersion,
} from "../src/lib/mycoScoreV2";
import { boundedCache } from "../src/services/mycoCache";
import type { Environment } from "../src/lib/mycoScore";
const now = Date.UTC(2026, 9, 9, 12),
  day = 86400000;
const point = { lat: 43.52, lng: 11.48 };
const env = (): Environment => ({
  version: 1,
  ...point,
  fetchedAt: now,
  elevationM: 600,
  aspect: null,
  slopeDegrees: null,
  days: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(now - (30 - i) * day).toISOString().slice(0, 10),
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
function weather() {
  const days = env().days;
  return {
    elevation: 600,
    daily: {
      time: days.map((d) => d.date),
      rain_sum: days.map((d) => d.rain),
      showers_sum: days.map(() => 0),
      temperature_2m_mean: days.map((d) => d.air),
      temperature_2m_min: days.map((d) => d.min),
      temperature_2m_max: days.map((d) => d.max),
      et0_fao_evapotranspiration: days.map((d) => d.et0),
    },
    hourly: {
      time: days.flatMap((d) =>
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
let calls: URL[] = [];
function api() {
  return vi.fn(async (input: string) => {
    const url = new URL(input);
    calls.push(url);
    const lats = url.searchParams.get("latitude")!.split(",").map(Number);
    return {
      ok: true,
      json: async () =>
        url.pathname.endsWith("elevation")
          ? {
              elevation: lats.map(
                (lat) => 600 + (lat - point.lat) * 111320 * 0.2,
              ),
            }
          : lats.length > 1
            ? lats.map(() => weather())
            : weather(),
    };
  });
}
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  calls = [];
  vi.stubGlobal("fetch", api());
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("uses a bounded deterministic 25/49-cell grid, rejects remote zoom, invalid coordinates and poles", () => {
  for (const zoom of [13, 14, 15, 20]) {
    const g = createGrid({ ...point, zoom })!;
    expect(g.cells.length).toBe(zoom < 15 ? 25 : 49);
    expect(g.cells.length).toBeLessThanOrEqual(areaConfig.maxCells);
    expect(g.widthM).toBeLessThanOrEqual(2000);
    expect(createGrid({ ...point, lat: point.lat + 0.0001, zoom })?.key).toBe(
      g.key,
    );
  }
  for (const v of [
    { ...point, zoom: 12 },
    { ...point, zoom: NaN },
    { lat: 90, lng: 0, zoom: 15 },
    { lat: 0, lng: 180, zoom: 15 },
  ])
    expect(createGrid(v)).toBeNull();
  const g = createGrid({ ...point, zoom: 15 })!;
  expect(g.cells[0].bounds[1][1]).toBeCloseTo(g.cells[1].bounds[0][1]);
});
it("Horn gradients identify all cardinal downhill directions and known planar slope", () => {
  for (const [east, north, direction] of [
    [0.2, 0, "W"],
    [-0.2, 0, "E"],
    [0, 0.2, "S"],
    [0, -0.2, "N"],
    [0.2, 0.2, "SW"],
  ] as const) {
    const samples = [1, 0, -1].flatMap((y) =>
      [-1, 0, 1].map((x) => 600 + 100 * x * east + 100 * y * north),
    );
    const t = deriveTerrain(samples);
    expect(t.slopeDegrees).toBeCloseTo(
      (Math.atan(Math.hypot(east, north)) * 180) / Math.PI,
    );
    expect(aspectDirection(t.aspectDegrees!)).toBe(direction);
  }
  expect(aspectDirection(359)).toBe("N");
  expect(aspectDirection(90)).toBe("E");
  expect(aspectDirection(225)).toBe("SW");
  expect(aspectDirection(-90)).toBe("W");
});
it("flat and nearly flat ground has no arbitrary aspect; missing and anomalous DEM is rejected", () => {
  expect(deriveTerrain(Array(9).fill(600))).toEqual({
    elevationM: 600,
    slopeDegrees: 0,
    aspectDegrees: null,
  });
  const a = Array(9).fill(600);
  a[0] = null;
  expect(deriveTerrain(a)).toEqual({ ...emptyTerrain, elevationM: 600 });
  for (const bad of [NaN, Infinity, 9001, -501]) {
    a[4] = bad;
    expect(deriveTerrain(a)).toEqual(emptyTerrain);
  }
  expect(
    deriveTerrain([9000, 9000, 9000, 4000, 4000, 4000, -500, -500, -500])
      .slopeDegrees,
  ).toBeNull();
  expect(deriveTerrain(Array(9).fill(600), 0).slopeDegrees).toBeNull();
  expect(terrainStencil(point)).toHaveLength(9);
  expect(terrainStencil(point)[4]).toEqual(point);
  expect(offset(point, 0, 100).lat - point.lat).toBeCloseTo(100 / 111320);
});
it("season is profile-dependent and reverses by six months in the southern hemisphere", () => {
  expect(seasonScore("porcini", 45, "2026-10-09")).toBe(
    seasonScore("porcini", -45, "2026-04-09"),
  );
  expect(seasonScore("generic", 45, "2026-01-09")).toBeGreaterThan(
    seasonScore("porcini", 45, "2026-01-09")!,
  );
  expect(seasonScore("porcini", 0, "2026-01-09")).toBe(
    seasonScore("porcini", 0, "2026-10-09"),
  );
  expect(seasonScore("generic", 45, "invalid")).toBeNull();
});
it("v2 stays bounded for both profiles, with weather dominating terrain and season", () => {
  const good = env();
  for (const profile of ["generic", "porcini"] as const) {
    const baseline = computeMycoScoreV2(
      good,
      { elevationM: 600, slopeDegrees: 12, aspectDegrees: 0 },
      profile,
    );
    expect(baseline.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(100);
    expect(baseline.score).toBeGreaterThan(70);
    for (const moisture of [null, 0, 0.1, 0.3, 0.6, 1])
      for (const air of [null, -20, 17, 50]) {
        const e = env();
        e.days = e.days.map((d) => ({ ...d, air, moisture }));
        const score = computeMycoScoreV2(e, emptyTerrain, profile).score;
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
        if (moisture === 0 && air === 50)
          expect(score).toBeLessThan(baseline.score!);
      }
  }
});
it("does not manufacture a score from season and terrain alone; missing weather is not zero", () => {
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
  expect(
    computeMycoScoreV2(e, {
      elevationM: 600,
      slopeDegrees: 10,
      aspectDegrees: 180,
    }).score,
  ).toBeNull();
  expect(
    computeMycoScoreV2(env(), emptyTerrain).factors.find(
      (f) => f.id === "slope",
    )?.score,
  ).toBeNull();
});
it("cool aspects help moderately only with drying pressure, and reverse in the south", () => {
  const e = env();
  e.days = e.days.map((d) => ({ ...d, air: 29, et0: 8, rain: 0 }));
  const factor = (lat: number, aspectDegrees: number) =>
    computeMycoScoreV2(
      { ...e, lat },
      { elevationM: 600, slopeDegrees: 20, aspectDegrees },
    ).factors.find((f) => f.id === "aspect")!.score!;
  expect(factor(45, 0)).toBeGreaterThan(factor(45, 180));
  expect(factor(-45, 0)).toBeLessThan(factor(-45, 180));
});
it("bounded cache evicts, expires and recovers persisted valid records, rejecting corruption", () => {
  const c = boundedCache("test", z.number(), 2, 100);
  c.putMany(
    [
      { key: "a", at: now, data: 1 },
      { key: "b", at: now + 1, data: 2 },
      { key: "c", at: now + 2, data: 3 },
    ],
    now + 2,
  );
  expect(c.entries(now + 2).map((r) => r.key)).toEqual(["c", "b"]);
  c.clearMemory();
  expect(c.get("c", now + 3)?.data).toBe(3);
  expect(c.entries(now + 102)).toEqual([]);
  localStorage.setItem("test", '[{"key":"bad","at":1,"data":"bad"}]');
  expect(c.entries(now)).toEqual([]);
});
it("cold analysis batches weather, limits terrain concurrency/requests and reuses fresh/offline cache", async () => {
  const { analyzeArea, cachedArea, cellSample } =
    await import("../src/services/mycoAnalysis");
  const grid = createGrid({ ...point, zoom: 15 })!;
  const progress: number[] = [];
  const area = await analyzeArea(
    grid,
    "porcini",
    new AbortController().signal,
    (n) => progress.push(n),
    now,
  );
  expect(area.cells).toHaveLength(49);
  expect(
    area.cells.every(
      (c) => Number.isFinite(c.score) && c.terrain.slopeDegrees !== null,
    ),
  ).toBe(true);
  expect(progress.at(-1)).toBe(49);
  expect(progress).toEqual([...progress].sort((a, b) => a - b));
  expect(calls.filter((u) => u.pathname.endsWith("forecast"))).toHaveLength(1);
  expect(calls.length).toBeLessThanOrEqual(6);
  for (const u of calls.filter((u) => u.pathname.endsWith("elevation")))
    expect(
      u.searchParams.get("latitude")!.split(",").length,
    ).toBeLessThanOrEqual(100);
  const count = calls.length;
  expect(
    (
      await analyzeArea(
        grid,
        "porcini",
        new AbortController().signal,
        undefined,
        now + 100,
      )
    ).cached,
  ).toBe(true);
  expect(calls).toHaveLength(count);
  expect(cellSample(area, 24)?.terrain.slopeDegrees).toBeCloseTo(
    (Math.atan(0.2) * 180) / Math.PI,
    2,
  );
  expect(cachedArea(grid, "generic", now)).toBeNull();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const offline = await analyzeArea(
    grid,
    "porcini",
    new AbortController().signal,
    undefined,
    now + 7 * 3600000,
  );
  expect(offline.cached).toBe(true);
  expect(offline.environments.some((e) => e?.stale)).toBe(true);
  expect(calls).toHaveLength(count);
  await expect(
    analyzeArea(
      createGrid({ ...point, lat: 44, zoom: 15 })!,
      "porcini",
      new AbortController().signal,
      undefined,
      now,
    ),
  ).rejects.toThrow("heat.offline");
});
it("terrain adapter concurrency never exceeds two and abort stops pending work", async () => {
  const { loadTerrains } = await import("../src/services/mycoTerrain");
  let active = 0,
    max = 0;
  const provider = {
    id: "test",
    sample: vi.fn(async (points: any[]) => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return points.map(() => 100);
    }),
  };
  await loadTerrains(
    createGrid({ ...point, zoom: 13 })!.cells.map((c) => c.point),
    new AbortController().signal,
    undefined,
    provider,
    now,
  );
  expect(max).toBeLessThanOrEqual(2);
  expect(provider.sample).toHaveBeenCalledTimes(3);
  const controller = new AbortController();
  controller.abort();
  await expect(
    loadTerrains([point], controller.signal, undefined, provider, now),
  ).rejects.toMatchObject({ name: "AbortError" });
});
it("cancel during weather discards late responses and publishes no area cache", async () => {
  const { analyzeArea, cachedArea } =
    await import("../src/services/mycoAnalysis");
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => (release = resolve));
  const original = api();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (...args: any[]) => {
      await pending;
      return original(args[0]);
    }),
  );
  const grid = createGrid({ ...point, zoom: 15 })!,
    controller = new AbortController();
  const task = analyzeArea(grid, "generic", controller.signal, undefined, now);
  controller.abort();
  release();
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(cachedArea(grid, "generic", now)).toBeNull();
  expect(calls.filter((u) => u.pathname.endsWith("elevation"))).toHaveLength(0);
});
it("partial weather and DEM errors preserve usable cells and do not turn missing data into zero", async () => {
  const { analyzeArea } = await import("../src/services/mycoAnalysis");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const u = new URL(input);
      const n = u.searchParams.get("latitude")!.split(",").length;
      return {
        ok: true,
        json: async () =>
          u.pathname.endsWith("elevation")
            ? { elevation: Array(n).fill(null) }
            : Array.from({ length: n }, (_, i) =>
                i === 0 ? { error: true } : weather(),
              ),
      };
    }),
  );
  const area = await analyzeArea(
    createGrid({ ...point, zoom: 13 })!,
    "generic",
    new AbortController().signal,
    undefined,
    now,
  );
  expect(area.cells.some((c) => c.score === null)).toBe(true);
  expect(area.cells.some((c) => c.score !== null)).toBe(true);
  expect(area.cells.every((c) => c.terrain.slopeDegrees === null)).toBe(true);
  expect(
    area.cells.every(
      (c) =>
        c.score === null ||
        (Number.isFinite(c.score) && c.score >= 0 && c.score <= 100),
    ),
  ).toBe(true);
});
it("cache keys include algorithm, profile, spatial grid and data day; obsolete algorithms are not reused", async () => {
  const { analyzeArea, areaCacheKey, cachedArea } =
    await import("../src/services/mycoAnalysis");
  const grid = createGrid({ ...point, zoom: 13 })!;
  expect(
    areaCacheKey(grid, "generic", algorithmVersion, "2026-10-09"),
  ).not.toBe(areaCacheKey(grid, "generic", "1.0", "2026-10-09"));
  await analyzeArea(
    grid,
    "generic",
    new AbortController().signal,
    undefined,
    now,
  );
  const rows = JSON.parse(localStorage.getItem("mycotrail.areas.v2")!);
  rows[0].data.algorithmVersion = "1.0";
  rows[0].key = "1.0:generic:" + grid.key + ":2026-10-09";
  localStorage.setItem("mycotrail.areas.v2", JSON.stringify(rows));
  vi.resetModules();
  const fresh = await import("../src/services/mycoAnalysis");
  expect(fresh.cachedArea(grid, "generic", now)).toBeNull();
  expect(cachedArea(grid, "generic", now + 8 * day)).toBeNull();
});
it("expired weather is refreshed while static terrain survives; terrain TTL/limit are bounded", async () => {
  const { analyzeArea } = await import("../src/services/mycoAnalysis");
  const grid = createGrid({ ...point, zoom: 13 })!;
  await analyzeArea(
    grid,
    "generic",
    new AbortController().signal,
    undefined,
    now,
  );
  calls = [];
  await analyzeArea(
    grid,
    "generic",
    new AbortController().signal,
    undefined,
    now + 7 * 3600000,
  );
  expect(calls.filter((u) => u.pathname.endsWith("elevation"))).toHaveLength(0);
  expect(calls.filter((u) => u.pathname.endsWith("forecast"))).toHaveLength(1);
  const { TERRAIN_LIMIT, TERRAIN_TTL } =
    await import("../src/services/mycoTerrain");
  expect(TERRAIN_LIMIT).toBe(4096);
  expect(TERRAIN_TTL).toBe(180 * day);
});
