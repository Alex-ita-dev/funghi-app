import { finite } from "./mycoScore";
import { offset, areaConfig } from "./mycoArea";
import type { Coordinate } from "./model";
export type Terrain = {
  elevationM: number | null;
  slopeDegrees: number | null;
  aspectDegrees: number | null;
};
export const emptyTerrain: Terrain = {
  elevationM: null,
  slopeDegrees: null,
  aspectDegrees: null,
};
export const validElevation = (v: unknown): v is number =>
  finite(v) && v >= -500 && v <= 9000;
export function terrainStencil(p: Coordinate) {
  return [1, 0, -1].flatMap((y) =>
    [-1, 0, 1].map((x) =>
      offset(p, x * areaConfig.terrainSpacingM, y * areaConfig.terrainSpacingM),
    ),
  );
}
// Horn 3x3 gradient. Rows run north -> south; aspect is downhill, clockwise from north.
export function deriveTerrain(
  samples: (number | null)[],
  spacing = areaConfig.terrainSpacingM,
): Terrain {
  const elevationM = validElevation(samples[4]) ? samples[4] : null;
  if (
    samples.length !== 9 ||
    !samples.every(validElevation) ||
    !finite(spacing) ||
    spacing <= 0
  )
    return { ...emptyTerrain, elevationM };
  const z = samples as number[];
  const east =
    (z[2] + 2 * z[5] + z[8] - z[0] - 2 * z[3] - z[6]) / (8 * spacing);
  const north =
    (z[0] + 2 * z[1] + z[2] - z[6] - 2 * z[7] - z[8]) / (8 * spacing);
  const slopeDegrees = (Math.atan(Math.hypot(east, north)) * 180) / Math.PI;
  if (slopeDegrees > 80) return { ...emptyTerrain, elevationM };
  const aspectDegrees =
    slopeDegrees < 2
      ? null
      : ((Math.atan2(-east, -north) * 180) / Math.PI + 360) % 360;
  return { elevationM, slopeDegrees, aspectDegrees };
}
export function aspectDirection(degrees: number) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
    Math.round((((degrees % 360) + 360) % 360) / 45) % 8
  ];
}
