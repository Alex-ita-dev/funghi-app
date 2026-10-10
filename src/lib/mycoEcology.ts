import {
  classifyScore,
  curve,
  finite,
  summarizeEnvironment,
  type Environment,
} from "./mycoScore";
import type { Coordinate } from "./model";
import type { Terrain } from "./mycoTerrain";
import {
  ecologyProfiles,
  ecologyVersion,
  type EcologyProfileId,
  type LandCover,
  type SoilProperties,
} from "./ecologyModel";
export type Compatibility =
  "compatible" | "marginal" | "incompatible" | "unknown";
export function habitatCompatibility(
  land: LandCover,
  profile: EcologyProfileId,
) {
  const p = ecologyProfiles[profile],
    c = land.category;
  const same = land.neighbors.filter((n) => n === c).length;
  // A built pixel near vegetation is marginal, not an exclusion of an entire city.
  const mixedBuilt =
    c === "built" &&
    land.neighbors.some((n) =>
      ["trees", "grassland", "shrubland", "rangeland"].includes(n),
    );
  const hard = p.hardExclusions.includes(c) && !mixedBuilt;
  const score = hard ? 0 : mixedBuilt ? 10 : (p.habitat[c] ?? null);
  const status: Compatibility = hard
    ? "incompatible"
    : score === null
      ? "unknown"
      : score >= 65
        ? "compatible"
        : "marginal";
  return {
    status,
    score,
    hard,
    homogeneity: land.neighbors.length ? same / land.neighbors.length : null,
    hostCompatibility: (p.forestSymbiont ? "unknown" : "notRequired") as
      "unknown" | "notRequired",
  };
}
export function biogeography(point: Coordinate, profile: EcologyProfileId) {
  const p = ecologyProfiles[profile],
    latitude = Math.abs(point.lat);
  const inClimateBand = latitude >= p.latitude[0] && latitude <= p.latitude[1];
  // These are climate applicability bands, NOT fabricated species distribution polygons.
  const status =
    inClimateBand && (p.geographicScope === "broad" || point.lat >= 0)
      ? "compatible"
      : "uncertain";
  return {
    status,
    score:
      status === "compatible" ? 100 : p.geographicScope === "broad" ? 65 : 50,
    climateBand:
      latitude < 23.5
        ? "tropical"
        : latitude < 40
          ? "subtropical"
          : latitude < 60
            ? "temperate"
            : "borealPolar",
  } as const;
}
const clamp = (x: number) => Math.max(0, Math.min(100, x));
function mean(values: (number | null | undefined)[], fraction = 0.8) {
  const numbers = values.filter(finite);
  return numbers.length >= Math.ceil(values.length * fraction) && numbers.length
    ? numbers.reduce((a, b) => a + b, 0) / numbers.length
    : null;
}
function weighted(values: [number | null, number][]): number | null {
  const available = values.filter(([v]) => finite(v));
  const total = available.reduce((s, [, w]) => s + w, 0);
  return total
    ? clamp(available.reduce((s, [v, w]) => s + v! * w, 0) / total)
    : null;
}
export function seasonalElevation(
  point: Coordinate,
  terrain: Terrain,
  env: Environment,
  profile: EcologyProfileId,
  date: string,
) {
  const p = ecologyProfiles[profile],
    m = summarizeEnvironment(env),
    lat = Math.abs(point.lat),
    time = new Date(date);
  if (!Number.isFinite(time.getTime()))
    return { season: null, elevation: null, thermalBandM: null };
  const month =
    ((time.getUTCMonth() + (point.lat < 0 ? 6 : 0)) % 12) +
    1 +
    (time.getUTCDate() - 1) / 30;
  const altitude = terrain.elevationM ?? env.elevationM;
  const autumn = 10.5 - (lat - 35) * 0.05 - (altitude ?? 0) / 3000;
  const spring = 5.5 + (lat - 35) * 0.035 + (altitude ?? 0) / 4000;
  const distance = (center: number) =>
    Math.min(Math.abs(month - center), 12 - Math.abs(month - center));
  const pulse = Math.max(
    Math.exp(-((distance(autumn) / p.season.width) ** 2)),
    p.season.springStrength *
      Math.exp(-((distance(spring) / p.season.width) ** 2)),
  );
  const calendar =
    lat < 23.5 ? null : p.season.floor + (100 - p.season.floor) * pulse;
  const soilRecent = mean(env.days.slice(-3).map((d) => d.soil)),
    soilPrevious = mean(env.days.slice(-6, -3).map((d) => d.soil));
  const soilTrend =
    soilRecent !== null && soilPrevious !== null
      ? soilRecent - soilPrevious
      : null;
  const thermal = weighted([
    [curve(m.air, p.weather.air), 0.25],
    [curve(m.soil, p.weather.soil), 0.65],
    [
      soilTrend === null
        ? null
        : clamp(100 - Math.max(0, Math.abs(soilTrend) - 2) * 10),
      0.1,
    ],
  ]);
  const season =
    calendar === null
      ? null
      : weighted([
          [calendar, 0.8],
          [thermal, 0.2],
        ]);
  // Local lapse-rate proxy: not a measured treeline, habitat range or forecast.
  const target =
    (p.weather.air[1] + p.weather.air[2]) / 2 +
    (calendar === null ? 0 : (calendar - 75) / 25);
  const thermalBandM =
    altitude === null || m.air === null
      ? null
      : Math.max(0, altitude + (m.air - target) / 0.0065);
  const elevation =
    altitude === null || thermalBandM === null
      ? null
      : weighted([
          [clamp(100 - Math.abs(altitude - thermalBandM) / 12), 0.35],
          [thermal, 0.65],
        ]);
  return { season, elevation, thermalBandM, soilTrend };
}
export function rainfallSequence(env: Environment) {
  const days = env.days.slice(-14),
    rain = days.map((d) => d.rain);
  if (days.length !== 14 || !rain.every(finite))
    return { score: null, wetDays: null, peakShare: null };
  const values = rain as number[],
    total = values.reduce((a, b) => a + b, 0),
    wetDays = values.filter((x) => x >= 1).length;
  const peakShare = total > 0 ? Math.max(...values) / total : 0;
  const score =
    total === 0
      ? 0
      : clamp(
          100 *
            (1 - Math.max(0, peakShare - 0.3) * 0.75) *
            Math.min(1, wetDays / 4),
        );
  return { score, wetDays, peakShare };
}
export type EcologyInput = {
  point: Coordinate;
  profile: EcologyProfileId;
  land: LandCover;
  terrain: Terrain;
  environment: Environment | null;
  soil: SoilProperties | null;
  analysisDate: string;
  now?: number;
};
export function computeEcology(input: EcologyInput) {
  const {
      point,
      profile,
      land,
      terrain,
      environment: env,
      soil,
      analysisDate,
    } = input,
    now = input.now ?? Date.now(),
    p = ecologyProfiles[profile];
  const habitat = habitatCompatibility(land, profile),
    geo = biogeography(point, profile);
  const metrics = env ? summarizeEnvironment(env) : null;
  const temporal = env
    ? seasonalElevation(point, terrain, env, profile, analysisDate)
    : { season: null, elevation: null, thermalBandM: null, soilTrend: null };
  const rain = env
    ? rainfallSequence(env)
    : { score: null, wetDays: null, peakShare: null };
  const soilMoisture = metrics
    ? curve(metrics.moisture, p.weather.moisture)
    : null;
  const soilTemperature = metrics ? curve(metrics.soil, p.weather.soil) : null;
  let moisture = metrics
    ? weighted([
        [soilMoisture, p.moisture.soilWeight],
        [curve(metrics.rain14, p.weather.rain14), p.moisture.rainWeight * 0.45],
        [
          curve(metrics.postRain, p.weather.postRain),
          p.moisture.rainWeight * 0.25,
        ],
        [rain.score, p.moisture.rainWeight * 0.3],
      ])
    : null;
  if (moisture !== null && soilMoisture !== null)
    moisture = Math.min(
      moisture,
      p.moisture.limitFloor +
        ((100 - p.moisture.limitFloor) * soilMoisture) / 100,
    );
  let temperature = metrics
    ? weighted([
        [soilTemperature, p.thermal.soilWeight],
        [curve(metrics.air, p.weather.air), p.thermal.airWeight],
      ])
    : null;
  if (temperature !== null && soilTemperature !== null)
    temperature = Math.min(
      temperature,
      p.thermal.limitFloor +
        ((100 - p.thermal.limitFloor) * soilTemperature) / 100,
    );
  const vpd = env ? mean(env.days.slice(-3).map((d) => d.vpd)) : null,
    wind = env ? mean(env.days.slice(-3).map((d) => d.wind)) : null,
    radiation = env ? mean(env.days.slice(-3).map((d) => d.radiation)) : null;
  // ET0 already includes energy/wind: radiation is displayed but not counted twice.
  const drying = metrics
    ? weighted([
        [curve(metrics.drying, p.weather.drying), 0.55],
        [curve(vpd, p.drying.vpd), 0.25],
        [curve(wind, p.drying.wind), 0.1],
        [curve(metrics.humidity, p.weather.humidity), 0.1],
      ])
    : null;
  const slope = terrain.slopeDegrees;
  const pressure = drying === null ? null : (100 - drying) / 100;
  const thermalSide =
    metrics?.soil === null || metrics?.soil === undefined
      ? 0
      : Math.max(
          -1,
          Math.min(
            1,
            (metrics.soil - (p.weather.soil[1] + p.weather.soil[2]) / 2) / 8,
          ),
        );
  const aspectEffect =
    terrain.aspectDegrees === null ||
    slope === null ||
    slope < 2 ||
    (metrics?.soil == null && pressure === null) ||
    Math.abs(point.lat) < 23.5
      ? null
      : Math.cos((terrain.aspectDegrees * Math.PI) / 180) *
        (point.lat < 0 ? -1 : 1) *
        Math.max(
          -0.5,
          Math.min(1, thermalSide + (pressure ?? 0) * p.drying.amplitude),
        );
  const terrainScore = weighted([
    [
      slope === null
        ? null
        : clamp(100 - Math.max(0, slope - p.terrain.slopeStart) * 2),
      0.4,
    ],
    [
      aspectEffect === null
        ? null
        : clamp(88 + p.terrain.aspectAmplitude * aspectEffect),
      0.25,
    ],
    [temporal.elevation, 0.35],
  ]);
  const soilScore = soil && p.soilPH ? curve(soil.ph, p.soilPH) : null;
  const factors = [
    { id: "moisture", score: moisture },
    { id: "temperature", score: temperature },
    { id: "drying", score: drying },
    { id: "season", score: temporal.season },
    { id: "terrain", score: terrainScore },
    { id: "soil", score: soilScore },
  ].map((f) => ({ ...f, weight: p.weights[f.id as keyof typeof p.weights] }));
  const available = factors.filter((f) => f.score !== null);
  const weatherAvailable = moisture !== null && temperature !== null;
  // Geometric combination prevents high rain/air compensating a fundamentally hostile soil.
  const weight = available.reduce((s, f) => s + f.weight, 0);
  const conditions =
    weatherAvailable && weight
      ? clamp(
          100 *
            Math.exp(
              available.reduce(
                (s, f) =>
                  s + f.weight * Math.log(Math.max(0.01, f.score!) / 100),
                0,
              ) / weight,
            ),
        )
      : null;
  let score =
    conditions === null || habitat.score === null
      ? null
      : Math.round(
          conditions *
            Math.sqrt(habitat.score / 100) *
            Math.sqrt(geo.score / 100),
        );
  // Core factors are ecological limits, never confidence adjustments.
  if (score !== null && soilMoisture !== null)
    score = Math.min(score, Math.round(20 + 0.8 * soilMoisture));
  if (score !== null && soilTemperature !== null)
    score = Math.min(score, Math.round(20 + 0.8 * soilTemperature));
  if (score !== null && geo.status === "uncertain") score = Math.min(score, 64);
  const status = habitat.hard
    ? "unsuitable"
    : habitat.status === "unknown"
      ? "uncertain"
      : score === null
        ? "insufficient"
        : "scored";
  if (status !== "scored") score = null;
  const weatherCompleteness = metrics
    ? (
        [
          [metrics.moisture, 0.3],
          [metrics.soil, 0.25],
          [metrics.air, 0.1],
          [metrics.rain14, 0.15],
          [metrics.postRain, 0.05],
          [metrics.drying, 0.1],
          [metrics.humidity, 0.05],
        ] as [number | null, number][]
      ).reduce((sum, [v, w]) => sum + (finite(v) ? w : 0), 0)
    : 0;
  const weatherFreshness = env
    ? Math.max(
        0.25,
        now - env.fetchedAt <= 6 * 3600000
          ? 1
          : 0.75 - (now - env.fetchedAt - 6 * 3600000) / (7 * 86400000),
      )
    : 0;
  const landQuality =
    land.category === "unknown"
      ? 0
      : land.provider === "marine-goas-2021"
        ? 0.7
        : Math.max(
            0.5,
            1 -
              Math.max(
                0,
                new Date(now).getUTCFullYear() - (land.year ?? 0) - 1,
              ) *
                0.08,
          );
  let confidence = Math.round(
    35 * landQuality +
      40 * weatherCompleteness * weatherFreshness +
      10 * (slope === null ? 0 : 1) +
      10 * (geo.status === "compatible" ? 1 : 0.4) +
      5 * (soil ? 1 : 0),
  );
  if (vpd === null) confidence -= 2;
  if (wind === null) confidence -= 1;
  if (p.forestSymbiont) confidence -= 5; // tree cover cannot identify a compatible host species
  if (habitat.homogeneity !== null && habitat.homogeneity < 0.6)
    confidence -= 8;
  if (land.category === "unknown") confidence = Math.min(confidence, 45);
  if (habitat.hard) confidence = Math.round(landQuality * 90); // weather is deliberately skipped, not a failed provider
  confidence = clamp(confidence);
  const reasons = [
    { id: "habitat", score: habitat.score },
    ...(geo.status === "uncertain"
      ? [{ id: "geography", score: geo.score }]
      : []),
    ...available.map((f) => ({ id: f.id, score: f.score })),
  ]
    .filter((f) => f.score !== null)
    .sort(
      (a, b) =>
        Number(b.score! < 45) - Number(a.score! < 45) || b.score! - a.score!,
    )
    .slice(0, 5);
  return {
    algorithmVersion: ecologyVersion,
    status,
    score,
    classification: score === null ? null : classifyScore(score),
    habitat,
    biogeography: geo,
    conditions: conditions === null ? null : Math.round(conditions),
    confidence,
    confidenceLabel:
      confidence >= 85 ? "high" : confidence >= 55 ? "medium" : "low",
    factors,
    reasons,
    metrics,
    temporal,
    rain,
    vpd,
    wind,
    radiation,
    analysisDate,
  };
}
