import { z } from "zod";
import { speciesProfiles, type SpeciesProfile, type Curve } from "./mycoScore";
export const ecologyVersion = "mycoscore-2.1.0";
export const covers = [
  "water",
  "trees",
  "shrubland",
  "grassland",
  "rangeland",
  "cropland",
  "built",
  "bare",
  "snowIce",
  "wetland",
  "mossLichen",
  "unknown",
] as const;
export type LandClass = (typeof covers)[number];
export const landSchema = z.object({
  category: z.enum(covers),
  neighbors: z.array(z.enum(covers)).max(9),
  provider: z.enum(["io-esri-2025", "marine-goas-2021", "unavailable"]),
  year: z.number().int().nullable(),
  resolutionM: z.number().positive().nullable(),
  fetchedAt: z.number().finite(),
  cached: z.boolean(),
});
export type LandCover = z.infer<typeof landSchema>;
export const soilSchema = z.object({
  ph: z.number().min(0).max(14).nullable(),
  organicCarbon: z.number().nonnegative().nullable(),
  sandPercent: z.number().min(0).max(100).nullable(),
  clayPercent: z.number().min(0).max(100).nullable(),
  siltPercent: z.number().min(0).max(100).nullable(),
  fetchedAt: z.number().finite(),
  provider: z.string(),
});
export type SoilProperties = z.infer<typeof soilSchema>;
export type EcologyProfileId = "generic" | "porcini" | "chanterelles";
export type EcologyProfile = {
  weather: SpeciesProfile;
  habitat: Partial<Record<LandClass, number>>;
  hardExclusions: LandClass[];
  forestSymbiont: boolean;
  hostGroups: readonly string[];
  latitude: readonly [number, number];
  geographicScope: "broad" | "temperateGroups";
  season: { floor: number; width: number; springStrength: number };
  thermal: { soilWeight: number; airWeight: number; limitFloor: number };
  moisture: { soilWeight: number; rainWeight: number; limitFloor: number };
  drying: { vpd: Curve; wind: Curve; amplitude: number };
  terrain: { aspectAmplitude: number; slopeStart: number };
  soilPH: Curve | null;
  weights: {
    moisture: number;
    temperature: number;
    drying: number;
    season: number;
    terrain: number;
    soil: number;
  };
};
const common = {
  hardExclusions: ["water", "snowIce", "bare", "built"] as LandClass[],
  latitude: [25, 65] as const,
  geographicScope: "temperateGroups" as const,
  forestSymbiont: true,
  hostGroups: ["Fagaceae", "Pinaceae", "Betulaceae"],
  terrain: { aspectAmplitude: 12, slopeStart: 15 },
  soilPH: null,
  weights: {
    moisture: 35,
    temperature: 30,
    drying: 15,
    season: 10,
    terrain: 7,
    soil: 3,
  },
};
export const ecologyProfiles: Record<EcologyProfileId, EcologyProfile> = {
  generic: {
    ...common,
    weather: speciesProfiles.generic,
    habitat: {
      trees: 100,
      grassland: 90,
      shrubland: 85,
      rangeland: 85,
      cropland: 60,
      wetland: 65,
      mossLichen: 45,
    },
    forestSymbiont: false,
    hostGroups: [],
    latitude: [0, 70],
    geographicScope: "broad",
    season: { floor: 55, width: 2.7, springStrength: 0.95 },
    thermal: { soilWeight: 0.7, airWeight: 0.3, limitFloor: 25 },
    moisture: { soilWeight: 0.7, rainWeight: 0.3, limitFloor: 25 },
    drying: { vpd: [-1, 0, 0.8, 3], wind: [-1, 0, 15, 55], amplitude: 1 },
  },
  porcini: {
    ...common,
    weather: speciesProfiles.porcini,
    habitat: {
      trees: 100,
      shrubland: 40,
      rangeland: 25,
      grassland: 20,
      cropland: 10,
      wetland: 25,
      mossLichen: 15,
    },
    season: { floor: 25, width: 1.7, springStrength: 0.8 },
    thermal: { soilWeight: 0.8, airWeight: 0.2, limitFloor: 15 },
    moisture: { soilWeight: 0.8, rainWeight: 0.2, limitFloor: 15 },
    drying: { vpd: [-1, 0, 0.7, 2.5], wind: [-1, 0, 12, 45], amplitude: 1.1 },
  },
  chanterelles: {
    ...common,
    weather: {
      air: [2, 12, 20, 30],
      soil: [2, 10, 18, 26],
      moisture: [0.12, 0.27, 0.4, 0.55],
      rain14: [0, 30, 90, 180],
      postRain: [0, 4, 14, 28],
      drying: [-30, -15, 0, 12],
      humidity: [40, 75, 100, 101],
    },
    habitat: {
      trees: 100,
      shrubland: 25,
      rangeland: 15,
      grassland: 10,
      cropland: 5,
      wetland: 35,
      mossLichen: 20,
    },
    season: { floor: 30, width: 2.2, springStrength: 0.55 },
    thermal: { soilWeight: 0.85, airWeight: 0.15, limitFloor: 10 },
    moisture: { soilWeight: 0.85, rainWeight: 0.15, limitFloor: 10 },
    drying: { vpd: [-1, 0, 0.6, 2.2], wind: [-1, 0, 10, 40], amplitude: 1.2 },
    soilPH: [3, 4.5, 6.5, 8],
  },
};
export const unknownLand = (now = Date.now()): LandCover => ({
  category: "unknown",
  neighbors: [],
  provider: "unavailable",
  year: null,
  resolutionM: null,
  fetchedAt: now,
  cached: false,
});
