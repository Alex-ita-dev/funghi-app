import { z } from "zod";
import { environmentSchema } from "../lib/mycoScore";
import {
  ecologyVersion,
  type EcologyProfileId as Profile,
} from "../lib/ecologyModel";
import { computeEcology, habitatCompatibility } from "../lib/mycoEcology";
import { emptyTerrain } from "../lib/mycoTerrain";
import { areaConfig, type AreaGrid } from "../lib/mycoArea";
import type { Coordinate } from "../lib/model";
import {
  gridPoint,
  loadEnvironments,
  CACHE_TTL,
  CACHE_MAX_AGE,
} from "./mycoEnvironment";
import { loadTerrains } from "./mycoTerrain";
import { loadLandCovers } from "./landCover";
import { optionalSoilProvider } from "./ecologySoil";
import { snapshotSchema, type EcologySnapshot } from "./mycoEcology";
import { boundedCache } from "./mycoCache";
import { trackRequests, type RequestCounts } from "./mycoMetrics";

const schema = z.object({
  algorithmVersion: z.literal(ecologyVersion),
  profile: snapshotSchema.shape.profile,
  analysisDate: z.string().datetime(),
  updatedAt: z.number().finite(),
  environments: z
    .array(
      z
        .object({
          data: environmentSchema,
          cached: z.boolean(),
          stale: z.boolean(),
        })
        .nullable(),
    )
    .max(areaConfig.maxCells),
  cells: z
    .array(
      z.object({
        id: z.string(),
        anchor: z
          .number()
          .int()
          .min(-1)
          .max(areaConfig.maxCells - 1),
        land: snapshotSchema.shape.land,
        terrain: snapshotSchema.shape.terrain,
        soil: snapshotSchema.shape.soil,
      }),
    )
    .max(areaConfig.maxCells),
});
type StoredArea = z.infer<typeof schema>;
export type HeatmapMetrics = {
  cells: number;
  requests: RequestCounts;
  cacheHits: number;
  durationMs: number;
};
export type AreaAnalysis = Omit<StoredArea, "cells"> & {
  grid: AreaGrid;
  cached: boolean;
  metrics: HeatmapMetrics;
  cells: (StoredArea["cells"][number] & {
    score: number | null;
    confidence: number;
    status: "valid" | "unsuitable" | "insufficientData";
  })[];
};
export type CellSample = EcologySnapshot & { point: Coordinate };
export const AREA_CACHE_LIMIT = 6;
// Same bounded-cache mechanism as v2.1; schema/version separates obsolete weather-only overlays.
const cache = boundedCache(
  "mycotrail.areas.ecological",
  schema,
  AREA_CACHE_LIMIT,
  CACHE_MAX_AGE,
);
export const areaCacheKey = (
  grid: AreaGrid,
  profile: Profile,
  version: string = ecologyVersion,
  date = new Date().toISOString().slice(0, 10),
) => `${version}:${profile}:${grid.key}:${date}`;

