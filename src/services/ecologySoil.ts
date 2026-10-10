import type { Coordinate } from "../lib/model";
import type { SoilProperties } from "../lib/ecologyModel";
// SoilGrids REST is paused by ISRIC. Do not send doomed calls on every tap.
// A future provider may supply independently validated canonical properties.
export interface SoilProvider {
  id: string;
  load(point: Coordinate, signal: AbortSignal): Promise<SoilProperties | null>;
}
export const optionalSoilProvider: SoilProvider = {
  id: "unavailable",
  async load(_point, signal) {
    signal.throwIfAborted();
    return null;
  },
};
