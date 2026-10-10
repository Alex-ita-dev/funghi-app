// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  createGrid,
  gridBounds,
  areaConfig,
  cellStyle,
} from "../src/lib/mycoArea";
import { ecologyVersion } from "../src/lib/ecologyModel";
import { computeEcology } from "../src/lib/mycoEcology";
import { landKey } from "../src/services/landCover";
import type { Environment } from "../src/lib/mycoScore";
const now = Date.UTC(2026, 9, 10, 12),
  point = { lat: 43.52, lng: 11.48 };
const grid = () => createGrid({ ...point, zoom: 15 })!;
const environment = (): Environment => ({
  version: 1,
  ...point,
  fetchedAt: now,
  elevationM: 600,
  slopeDegrees: null,
  aspect: null,
  days: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(now - (30 - i) * 86400000).toISOString().slice(0, 10),
    rain: i === 25 ? 10 : 3,
    air: 23,
    min: 12,
    max: 28,
    humidity: 80,
    soil: 19,
    moisture: 0.3,
    et0: 4,
    wind: 8,
    vpd: 1.3,
  })),
});
let codes: number[];
let active: number, maxActive: number;
function response(code: number) {
  return {
    samples: Array.from({ length: 9 }, (_, locationId) => ({
      locationId,
      value: String(code),
      resolution: 10,
      attributes: { Year: 2025 },
    })),
  };
}
beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  codes = Array(64).fill(2);
  active = 0;
  maxActive = 0;
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  // Shared raw weather cache, terrain provider mocked separately: isolate orchestration from formulas.
  const { cacheEnvironment, gridPoint } =
    await import("../src/services/mycoEnvironment");
  grid().cells.forEach((c) =>
    cacheEnvironment({ ...environment(), ...gridPoint(c.point) }, now),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      const u = new URL(url);
      if (u.pathname.endsWith("getSamples")) {
        const points = JSON.parse(u.searchParams.get("geometry")!).points;
        return {
          ok: true,
          json: async () => ({
            samples: points.map((_: unknown, locationId: number) => {
              const [lng, lat] = points[Math.floor(locationId / 9) * 9];
              const i = grid().cells.findIndex(
                (c) =>
                  Math.abs(c.point.lat - lat) < 0.000001 &&
                  Math.abs(c.point.lng - lng) < 0.000001,
              );
              return {
                locationId,
                value: String(codes[i] ?? 2),
                resolution: 10,
                attributes: { Year: 2025 },
              };
            }),
          }),
        };
      }
      if (u.pathname.endsWith("elevation"))
        return {
          ok: true,
          json: async () => ({
            elevation: u.searchParams
              .get("latitude")!
              .split(",")
              .map(() => 600),
          }),
        };
      return {
        ok: true,
        json: async () => ({ type: "FeatureCollection", features: [] }),
      };
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("bounds tessellate the preview and spatial keys respect static resolution", () => {
  for (const zoom of [13, 15, 17, 19]) {
    const g = createGrid({ ...point, zoom })!,
      b = gridBounds(g);
    expect(g.cells.length).toBeLessThanOrEqual(100);
    for (const c of g.cells) {
      expect(c.point.lat).toBeGreaterThan(b[0][0]);
      expect(c.point.lat).toBeLessThan(b[1][0]);
      expect(c.point.lng).toBeGreaterThan(b[0][1]);
      expect(c.point.lng).toBeLessThan(b[1][1]);
    }
    expect(g.cells[0].bounds[1][1]).toBeCloseTo(g.cells[1].bounds[0][1], 9);
  }
  expect(landKey(point)).not.toBe(
    landKey({ ...point, lat: point.lat + 0.00002 }),
  );
});
it("mixed lake, urban, forest, rangeland and bare cells keep exclusions distinct and skip dynamic requests", async () => {
  codes = Array.from({ length: 64 }, (_, i) => [1, 7, 2, 11, 8][i % 5]);
  const { analyzeArea, cellSample } =
    await import("../src/services/mycoAnalysis");
  const area = await analyzeArea(
    grid(),
    "porcini",
    new AbortController().signal,
    undefined,
    now,
  );
  expect(area.cells.slice(0, 5).map((c) => c.status)).toEqual([
    "unsuitable",
    "unsuitable",
    "valid",
    "valid",
    "unsuitable",
  ]);
  expect(area.cells[0].score).toBeNull();
  expect(area.cells[2].score).toBeGreaterThan(area.cells[3].score!);
  expect(cellSample(area, 0)?.environment).toBeNull();
  expect(area.metrics.requests.weather ?? 0).toBe(0);
  expect(maxActive).toBeLessThanOrEqual(areaConfig.heatmapConcurrency);
  const terrainRequests = vi
    .mocked(fetch)
    .mock.calls.filter(([u]) => String(u).includes("/elevation?"));
  expect(terrainRequests.length).toBeLessThanOrEqual(3);
});
it("fully excluded areas make zero weather/elevation requests and remain tappable", async () => {
  codes.fill(1);
  const { analyzeArea, cellSample } =
    await import("../src/services/mycoAnalysis");
  const area = await analyzeArea(
    grid(),
    "porcini",
    new AbortController().signal,
    undefined,
    now,
  );
  expect(area.metrics.requests).toEqual({ landCover: 8 });
  const { loadEcology } = await import("../src/services/mycoEcology");
  const count = vi.mocked(fetch).mock.calls.length;
  const detail = await loadEcology(
    grid().cells[0].point,
    "porcini",
    new AbortController().signal,
    cellSample(area, 0),
    now,
  );
  expect(detail.result.status).toBe("unsuitable");
  expect(fetch).toHaveBeenCalledTimes(count);
});
it("species changes reuse all providers and match the shared point engine, including offline", async () => {
  codes.fill(11);
  const { analyzeArea, changeAreaSpecies, cellSample } =
    await import("../src/services/mycoAnalysis");
  const area = await analyzeArea(
    grid(),
    "porcini",
    new AbortController().signal,
    undefined,
    now,
  );
  const count = vi.mocked(fetch).mock.calls.length;
  const next = changeAreaSpecies(area, "chanterelles", now);
  expect(next.cells[0].score).not.toBe(area.cells[0].score);
  expect(next.cells[0].score).toBe(
    computeEcology({ ...cellSample(next, 0)!, now }).score,
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const offline = await analyzeArea(
    grid(),
    "chanterelles",
    new AbortController().signal,
    undefined,
    now + 60000,
  );
  expect(offline.cached).toBe(true);
  expect(offline.cells[0].score).toBe(next.cells[0].score);
  expect(fetch).toHaveBeenCalledTimes(count);
});
it("mountain cells at 300/600/900 m and N/S aspects preserve the different engine scores", async () => {
  const terrain = await import("../src/services/mycoTerrain");
  vi.spyOn(terrain, "loadTerrains").mockImplementation(async (points) =>
    points.map((_, i) => ({
      elevationM: [300, 600, 900][i % 3],
      slopeDegrees: 25,
      aspectDegrees: i % 2 ? 180 : 0,
    })),
  );
  const { analyzeArea, cellSample } =
    await import("../src/services/mycoAnalysis");
  const area = await analyzeArea(
    grid(),
    "porcini",
    new AbortController().signal,
    undefined,
    now,
  );
  expect(new Set(area.cells.map((c) => c.score)).size).toBeGreaterThan(1);
  for (let i = 0; i < 6; i++)
    expect(area.cells[i].score).toBe(
      computeEcology({ ...cellSample(area, i)!, now }).score,
    );
  expect(area.cells[0].score).not.toBe(area.cells[3].score);
});
it("unknown cover and missing essential weather never get an ordinary score", async () => {
  codes[0] = 10;
  const { cacheEnvironment, gridPoint } =
    await import("../src/services/mycoEnvironment");
  grid().cells.forEach((c) =>
    cacheEnvironment(
      {
        ...environment(),
        ...gridPoint(c.point),
        days: environment().days.map((d) => ({ ...d, soil: null, air: null })),
      },
      now,
    ),
  );
  const { analyzeArea } = await import("../src/services/mycoAnalysis");
  const area = await analyzeArea(
    grid(),
    "porcini",
    new AbortController().signal,
    undefined,
    now,
  );
  expect(
    area.cells.every(
      (c) => c.status === "insufficientData" && c.score === null,
    ),
  ).toBe(true);
});
it("queue cancellation stops new work at four and cannot publish a computed snapshot", async () => {
  let unblock!: () => void;
  const barrier = new Promise<void>((r) => (unblock = r));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      await barrier;
      return { ok: true, json: async () => response(2) };
    }),
  );
  const { analyzeArea, cachedArea } =
    await import("../src/services/mycoAnalysis");
  const controller = new AbortController();
  const task = analyzeArea(
    grid(),
    "porcini",
    controller.signal,
    undefined,
    now,
  );
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
  controller.abort();
  unblock();
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(cachedArea(grid(), "porcini", now)).toBeNull();
});
it("confidence affects opacity, never the score; missing and excluded have different patterns", () => {
  const low = cellStyle({ score: 65, confidence: 30, status: "valid" }, 0.35);
  const high = cellStyle({ score: 65, confidence: 90, status: "valid" }, 0.35);
  expect(low.fillColor).toBe(high.fillColor);
  expect(low.fillOpacity).toBeLessThan(high.fillOpacity);
  expect(
    cellStyle({ score: null, confidence: 90, status: "unsuitable" }, 0.35)
      .dashArray,
  ).not.toBe(
    cellStyle({ score: null, confidence: 30, status: "insufficientData" }, 0.35)
      .dashArray,
  );
});
it("raw weather sharing and computed cache metrics are bounded and versioned", async () => {
  const { analyzeArea, AREA_CACHE_LIMIT } =
    await import("../src/services/mycoAnalysis");
  const area = await analyzeArea(
    grid(),
    "porcini",
    new AbortController().signal,
    undefined,
    now,
  );
  expect(area.algorithmVersion).toBe(ecologyVersion);
  expect(area.environments.length).toBeLessThan(area.cells.length);
  const warm = await analyzeArea(
    grid(),
    "porcini",
    new AbortController().signal,
    undefined,
    now + 1000,
  );
  expect(warm.metrics.requests).toEqual({});
  expect(warm.metrics.cacheHits).toBe(64);
  const storage = localStorage.getItem("mycotrail.areas.ecological")!;
  expect(JSON.parse(storage).length).toBeLessThanOrEqual(AREA_CACHE_LIMIT);
  console.log(
    "HEATMAP_BENCH",
    JSON.stringify({
      cold: area.metrics,
      warm: warm.metrics,
      snapshotBytes: new Blob([storage]).size,
    }),
  );
});
it("native land batches use location IDs across cells; missing samples never shift the second cell", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes("getSamples")
          ? {
              samples: [
                {
                  locationId: 9,
                  value: "2",
                  resolution: 10,
                  attributes: { Year: 2025 },
                },
              ],
            }
          : { type: "FeatureCollection", features: [] },
    })),
  );
  const { esriLandCover } = await import("../src/services/landCover");
  const result = await esriLandCover.sampleMany!(
    [point, { ...point, lat: point.lat + 0.01 }],
    new AbortController().signal,
    now,
  );
  expect(result.map((c) => c.category)).toEqual(["unknown", "trees"]);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes("getSamples")),
  ).toHaveLength(1);
});

it("the browser fixture deliberately distinguishes Porcini and Chanterelles score/classification", async () => {
  const { heatmapWeather } = await import("./e2e/myco-fixtures");
  const { parseEnvironment } = await import("../src/services/mycoEnvironment");
  const current = Date.now();
  const input = {
    point,
    land: {
      category: "trees" as const,
      neighbors: ["trees" as const],
      provider: "io-esri-2025" as const,
      year: 2025,
      resolutionM: 10,
      fetchedAt: current,
      cached: false,
    },
    terrain: { elevationM: 612, slopeDegrees: 11.3, aspectDegrees: 180 },
    soil: null,
    environment: parseEnvironment(heatmapWeather(), point, current),
    analysisDate: new Date(current).toISOString(),
    now: current,
  };
  const p = computeEcology({ ...input, profile: "porcini" });
  const c = computeEcology({ ...input, profile: "chanterelles" });
  expect(p.score).not.toBe(c.score);
  expect(p.classification).not.toBe(c.classification);
});
