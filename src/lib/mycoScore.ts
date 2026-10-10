import { z } from "zod";
const value = z.number().finite().nullable();
export const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rain: value,
  air: value,
  min: value,
  max: value,
  humidity: value,
  soil: value,
  moisture: value,
  et0: value,
  vpd: value.optional(),
  wind: value.optional(),
  radiation: value.optional(),
});
export const environmentSchema = z.object({
  version: z.literal(1),
  fetchedAt: z.number().finite(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  elevationM: value,
  aspect: z.null(),
  slopeDegrees: z.null(),
  days: z.array(daySchema).length(30),
});
export type Environment = z.infer<typeof environmentSchema>;
export type EnvironmentalDay = z.infer<typeof daySchema>;
export type Curve = readonly [number, number, number, number];
export type SpeciesProfile = {
  air: Curve;
  soil: Curve;
  moisture: Curve;
  rain14: Curve;
  postRain: Curve;
  drying: Curve;
  humidity: Curve;
};
// V1 product heuristics, NOT biologically validated species predictions.
export const speciesProfiles: Record<"generic" | "porcini", SpeciesProfile> = {
  generic: {
    air: [2, 12, 22, 32],
    soil: [2, 10, 20, 30],
    moisture: [0.08, 0.22, 0.38, 0.55],
    rain14: [0, 25, 80, 180],
    postRain: [0, 3, 10, 25],
    drying: [-30, -15, 0, 20],
    humidity: [30, 70, 100, 101],
  },
  porcini: {
    air: [4, 14, 21, 30],
    soil: [4, 12, 20, 28],
    moisture: [0.1, 0.24, 0.36, 0.52],
    rain14: [0, 30, 75, 160],
    postRain: [0, 5, 12, 25],
    drying: [-30, -15, 0, 15],
    humidity: [35, 75, 100, 101],
  },
};
export const weights = {
  moisture: 25,
  rain14: 20,
  air: 15,
  soil: 15,
  postRain: 10,
  drying: 10,
  humidity: 5,
} as const;
export type Factor = keyof typeof weights;
export const significantRainMm = 5;
export const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
export function curve(n: number | null, [a, b, c, d]: Curve): number | null {
  if (!finite(n)) return null;
  return Math.max(
    0,
    Math.min(
      100,
      n < b
        ? (100 * (n - a)) / (b - a)
        : n <= c
          ? 100
          : (100 * (d - n)) / (d - c),
    ),
  );
}
function aggregate(
  days: EnvironmentalDay[],
  key: keyof Omit<EnvironmentalDay, "date">,
  sum = false,
): number | null {
  const values = days.map((d) => d[key]).filter(finite);
  // Totals require every day; means require >=80% coverage. No missing-to-zero.
  if (
    !days.length ||
    values.length < (sum ? days.length : Math.ceil(days.length * 0.8))
  )
    return null;
  const total = values.reduce((a, b) => a + b, 0);
  return sum ? total : total / values.length;
}
export function summarizeEnvironment(env: Environment) {
  const days = env.days;
  const rain = (n: number) => aggregate(days.slice(-n), "rain", true);
  let daysSinceRain: number | null = null;
  for (let i = days.length - 1; i >= 0; i--) {
    if (!finite(days[i].rain)) break;
    if (days[i].rain! >= significantRainMm) {
      daysSinceRain = days.length - i;
      break;
    }
    if (i === 0) daysSinceRain = 30; // lower bound, displayed as >=30
  }
  const recent = aggregate(days.slice(-3), "air"),
    previous = aggregate(days.slice(-6, -3), "air");
  const et0 = aggregate(days.slice(-3), "et0", true),
    rain3 = rain(3);
  const mins = days.slice(-7).map((d) => d.min),
    maxs = days.slice(-7).map((d) => d.max);
  return {
    rain7: rain(7),
    rain14: rain(14),
    rain21: rain(21),
    rain30: rain(30),
    air: aggregate(days.slice(-7), "air"),
    min: mins.every(finite) ? Math.min(...mins) : null,
    max: maxs.every(finite) ? Math.max(...maxs) : null,
    trend: recent !== null && previous !== null ? recent - previous : null,
    humidity: aggregate(days.slice(-3), "humidity"),
    soil: aggregate(days.slice(-3), "soil"),
    moisture: aggregate(days.slice(-3), "moisture"),
    et0,
    drying: et0 !== null && rain3 !== null ? Math.max(0, et0 - rain3) : null,
    postRain: daysSinceRain,
  };
}
export function classifyScore(score: number) {
  return score < 25
    ? "poor"
    : score < 45
      ? "low"
      : score < 65
        ? "fair"
        : score < 80
          ? "good"
          : "veryGood";
}
export function computeMycoScore(
  env: Environment,
  profile: keyof typeof speciesProfiles = "generic",
) {
  const metrics = summarizeEnvironment(env),
    ranges = speciesProfiles[profile];
  const factors = (Object.keys(weights) as Factor[]).map((id) => ({
    id,
    weight: weights[id],
    score: curve(metrics[id], ranges[id]),
  }));
  const available = factors.filter((f) => f.score !== null);
  const coverage = available.reduce((s, f) => s + f.weight, 0);
  // No score is preferable to a fabricated 0 when everything is missing.
  const score = coverage
    ? Math.round(
        available.reduce((s, f) => s + f.score! * f.weight, 0) / coverage,
      )
    : null;
  const reliability =
    coverage >= 85 ? "high" : coverage >= 55 ? "medium" : "low";
  // Include strongest limitation first, then strongest supporting factors.
  const negative = [...available]
    .filter((f) => f.score! < 45)
    .sort((a, b) => (100 - b.score!) * b.weight - (100 - a.score!) * a.weight);
  const positive = [...available]
    .filter((f) => f.score! >= 45)
    .sort((a, b) => b.score! * b.weight - a.score! * a.weight);
  const explanations = [...negative.slice(0, 2), ...positive].slice(0, 4);
  return {
    score,
    classification: score === null ? null : classifyScore(score),
    reliability,
    coverage,
    factors,
    explanations,
    metrics,
  };
}
