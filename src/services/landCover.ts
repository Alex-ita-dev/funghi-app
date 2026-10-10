import { z } from "zod";
import {
  landSchema,
  unknownLand,
  type LandClass,
  type LandCover,
} from "../lib/ecologyModel";
import type { Coordinate } from "../lib/model";
import { offset } from "../lib/mycoArea";
import { boundedCache } from "./mycoCache";
import { environmentalJson } from "./mycoHttp";
import { requestPool } from "./sharedRequest";
export const LAND_COVER_URL =
  "https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/getSamples";
export const MARINE_URL = "https://geo.vliz.be/geoserver/MarineRegions/wfs";
export const LAND_TTL = 90 * 86400000,
  LAND_LIMIT = 256;
export const landKey = (p: Coordinate) =>
  `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
export interface LandCoverProvider {
  id: string;
  sample(
    point: Coordinate,
    signal: AbortSignal,
    now: number,
  ): Promise<LandCover>;
}
const classes: Record<number, LandClass> = {
  1: "water",
  2: "trees",
  4: "wetland",
  5: "cropland",
  7: "built",
  8: "bare",
  9: "snowIce",
  10: "unknown",
  11: "rangeland",
};
const samplesSchema = z.object({
  samples: z
    .array(
      z.object({
        locationId: z.number().int().min(0).max(8),
        value: z.union([z.string(), z.number()]),
        resolution: z.number().positive(),
        attributes: z.object({ Year: z.number().int() }),
      }),
    )
    .max(9),
});
export function parseLandCover(raw: unknown, now: number): LandCover {
  const parsed = samplesSchema.parse(raw);
  const values: Array<LandClass> = Array(9).fill("unknown");
  const seen = new Set<number>();
  for (const sample of parsed.samples) {
    if (
      seen.has(sample.locationId) ||
      sample.attributes.Year !== 2025 ||
      sample.resolution > 20
    )
      throw new Error("eco.landError");
    seen.add(sample.locationId);
    values[sample.locationId] = classes[Number(sample.value)] ?? "unknown";
  }
  return {
    category: values[0],
    neighbors: values,
    provider: "io-esri-2025",
    year: 2025,
    resolutionM: 10,
    fetchedAt: now,
    cached: false,
  };
}
export const esriLandCover: LandCoverProvider = {
  id: "io-esri-2025+goas-v1",
  async sample(point, signal, now) {
    const neighbors = [
      point,
      ...[-1, 0, 1].flatMap((y) =>
        [-1, 0, 1]
          .filter((x) => x !== 0 || y !== 0)
          .map((x) => offset(point, x * 10, y * 10)),
      ),
    ];
    const params = new URLSearchParams({
      f: "json",
      geometryType: "esriGeometryMultipoint",
      geometry: JSON.stringify({
        points: neighbors.map((p) => [
          Number(p.lng.toFixed(6)),
          Number(p.lat.toFixed(6)),
        ]),
        spatialReference: { wkid: 4326 },
      }),
      mosaicRule: JSON.stringify({ where: "Year = 2025" }),
      outFields: "Year",
      returnFirstValueOnly: "true",
      interpolation: "RSP_NearestNeighbor",
      pixelSize: "10,10",
    });
    let land = unknownLand(now);
    try {
      land = parseLandCover(
        await environmentalJson(`${LAND_COVER_URL}?${params}`, signal),
        now,
      );
    } catch {
      signal.throwIfAborted();
    }
    // NoData is NOT water. Only an independent marine polygon intersection can establish it.
    if (
      land.category === "unknown" &&
      !land.neighbors.some((c) => c !== "unknown")
    ) {
      const params = new URLSearchParams({
        service: "WFS",
        version: "1.0.0",
        request: "GetFeature",
        typeName: "MarineRegions:goas",
        outputFormat: "application/json",
        cql_filter: `INTERSECTS(the_geom,POINT(${point.lng.toFixed(6)} ${point.lat.toFixed(6)}))`,
        propertyName: "name",
        maxFeatures: "1",
      });
      try {
        const data = z
          .object({
            type: z.literal("FeatureCollection"),
            features: z
              .array(
                z.object({
                  type: z.literal("Feature"),
                  properties: z.object({ name: z.string().min(1) }),
                }),
              )
              .max(1),
          })
          .parse(await environmentalJson(`${MARINE_URL}?${params}`, signal));
        if (data.features.length)
          land = {
            category: "water",
            neighbors: [],
            provider: "marine-goas-2021",
            year: 2021,
            resolutionM: null,
            fetchedAt: now,
            cached: false,
          };
      } catch {
        signal.throwIfAborted();
      }
    }
    return land;
  },
};
const cache = boundedCache(
  "mycotrail.land-cover.v21",
  landSchema,
  LAND_LIMIT,
  LAND_TTL,
);
const pooled = requestPool<LandCover>();
export function loadLandCover(
  point: Coordinate,
  signal: AbortSignal,
  now = Date.now(),
  provider: LandCoverProvider = esriLandCover,
): Promise<LandCover> {
  signal.throwIfAborted();
  if (
    !Number.isFinite(point.lat) ||
    Math.abs(point.lat) > 90 ||
    !Number.isFinite(point.lng) ||
    Math.abs(point.lng) > 180
  )
    return Promise.resolve(unknownLand(now));
  const key = `${provider.id}:${landKey(point)}`,
    stored = cache.get(key, now);
  if (
    stored &&
    (stored.data.category !== "unknown" || now - stored.at < 5 * 60000)
  )
    return Promise.resolve({ ...stored.data, cached: true });
  if (!navigator.onLine)
    return Promise.resolve(
      stored ? { ...stored.data, cached: true } : unknownLand(now),
    );
  return pooled(key, signal, async (sharedSignal) => {
    const data = await provider.sample(point, sharedSignal, now);
    sharedSignal.throwIfAborted();
    if (data.category !== "unknown")
      cache.putMany([{ key, at: now, data }], now);
    return data;
  });
}
