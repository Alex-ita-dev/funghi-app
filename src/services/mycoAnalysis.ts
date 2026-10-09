import { z } from "zod";
import { environmentSchema } from "../lib/mycoScore";
import {
  algorithmVersion,
  computeMycoScoreV2,
  type Profile,
} from "../lib/mycoScoreV2";
import type { AreaGrid } from "../lib/mycoArea";
import { areaConfig } from "../lib/mycoArea";
import type { Coordinate } from "../lib/model";
import {
  gridPoint,
  loadEnvironments,
  CACHE_TTL,
  CACHE_MAX_AGE,
} from "./mycoEnvironment";
import { loadTerrains } from "./mycoTerrain";
import { boundedCache } from "./mycoCache";
const terrainSchema = z.object({
  elevationM: z.number().min(-500).max(9000).nullable(),
  slopeDegrees: z.number().min(0).max(80).nullable(),
  aspectDegrees: z.number().min(0).max(360).nullable(),
});
const schema = z.object({
  algorithmVersion: z.literal(algorithmVersion),
  profile: z.enum(["generic", "porcini"]),
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
    .max(9),
  cells: z
    .array(
      z.object({
        id: z.string(),
        anchor: z.number().int().min(0).max(8),
        terrain: terrainSchema,
        score: z.number().min(0).max(100).nullable(),
      }),
    )
    .max(areaConfig.maxCells),
});
export type AreaAnalysis = z.infer<typeof schema> & {
  grid: AreaGrid;
  cached: boolean;
};
export type CellSample = {
  environment: NonNullable<AreaAnalysis["environments"][number]>;
  terrain: z.infer<typeof terrainSchema>;
  profile: Profile;
  analysisDate: string;
};
export const AREA_CACHE_LIMIT = 6;
const cache = boundedCache(
  "mycotrail.areas.v2",
  schema,
  AREA_CACHE_LIMIT,
  CACHE_MAX_AGE,
);
export const areaCacheKey = (
  grid: AreaGrid,
  profile: Profile,
  version = algorithmVersion,
  date = new Date().toISOString().slice(0, 10),
) => `${version}:${profile}:${grid.key}:${date}`;
export function cachedArea(
  grid: AreaGrid,
  profile: Profile,
  now = Date.now(),
): AreaAnalysis | null {
  const prefix = `${algorithmVersion}:${profile}:${grid.key}:`;
  const data = cache.entries(now).find((r) => r.key.startsWith(prefix))?.data;
  if (
    !data ||
    data.cells.length !== grid.cells.length ||
    data.cells.some(
      (c, i) =>
        c.id !== grid.cells[i].id || c.anchor >= data.environments.length,
    )
  )
    return null;
  return {
    ...data,
    environments: data.environments.map((e) =>
      e
        ? {
            ...e,
            cached: true,
            stale: e.stale || now - e.data.fetchedAt >= CACHE_TTL,
          }
        : null,
    ),
    grid,
    cached: true,
  };
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
  const cached = cachedArea(grid, profile, now);
  if (
    cached &&
    (!navigator.onLine ||
      (now - cached.updatedAt < CACHE_TTL &&
        cached.analysisDate.slice(0, 10) ===
          new Date(now).toISOString().slice(0, 10) &&
        cached.environments.every((e) => e && !e.stale) &&
        cached.cells.every(
          (c) => c.score !== null && c.terrain.slopeDegrees !== null,
        )))
  ) {
    progress(grid.cells.length);
    return cached;
  }
  if (!navigator.onLine && !cached) throw new Error("heat.offline");
  const anchors: Coordinate[] = [];
  const ids = grid.cells.map((c) => {
    const p = gridPoint(c.anchor);
    let i = anchors.findIndex((a) => a.lat === p.lat && a.lng === p.lng);
    if (i < 0) {
      i = anchors.length;
      anchors.push(p);
    }
    return i;
  });
  const environments = await loadEnvironments(anchors, signal, now);
  signal.throwIfAborted();
  if (environments.every((e) => !e)) {
    if (cached) return cached;
    throw new Error("myco.error");
  }
  const terrain = await loadTerrains(
    grid.cells.map((c) => c.point),
    signal,
    progress,
    undefined,
    now,
  );
  signal.throwIfAborted();
  const analysisDate = new Date(now).toISOString();
  const cells = grid.cells.map((c, i) => ({
    id: c.id,
    anchor: ids[i],
    terrain: terrain[i],
    score: environments[ids[i]]
      ? computeMycoScoreV2(
          { ...environments[ids[i]]!.data, ...c.point },
          terrain[i],
          profile,
          analysisDate,
        ).score
      : null,
  }));
  const updatedAt = Math.min(
    ...environments.flatMap((e) => (e ? [e.data.fetchedAt] : [])),
  );
  const data: z.infer<typeof schema> = {
    algorithmVersion,
    profile,
    analysisDate,
    updatedAt,
    environments,
    cells,
  };
  cache.putMany(
    [
      {
        key: areaCacheKey(
          grid,
          profile,
          algorithmVersion,
          analysisDate.slice(0, 10),
        ),
        at: updatedAt,
        data,
      },
    ],
    now,
  );
  return {
    ...data,
    grid,
    cached: environments.every((e) => e?.cached === true),
  };
}
export function cellSample(
  area: AreaAnalysis,
  index: number,
): CellSample | null {
  const cell = area.cells[index],
    environment = area.environments[cell.anchor];
  return environment
    ? {
        environment: {
          ...environment,
          data: { ...environment.data, ...area.grid.cells[index].point },
        },
        terrain: cell.terrain,
        profile: area.profile,
        analysisDate: area.analysisDate,
      }
    : null;
}
