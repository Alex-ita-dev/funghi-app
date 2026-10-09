import {
  classifyScore,
  computeMycoScore,
  type Environment,
  type speciesProfiles,
} from "./mycoScore";
import type { Terrain } from "./mycoTerrain";
export const algorithmVersion = "2.0.0";
export type Profile = keyof typeof speciesProfiles;
// Secondary product heuristics, not validated biological response models.
export const secondaryProfiles = {
  generic: {
    slopeWeight: 3,
    aspectWeight: 4,
    seasonWeight: 3,
    favourableMonths: [5, 6, 9, 10],
    marginalMonths: [4, 7, 8, 11],
    marginal: 85,
    other: 70,
  },
  porcini: {
    slopeWeight: 3,
    aspectWeight: 5,
    seasonWeight: 5,
    favourableMonths: [6, 9, 10],
    marginalMonths: [5, 7, 8, 11],
    marginal: 75,
    other: 45,
  },
} as const;
export function seasonScore(
  profile: Profile,
  lat: number,
  analysisDate: string,
): number | null {
  const date = new Date(analysisDate);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) < 23.5) return 85; // no temperate-calendar claim in the tropics
  const month = ((date.getUTCMonth() + (lat < 0 ? 6 : 0)) % 12) + 1;
  const p = secondaryProfiles[profile];
  return (p.favourableMonths as readonly number[]).includes(month)
    ? 100
    : (p.marginalMonths as readonly number[]).includes(month)
      ? p.marginal
      : p.other;
}
export function computeMycoScoreV2(
  env: Environment,
  terrain: Terrain,
  profile: Profile = "generic",
  analysisDate = new Date(env.fetchedAt).toISOString(),
) {
  const base = computeMycoScore(env, profile),
    p = secondaryProfiles[profile];
  const secondaryWeight = p.slopeWeight + p.aspectWeight + p.seasonWeight;
  const factors: { id: string; weight: number; score: number | null }[] =
    base.factors.map((f) => ({
      ...f,
      weight: (f.weight * (100 - secondaryWeight)) / 100,
    }));
  const slope = terrain.slopeDegrees;
  // Aspect only modulates drying in warm/dry conditions; never infers habitat.
  const drying = base.metrics.drying,
    air = base.metrics.air;
  const pressure =
    drying === null || air === null
      ? null
      : Math.max(0, Math.min(1, Math.max((air - 18) / 12, drying / 15)));
  const aspect = terrain.aspectDegrees;
  const aspectScore =
    slope === null || pressure === null
      ? null
      : aspect === null || Math.abs(env.lat) < 23.5
        ? 85
        : 85 +
          15 *
            Math.cos((aspect * Math.PI) / 180) *
            (env.lat < 0 ? -1 : 1) *
            pressure;
  factors.push(
    {
      id: "slope",
      weight: p.slopeWeight,
      score:
        slope === null ? null : Math.max(20, 100 - Math.max(0, slope - 15) * 2),
    },
    { id: "aspect", weight: p.aspectWeight, score: aspectScore },
    {
      id: "season",
      weight: p.seasonWeight,
      score: seasonScore(profile, env.lat, analysisDate),
    },
  );
  const available = factors.filter(
    (f) => f.score !== null && Number.isFinite(f.score),
  );
  const coverage = available.reduce((s, f) => s + f.weight, 0);
  const score =
    base.score === null || !coverage
      ? null
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(
              available.reduce((s, f) => s + f.score! * f.weight, 0) / coverage,
            ),
          ),
        );
  const explanations = [
    ...available
      .filter((f) => f.score! < 45)
      .sort((a, b) => (100 - b.score!) * b.weight - (100 - a.score!) * a.weight)
      .slice(0, 2),
    ...available
      .filter((f) => f.score! >= 45)
      .sort((a, b) => b.score! * b.weight - a.score! * a.weight),
  ].slice(0, 4);
  return {
    ...base,
    score,
    classification: score === null ? null : classifyScore(score),
    coverage,
    reliability: coverage >= 85 ? "high" : coverage >= 55 ? "medium" : "low",
    factors,
    explanations,
  };
}
