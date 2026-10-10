// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  computeEcology,
  habitatCompatibility,
  biogeography,
  seasonalElevation,
  rainfallSequence,
  type EcologyInput,
} from "../src/lib/mycoEcology";
import {
  ecologyProfiles,
  ecologyVersion,
  unknownLand,
  type LandCover,
  type LandClass,
} from "../src/lib/ecologyModel";
import type { Environment } from "../src/lib/mycoScore";
import { emptyTerrain } from "../src/lib/mycoTerrain";
import { requestPool } from "../src/services/sharedRequest";
const now = Date.UTC(2026, 9, 10, 12),
  day = 86400000,
  point = { lat: 43.52, lng: 11.48 };
const env = (): Environment => ({
  version: 1,
  ...point,
  fetchedAt: now,
  elevationM: 600,
  aspect: null,
  slopeDegrees: null,
  days: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(now - (30 - i) * day).toISOString().slice(0, 10),
    rain: i === 24 ? 9 : 3,
    air: 17,
    min: 12,
    max: 22,
    humidity: 80,
    soil: 16,
    moisture: 0.3,
    et0: 2,
    vpd: 0.6,
    wind: 8,
    radiation: 12,
  })),
});
const land = (category: LandClass = "trees"): LandCover => ({
  category,
  neighbors: Array(9).fill(category),
  provider: "io-esri-2025",
  year: 2025,
  resolutionM: 10,
  fetchedAt: now,
  cached: false,
});
const input = (): EcologyInput => ({
  point,
  profile: "porcini",
  land: land(),
  terrain: { elevationM: 600, slopeDegrees: 12, aspectDegrees: 0 },
  environment: env(),
  soil: null,
  analysisDate: new Date(now).toISOString(),
  now,
});
const rawLand = (code = 2) => ({
  samples: Array.from({ length: 9 }, (_, i) => ({
    locationId: i,
    value: String(code),
    resolution: 10,
    attributes: { Year: 2025 },
  })),
});
function weather() {
  const d = env().days;
  return {
    elevation: 600,
    daily: {
      time: d.map((x) => x.date),
      rain_sum: d.map((x) => x.rain),
      showers_sum: d.map(() => 0),
      temperature_2m_mean: d.map((x) => x.air),
      temperature_2m_min: d.map((x) => x.min),
      temperature_2m_max: d.map((x) => x.max),
      et0_fao_evapotranspiration: d.map((x) => x.et0),
    },
    hourly: {
      time: d.flatMap((x) =>
        Array.from(
          { length: 24 },
          (_, h) => `${x.date}T${String(h).padStart(2, "0")}:00`,
        ),
      ),
      soil_temperature_6cm: Array(720).fill(16),
      soil_moisture_3_to_9cm: Array(720).fill(0.3),
      relative_humidity_2m: Array(720).fill(80),
    },
  };
}
function mockNetwork(code = 2) {
  return vi.fn(async (input: string) => ({
    ok: true,
    json: async () =>
      input.includes("getSamples")
        ? rawLand(code)
        : input.includes("/elevation?")
          ? { elevation: Array(9).fill(600) }
          : weather(),
  }));
}
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([
  ["Adriatic", { lat: 43, lng: 15 }, "water"],
  ["lake", { lat: 43.13, lng: 12.1 }, "water"],
  ["Sahara", { lat: 23, lng: 10 }, "bare"],
  ["Vatican paved square", { lat: 41.9022, lng: 12.4574 }, "built"],
  ["permanent ice", { lat: 72, lng: -42 }, "snowIce"],
] as const)(
  "%s is unsuitable regardless of perfect weather, without a misleading zero score",
  (_name, p, cover) => {
    const result = computeEcology({ ...input(), point: p, land: land(cover) });
    expect(result.status).toBe("unsuitable");
    expect(result.score).toBeNull();
    expect(result.habitat.hard).toBe(true);
  },
);
it("urban trees remain compatible; a mixed built pixel is strongly penalized instead of banning cities", () => {
  const park = computeEcology({
    ...input(),
    point: { lat: 41.915, lng: 12.48 },
  });
  expect(park.status).toBe("scored");
  expect(park.score).toBeGreaterThan(75);
  const mixed = {
    ...land("built"),
    neighbors: [
      "built",
      "built",
      "trees",
      "trees",
      "grassland",
      "built",
      "built",
      "trees",
      "built",
    ] as LandClass[],
  };
  const result = computeEcology({ ...input(), land: mixed });
  expect(result.status).toBe("scored");
  expect(result.score).toBeLessThan(35);
});
it("favourable European forest can score high, while dry or hot soil cannot be compensated by air/rain", () => {
  const good = computeEcology(input());
  expect(good.score).toBeGreaterThanOrEqual(80);
  for (const change of [
    { moisture: 0.01 },
    { moisture: 0.9 },
    { soil: 40 },
    { soil: -10 },
  ]) {
    const i = input();
    i.environment!.days = i.environment!.days.map((d) => ({ ...d, ...change }));
    const bad = computeEcology(i);
    expect(bad.status).toBe("scored");
    expect(bad.score).toBeLessThanOrEqual(20);
    expect(bad.score).toBeLessThan(good.score!);
  }
});
it("rain distribution distinguishes a storm, distributed rain, drought and drying after rain", () => {
  const distributed = env(),
    storm = env(),
    dry = env();
  distributed.days = distributed.days.map((d) => ({ ...d, rain: 4 }));
  storm.days = storm.days.map((d, i) => ({ ...d, rain: i === 24 ? 56 : 0 }));
  dry.days = dry.days.map((d) => ({ ...d, rain: 0 }));
  expect(rainfallSequence(distributed).score).toBeGreaterThan(
    rainfallSequence(storm).score!,
  );
  expect(rainfallSequence(dry).score).toBe(0);
  const stressed = env();
  stressed.days = stressed.days.map((d, i) => ({
    ...d,
    et0: i > 26 ? 10 : d.et0,
    vpd: 3,
    wind: 50,
    humidity: 30,
  }));
  expect(
    computeEcology({ ...input(), environment: stressed }).score,
  ).toBeLessThan(computeEcology(input()).score!);
});
it("incomplete rain windows are unknown, not a fabricated dry fortnight", () => {
  for (const count of [0, 3, 13]) {
    const partial = env();
    partial.days = partial.days.slice(0, count);
    expect(rainfallSequence(partial)).toEqual({
      score: null,
      wetDays: null,
      peakShare: null,
    });
  }
  const missing = env();
  missing.days[29].rain = null;
  expect(rainfallSequence(missing).score).toBeNull();
});
it("latitude, hemisphere, month and actual climate interact with elevation instead of a fixed 600m bonus", () => {
  const e = env(),
    t = input().terrain;
  const a = seasonalElevation(
    { lat: 35, lng: 10 },
    t,
    e,
    "porcini",
    "2026-10-10",
  );
  const b = seasonalElevation(
    { lat: 52, lng: 10 },
    t,
    e,
    "porcini",
    "2026-10-10",
  );
  expect(a.season).not.toBe(b.season);
  const southern = seasonalElevation(
    { lat: -35, lng: 10 },
    t,
    e,
    "porcini",
    "2026-04-10",
  );
  expect(a.season).toBeCloseTo(southern.season!);
  const scores = [300, 600, 900].map((alt, i) => {
    const e = env();
    e.elevationM = alt;
    e.days = e.days.map((d) => ({
      ...d,
      air: [28, 17, 6][i],
      soil: [25, 16, 5][i],
    }));
    return seasonalElevation(
      point,
      { ...t, elevationM: alt },
      e,
      "porcini",
      "2026-10-10",
    ).elevation!;
  });
  expect(scores[1]).toBeGreaterThan(scores[0]);
  expect(scores[1]).toBeGreaterThan(scores[2]);
  const warm = env();
  warm.days = warm.days.map((d) => ({ ...d, air: 25, soil: 24 }));
  expect(
    seasonalElevation(point, t, warm, "porcini", "2026-07-10").thermalBandM,
  ).toBeGreaterThan(t.elevationM!);
  expect(
    seasonalElevation({ lat: 0, lng: 10 }, t, e, "porcini", "2026-10-10")
      .season,
  ).toBeNull();
});
it("range uncertainty is separate from incompatibility and never produces a highly favourable species score", () => {
  expect(biogeography({ lat: 5, lng: 15 }, "porcini").status).toBe("uncertain");
  const result = computeEcology({ ...input(), point: { lat: 5, lng: 15 } });
  expect(result.status).toBe("scored");
  expect(result.score).toBeLessThanOrEqual(64);
  expect(result.habitat.hard).toBe(false);
});
it("profiles differ on the same inputs and generic grass is plausible where tree-associated profiles are marginal", () => {
  const p = computeEcology(input()),
    c = computeEcology({ ...input(), profile: "chanterelles" });
  expect(p.score).not.toBe(c.score);
  expect(habitatCompatibility(land("grassland"), "generic").status).toBe(
    "compatible",
  );
  expect(habitatCompatibility(land("grassland"), "porcini").status).toBe(
    "marginal",
  );
  expect(habitatCompatibility(land(), "porcini").hostCompatibility).toBe(
    "unknown",
  );
  expect(Object.keys(ecologyProfiles)).toHaveLength(3);
});
it("missing habitat is unverified, not unsuitable; missing weather is not converted to zero", () => {
  const missing = computeEcology({ ...input(), land: unknownLand(now) });
  expect(missing.status).toBe("uncertain");
  expect(missing.score).toBeNull();
  expect(missing.conditions).toBeGreaterThan(0);
  expect(missing.confidenceLabel).toBe("low");
  const noWeather = computeEcology({ ...input(), environment: null });
  expect(noWeather.status).toBe("insufficient");
  expect(noWeather.score).toBeNull();
});
it("confidence is independent of score and declines for stale/coarse/missing providers", () => {
  const fresh = computeEcology(input()),
    stale = computeEcology({ ...input(), now: now + 3 * day });
  expect(stale.score).toBe(fresh.score);
  expect(stale.confidence).toBeLessThan(fresh.confidence);
  const missing = computeEcology({ ...input(), terrain: emptyTerrain });
  expect(missing.confidence).toBeLessThan(fresh.confidence);
  const partial = input();
  partial.environment!.days = partial.environment!.days.map((d) => ({
    ...d,
    moisture: null,
  }));
  expect(computeEcology(partial).confidenceLabel).toBe("medium");
});
it("all profiles stay finite/integer/bounded with partial and extreme environmental inputs", () => {
  for (const profile of Object.keys(
    ecologyProfiles,
  ) as (keyof typeof ecologyProfiles)[])
    for (const moisture of [null, 0, 0.3, 0.9])
      for (const soil of [null, -50, 16, 70]) {
        const i = input();
        i.profile = profile;
        i.environment!.days = i.environment!.days.map((d) => ({
          ...d,
          moisture,
          soil,
        }));
        const r = computeEcology(i);
        expect(
          r.score === null ||
            (Number.isInteger(r.score) && r.score >= 0 && r.score <= 100),
        ).toBe(true);
        expect(Number.isFinite(r.confidence)).toBe(true);
        expect(
          r.factors.every((f) => f.score === null || Number.isFinite(f.score)),
        ).toBe(true);
      }
});
it("land adapter normalizes categorical raw values, validates year/resolution/ids and preserves NoData", async () => {
  const { parseLandCover } = await import("../src/services/landCover");
  expect(parseLandCover(rawLand(1), now).category).toBe("water");
  expect(parseLandCover(rawLand(11), now).category).toBe("rangeland");
  expect(parseLandCover({ samples: [] }, now).category).toBe("unknown");
  expect(parseLandCover(rawLand(999), now).category).toBe("unknown");
  for (const patch of [
    { resolution: 100 },
    { attributes: { Year: 2020 } },
    { locationId: 99 },
  ]) {
    const raw = rawLand();
    Object.assign(raw.samples[0], patch);
    expect(() => parseLandCover(raw, now)).toThrow();
  }
});
it("known water stops the pipeline before weather/DEM and its cache survives reload", async () => {
  const fetch = mockNetwork(1);
  vi.stubGlobal("fetch", fetch);
  const { loadEcology } = await import("../src/services/mycoEcology");
  const result = await loadEcology(
    { lat: 43, lng: 15 },
    "porcini",
    new AbortController().signal,
    undefined,
    now,
  );
  expect(result.result.status).toBe("unsuitable");
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.resetModules();
  const again = await import("../src/services/mycoEcology");
  const cached = await again.loadEcology(
    { lat: 43, lng: 15 },
    "porcini",
    new AbortController().signal,
    undefined,
    now + 100,
  );
  expect(cached.result.score).toBeNull();
  expect(cached.cached).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("raster NoData requires real marine intersection, never an inferred water label", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string) => ({
      ok: true,
      json: async () =>
        u.includes("getSamples")
          ? { samples: [] }
          : {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: { name: "Mediterranean Region" },
                },
              ],
            },
    })),
  );
  const { loadLandCover } = await import("../src/services/landCover");
  expect(
    (
      await loadLandCover(
        { lat: 43, lng: 15 },
        new AbortController().signal,
        now,
      )
    ).provider,
  ).toBe("marine-goas-2021");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string) => ({
      ok: true,
      json: async () =>
        u.includes("getSamples")
          ? { samples: [] }
          : { type: "FeatureCollection", features: [] },
    })),
  );
  expect(
    (
      await loadLandCover(
        { lat: 50, lng: 15 },
        new AbortController().signal,
        now,
      )
    ).category,
  ).toBe("unknown");
});
it("one tap uses three calls, repeated taps deduplicate and old weather caches remain valid", async () => {
  const fetch = mockNetwork();
  vi.stubGlobal("fetch", fetch);
  const { loadEcology } = await import("../src/services/mycoEcology");
  const controller = new AbortController();
  const [a, b] = await Promise.all([
    loadEcology(point, "porcini", controller.signal, undefined, now),
    loadEcology(point, "porcini", controller.signal, undefined, now),
  ]);
  expect(a.result.score).toBe(b.result.score);
  expect(fetch).toHaveBeenCalledTimes(3);
  const c = await loadEcology(
    point,
    "porcini",
    controller.signal,
    undefined,
    now + 1000,
  );
  expect(c.cached).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(3);
  await loadEcology(
    point,
    "chanterelles",
    controller.signal,
    undefined,
    now + 1000,
  );
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("optional soil/DEM failures do not discard valid weather and habitat; unknown land cannot give normal score", async () => {
  const fetch = mockNetwork();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string) =>
      u.includes("elevation") ? { ok: false } : fetch(u),
    ),
  );
  const { loadEcology } = await import("../src/services/mycoEcology");
  const result = await loadEcology(
    point,
    "porcini",
    new AbortController().signal,
    undefined,
    now,
    {
      id: "failed",
      load: async () => {
        throw new Error("soil");
      },
    },
  );
  expect(result.result.status).toBe("scored");
  expect(result.soil).toBeNull();
  expect(result.terrain.slopeDegrees).toBeNull();
  expect(result.result.confidence).toBeLessThan(85);
});
it("offline restores a versioned compatible snapshot, and never uses old algorithm results", async () => {
  vi.stubGlobal("fetch", mockNetwork());
  const { loadEcology, ecologyCacheKey } =
    await import("../src/services/mycoEcology");
  await loadEcology(
    point,
    "porcini",
    new AbortController().signal,
    undefined,
    now,
  );
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  vi.stubGlobal("fetch", vi.fn());
  const result = await loadEcology(
    point,
    "porcini",
    new AbortController().signal,
    undefined,
    now + day,
  );
  expect(result.cached).toBe(true);
  expect(result.stale).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  expect(ecologyCacheKey(point, "porcini", "2026-10-10")).toContain(
    ecologyVersion,
  );
  expect(ecologyCacheKey(point, "porcini", "2026-10-10", "old")).not.toBe(
    ecologyCacheKey(point, "porcini", "2026-10-10"),
  );
  const noData = await loadEcology(
    { lat: 44, lng: 12 },
    "porcini",
    new AbortController().signal,
    undefined,
    now,
  );
  expect(noData.result.status).toBe("uncertain");
  expect(noData.result.score).toBeNull();
});
it("abort cancels obsolete provider work and cannot publish stale state", async () => {
  const { loadEcology } = await import("../src/services/mycoEcology");
  let release: () => void = () => {};
  const pending = new Promise<void>((r) => (release = r));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      await pending;
      return { ok: true, json: async () => rawLand() };
    }),
  );
  const controller = new AbortController();
  const task = loadEcology(point, "porcini", controller.signal, undefined, now);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  controller.abort();
  release();
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(localStorage.getItem("mycotrail.ecology-score.v21")).toBe("[]");
});
it("shared request cancellation is per subscriber, and a live subscriber still receives the result", async () => {
  const pool = requestPool<number>(),
    a = new AbortController(),
    b = new AbortController();
  let release: (v: number) => void = () => {};
  const task = vi.fn(async () => new Promise<number>((r) => (release = r)));
  const first = pool("same", a.signal, task),
    second = pool("same", b.signal, task);
  await Promise.resolve();
  a.abort();
  release(42);
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  await expect(second).resolves.toBe(42);
  expect(task).toHaveBeenCalledTimes(1);
});
it("aspect responds to warm/cold soil and hemisphere instead of a universal north bonus", () => {
  function terrainScore(lat: number, aspect: number, soil: number) {
    const i = input();
    i.point = { lat, lng: 10 };
    i.terrain.aspectDegrees = aspect;
    i.environment!.days = i.environment!.days.map((d) => ({
      ...d,
      soil,
      vpd: 0,
      wind: 0,
    }));
    return computeEcology(i).factors.find((f) => f.id === "terrain")!.score!;
  }
  expect(terrainScore(43, 0, 24)).toBeGreaterThan(terrainScore(43, 180, 24));
  expect(terrainScore(43, 0, 7)).toBeLessThan(terrainScore(43, 180, 7));
  expect(terrainScore(-43, 0, 24)).toBeLessThan(terrainScore(-43, 180, 24));
});
it("land-cover TTL avoids repeat requests but refreshes expired static data", async () => {
  const fetch = mockNetwork();
  vi.stubGlobal("fetch", fetch);
  const { loadLandCover, LAND_TTL } = await import("../src/services/landCover");
  const signal = new AbortController().signal;
  await loadLandCover(point, signal, now);
  expect((await loadLandCover(point, signal, now + LAND_TTL - 1)).cached).toBe(
    true,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect((await loadLandCover(point, signal, now + LAND_TTL)).cached).toBe(
    false,
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("ecology snapshot expires with weather; incompatible stored versions are rejected", async () => {
  const network = mockNetwork();
  vi.stubGlobal("fetch", network);
  let service = await import("../src/services/mycoEcology");
  const signal = new AbortController().signal;
  await service.loadEcology(point, "porcini", signal, undefined, now);
  const raw = JSON.parse(localStorage.getItem("mycotrail.ecology-score.v21")!);
  raw[0].data.algorithmVersion = "mycoscore-0.0";
  raw[0].data.land = land("water");
  localStorage.setItem("mycotrail.ecology-score.v21", JSON.stringify(raw));
  vi.resetModules();
  service = await import("../src/services/mycoEcology");
  const refreshed = await service.loadEcology(
    point,
    "porcini",
    signal,
    undefined,
    now + 100,
  );
  expect(refreshed.result.status).toBe("scored");
  expect(refreshed.algorithmVersion).toBe(ecologyVersion);
  expect(network).toHaveBeenCalledTimes(3); // raw environmental caches are still compatible
  await service.loadEcology(
    point,
    "porcini",
    signal,
    undefined,
    now + 7 * 3600000,
  );
  expect(network).toHaveBeenCalledTimes(4); // only dynamic weather expired
});
it("land service failure preserves environmental details without claiming ecological suitability", async () => {
  const network = mockNetwork();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (u: string) =>
      u.includes("arcgis") || u.includes("vliz") ? { ok: false } : network(u),
    ),
  );
  const { loadEcology } = await import("../src/services/mycoEcology");
  const result = await loadEcology(
    point,
    "generic",
    new AbortController().signal,
    undefined,
    now,
  );
  expect(result.result.status).toBe("uncertain");
  expect(result.result.score).toBeNull();
  expect(result.result.conditions).not.toBeNull();
  expect(result.result.confidenceLabel).toBe("low");
});
