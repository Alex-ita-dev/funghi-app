import { z } from "zod";
import type { Coordinate } from "../lib/model";
import { environmentSchema } from "../lib/mycoScore";
import { emptyTerrain } from "../lib/mycoTerrain";
import {
  ecologyVersion,
  landSchema,
  soilSchema,
  type EcologyProfileId,
} from "../lib/ecologyModel";
import {
  computeEcology,
  habitatCompatibility,
  biogeography,
} from "../lib/mycoEcology";
import { loadEnvironment, CACHE_TTL, CACHE_MAX_AGE } from "./mycoEnvironment";
import { loadTerrains } from "./mycoTerrain";
import { loadLandCover, landKey } from "./landCover";
import { optionalSoilProvider, type SoilProvider } from "./ecologySoil";
import { boundedCache } from "./mycoCache";
import { requestPool } from "./sharedRequest";
import type { CellSample } from "./mycoAnalysis";
export const snapshotSchema = z.object({
  algorithmVersion: z.literal(ecologyVersion),
  profile: z.enum(["generic", "porcini", "chanterelles"]),
  land: landSchema,
  terrain: z.object({
    elevationM: z.number().finite().nullable(),
    slopeDegrees: z.number().min(0).max(80).nullable(),
    aspectDegrees: z.number().min(0).max(360).nullable(),
  }),
  environment: environmentSchema.nullable(),
  soil: soilSchema.nullable(),
  analysisDate: z.string().datetime(),
});
export type EcologySnapshot = z.infer<typeof snapshotSchema>;
export type EcologyAnalysis = EcologySnapshot & {
  result: ReturnType<typeof computeEcology>;
  cached: boolean;
  stale: boolean;
};
const cache = boundedCache(
  "mycotrail.ecology-score.v21",
  snapshotSchema,
  32,
  CACHE_MAX_AGE,
);
const pool = requestPool<EcologyAnalysis>();
export const ecologyCacheKey = (
  p: Coordinate,
  profile: EcologyProfileId,
  day: string,
  version: string = ecologyVersion,
) => `${version}:${profile}:${landKey(p)}:${day}`;
export async function loadEcology(
  point: Coordinate,
  profile: EcologyProfileId,
  signal: AbortSignal,
  seed?: CellSample | null,
  now = Date.now(),
  soilProvider: SoilProvider = optionalSoilProvider,
): Promise<EcologyAnalysis> {
  signal.throwIfAborted();
  const prefix = `${ecologyVersion}:${profile}:${landKey(point)}:`,
    today = new Date(now).toISOString().slice(0, 10);
  const stored = cache.entries(now).find((r) => r.key.startsWith(prefix));
  const finish = (data: EcologySnapshot, cached: boolean): EcologyAnalysis => ({
    ...data,
    cached,
    stale: data.environment
      ? now - data.environment.fetchedAt >= CACHE_TTL
      : false,
    result: computeEcology({ ...data, point, now }),
  });
  // The area already contains the exact point input, including exclusions and missing data.
  // A tap is read-only: explicit Retry can request missing/refreshed providers.
  if (
    seed &&
    seed.algorithmVersion === ecologyVersion &&
    landKey(seed.point) === landKey(point) &&
    (!navigator.onLine ||
      now - new Date(seed.analysisDate).getTime() < CACHE_TTL)
  )
    return finish({ ...seed, profile }, true);
  if (
    stored &&
    (!navigator.onLine ||
      (stored.data.analysisDate.startsWith(today) &&
        now - stored.at < CACHE_TTL &&
        stored.data.land.category !== "unknown" &&
        stored.data.environment))
  )
    return finish(stored.data, true);
  return pool(`${prefix}${today}`, signal, async (sharedSignal) => {
    const land = await loadLandCover(point, sharedSignal, now);
    sharedSignal.throwIfAborted();
    const habitat = habitatCompatibility(land, profile);
    // Geography is evaluated before requests. Uncertain ranges are not hard vetoes.
    biogeography(point, profile);
    let environment: EcologySnapshot["environment"] = null,
      terrain = emptyTerrain,
      soil: EcologySnapshot["soil"] = null,
      cached = land.cached;
    if (!habitat.hard) {
      const rows = await Promise.allSettled([
        seed?.environment &&
        now - seed.environment.fetchedAt <
          (navigator.onLine ? CACHE_TTL : CACHE_MAX_AGE)
          ? Promise.resolve({
              data: seed.environment,
              cached: true,
              stale: false,
            })
          : loadEnvironment(point, sharedSignal, now),
        seed
          ? Promise.resolve([seed.terrain])
          : loadTerrains([point], sharedSignal, undefined, undefined, now),
        soilProvider.load(point, sharedSignal),
      ]);
      sharedSignal.throwIfAborted();
      if (rows[0].status === "fulfilled") {
        environment = rows[0].value.data;
        cached = cached && rows[0].value.cached;
      }
      if (rows[1].status === "fulfilled") terrain = rows[1].value[0];
      if (rows[2].status === "fulfilled") soil = rows[2].value;
    }
    const snapshot: EcologySnapshot = {
      algorithmVersion: ecologyVersion,
      profile,
      land,
      terrain,
      environment,
      soil,
      analysisDate: new Date(now).toISOString(),
    };
    const timestamp = environment ? Math.min(now, environment.fetchedAt) : now;
    sharedSignal.throwIfAborted();
    if (land.category !== "unknown" || environment)
      cache.putMany(
        [
          {
            key: ecologyCacheKey(point, profile, today),
            at: timestamp,
            data: snapshot,
          },
        ],
        now,
      );
    if (land.category === "unknown" && !environment && stored)
      return finish(stored.data, true);
    return finish(snapshot, cached);
  });
}