export function cellSample(
  area: AreaAnalysis,
  index: number,
): CellSample | null {
  const cell = area.cells[index];
  if (!cell) return null;
  return {
    algorithmVersion: ecologyVersion,
    profile: area.profile,
    land: cell.land,
    terrain: cell.terrain,
    soil: cell.soil,
    analysisDate: area.analysisDate,
    point: area.grid.cells[index].point,
    environment: area.environments[cell.anchor]?.data ?? null,
  };
}
function hydrate(
  data: StoredArea,
  grid: AreaGrid,
  cached: boolean,
  now: number,
  metrics: HeatmapMetrics = {
    cells: grid.cells.length,
    requests: {},
    cacheHits: grid.cells.length,
    durationMs: 0,
  },
): AreaAnalysis {
  return {
    ...data,
    grid,
    cached,
    metrics,
    environments: data.environments.map((e) =>
      e
        ? {
            ...e,
            cached: cached || e.cached,
            stale: now - e.data.fetchedAt >= CACHE_TTL,
          }
        : null,
    ),
    cells: data.cells.map((cell, i) => {
      const result = computeEcology({
        ...cell,
        point: grid.cells[i].point,
        profile: data.profile,
        analysisDate: data.analysisDate,
        now,
        environment: data.environments[cell.anchor]?.data ?? null,
      });
      return {
        ...cell,
        score: result.score,
        confidence: result.confidence,
        status:
          result.status === "scored"
            ? "valid"
            : result.status === "unsuitable"
              ? "unsuitable"
              : "insufficientData",
      };
    }),
  };
}
export function changeAreaSpecies(
  area: AreaAnalysis,
  profile: Profile,
  now = Date.now(),
): AreaAnalysis {
  const result = hydrate({ ...area, profile }, area.grid, true, now);
  persist(result, now);
  return result;
}
function persist(area: AreaAnalysis, now: number) {
  cache.putMany(
    [
      {
        key: areaCacheKey(
          area.grid,
          area.profile,
          ecologyVersion,
          area.analysisDate.slice(0, 10),
        ),
        at: area.updatedAt,
        data: schema.parse(area),
      },
    ],
    now,
  );
}
export function cachedArea(
  grid: AreaGrid,
  profile: Profile,
  now = Date.now(),
): AreaAnalysis | null {
  const rows = cache.entries(now);
  // Environmental snapshots are profile-independent. A species switch needs no providers.
  const row =
    rows.find((r) =>
      r.key.startsWith(`${ecologyVersion}:${profile}:${grid.key}:`),
    ) ?? rows.find((r) => r.key.includes(`:${grid.key}:`));
  if (
    !row ||
    row.data.cells.length !== grid.cells.length ||
    row.data.cells.some(
      (c, i) =>
        c.id !== grid.cells[i].id || c.anchor >= row.data.environments.length,
    )
  )
    return null;
  return hydrate({ ...row.data, profile }, grid, true, now);
}
export async function limitedMap<T, R>(
  items: T[],
  signal: AbortSignal,
  task: (item: T, index: number) => Promise<R>,
  concurrency = areaConfig.heatmapConcurrency,
): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        signal.throwIfAborted();
        const i = cursor++;
        result[i] = await task(items[i], i);
        signal.throwIfAborted();
      }
    }),
  );
  signal.throwIfAborted();
  return result;
}
export async function analyzeArea(
  grid: AreaGrid,
  profile: Profile,
  signal: AbortSignal,
  progress: (done: number) => void = () => {},
  now = Date.now(),
): Promise<AreaAnalysis> {
  signal.throwIfAborted();
  if (!grid.cells.length || grid.cells.length > areaConfig.maxCells)
    throw new Error("myco.error");
  const started = performance.now();
  const cached = cachedArea(grid, profile, now);
  if (
    cached &&
    (!navigator.onLine ||
      (now - cached.updatedAt < CACHE_TTL &&
        cached.cells.every((c) => c.status !== "insufficientData") &&
        cached.analysisDate.slice(0, 10) ===
          new Date(now).toISOString().slice(0, 10)))
  ) {
    progress(grid.cells.length);
    cached.metrics.durationMs = performance.now() - started;
    return cached;
  }
  if (!navigator.onLine) throw new Error("heat.offline");
  const metrics: HeatmapMetrics = {
    cells: grid.cells.length,
    requests: {},
    cacheHits: 0,
    durationMs: 0,
  };
  trackRequests(signal, metrics.requests);
  let done = 0;
  const lands = await loadLandCovers(
    grid.cells.map((c) => c.point),
    signal,
    now,
  );
  metrics.cacheHits += lands.filter((l) => l.cached).length;
  // Unknown land cannot produce a score either. Do not spend weather on it.
  const eligible = grid.cells
    .map((_, i) => i)
    .filter(
      (i) =>
        !habitatCompatibility(lands[i], profile).hard &&
        lands[i].category !== "unknown",
    );
  done = grid.cells.length - eligible.length;
  progress(done);
  // Stage barriers keep the GLOBAL provider fan-out bounded: static before dynamic.
  const terrains = await loadTerrains(
    eligible.map((i) => grid.cells[i].point),
    signal,
    undefined,
    undefined,
    now,
  );
  const soils = await limitedMap(eligible, signal, async (i) => {
    try {
      return await optionalSoilProvider.load(grid.cells[i].point, signal);
    } catch {
      signal.throwIfAborted();
      return null;
    }
  });
  const anchors: Coordinate[] = [];
  const ids = new Map<number, number>();
  eligible.forEach((i) => {
    const p = gridPoint(grid.cells[i].point);
    let index = anchors.findIndex((a) => a.lat === p.lat && a.lng === p.lng);
    if (index < 0) {
      index = anchors.length;
      anchors.push(p);
    }
    ids.set(i, index);
  });
  const chunks = Array.from(
    { length: Math.ceil(anchors.length / areaConfig.weatherBatch) },
    (_, i) =>
      anchors.slice(
        i * areaConfig.weatherBatch,
        (i + 1) * areaConfig.weatherBatch,
      ),
  );
  const batches = await limitedMap(chunks, signal, async (chunk, batch) => {
    const data = await loadEnvironments(chunk, signal, now);
    done += eligible.filter(
      (i) => Math.floor(ids.get(i)! / areaConfig.weatherBatch) === batch,
    ).length;
    progress(done);
    return data;
  });
  const environments = batches.flat();
  metrics.cacheHits += environments.filter((e) => e?.cached).length;
  signal.throwIfAborted();
  const eligibleIndex = new Map(eligible.map((cell, i) => [cell, i]));
  const data: StoredArea = {
    algorithmVersion: ecologyVersion,
    profile,
    analysisDate: new Date(now).toISOString(),
    updatedAt: Math.min(
      now,
      ...environments.flatMap((e) => (e ? [e.data.fetchedAt] : [])),
    ),
    environments,
    cells: grid.cells.map((c, i) => ({
      id: c.id,
      anchor: ids.get(i) ?? -1,
      land: lands[i],
      terrain: eligibleIndex.has(i)
        ? terrains[eligibleIndex.get(i)!]
        : emptyTerrain,
      soil: eligibleIndex.has(i) ? soils[eligibleIndex.get(i)!] : null,
    })),
  };
  metrics.durationMs = performance.now() - started;
  const result = hydrate(data, grid, false, now, metrics);
  signal.throwIfAborted();
  // Completed partial snapshots are valid offline artifacts; an aborted run never reaches this point.
  persist(result, now);
  metrics.durationMs = performance.now() - started;
  progress(grid.cells.length);
  if (import.meta.env.DEV) console.debug("MycoScore area", metrics);
  return result;
}
