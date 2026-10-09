import { z } from "zod";
import type { Coordinate } from "../lib/model";
import { areaConfig } from "../lib/mycoArea";
import {
  deriveTerrain,
  terrainStencil,
  validElevation,
  type Terrain,
} from "../lib/mycoTerrain";
import { boundedCache } from "./mycoCache";
import { environmentalJson } from "./mycoHttp";
export const TERRAIN_TTL = 180 * 86400000;
export const TERRAIN_LIMIT = 4096;
const cache = boundedCache(
  "mycotrail.terrain.v2",
  z.number().min(-500).max(9000),
  TERRAIN_LIMIT,
  TERRAIN_TTL,
);
export interface TerrainProvider {
  id: string;
  sample(points: Coordinate[], signal: AbortSignal): Promise<(number | null)[]>;
}
export const openMeteoTerrain: TerrainProvider = {
  id: "copernicus-glo90-2021",
  async sample(points, signal) {
    if (points.length > areaConfig.elevationBatch)
      throw new Error("myco.error");
    const params = new URLSearchParams({
      latitude: points.map((p) => p.lat.toFixed(6)).join(","),
      longitude: points.map((p) => p.lng.toFixed(6)).join(","),
    });
    const raw = z
      .object({
        elevation: z.array(z.unknown()).max(areaConfig.elevationBatch),
      })
      .parse(
        await environmentalJson(
          `https://api.open-meteo.com/v1/elevation?${params}`,
          signal,
        ),
      );
    if (raw.elevation.length !== points.length) throw new Error("myco.error");
    return raw.elevation.map((v) => (validElevation(v) ? v : null));
  },
};
const sampleKey = (p: Coordinate, provider: TerrainProvider) =>
  `${provider.id}:${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
export async function loadTerrains(
  points: Coordinate[],
  signal: AbortSignal,
  progress: (done: number) => void = () => {},
  provider: TerrainProvider = openMeteoTerrain,
  now = Date.now(),
): Promise<Terrain[]> {
  signal.throwIfAborted();
  if (points.length > areaConfig.maxCells) throw new Error("myco.error");
  const stencils = points.map(terrainStencil);
  const known = new Map(
    cache.entries(now).map((r) => [r.key, r.data as number | null]),
  );
  const missing = new Map<string, Coordinate>();
  stencils.flat().forEach((p) => {
    const key = sampleKey(p, provider);
    if (!known.has(key)) missing.set(key, p);
  });
  const report = () =>
    progress(
      stencils.filter((s) => s.every((p) => known.has(sampleKey(p, provider))))
        .length,
    );
  report();
  const entries = [...missing.entries()];
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      signal.throwIfAborted();
      const chunk = entries.slice(cursor, cursor + areaConfig.elevationBatch);
      cursor += areaConfig.elevationBatch;
      let values: (number | null)[] = chunk.map(() => null);
      if (navigator.onLine) {
        try {
          values = await provider.sample(
            chunk.map(([, p]) => p),
            signal,
          );
        } catch {
          signal.throwIfAborted();
        }
      }
      signal.throwIfAborted();
      const rows: { key: string; at: number; data: number }[] = [];
      chunk.forEach(([key], i) => {
        const value = validElevation(values[i]) ? values[i] : null;
        known.set(key, value);
        if (value !== null) rows.push({ key, at: now, data: value });
      });
      if (rows.length) cache.putMany(rows, now);
      report();
    }
  }
  await Promise.all(Array.from({ length: areaConfig.concurrency }, worker));
  signal.throwIfAborted();
  return stencils.map((s) =>
    deriveTerrain(s.map((p) => known.get(sampleKey(p, provider)) ?? null)),
  );
}
