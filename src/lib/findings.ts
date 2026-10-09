import type { Find } from "./model";
export const habitats = [
  "chestnut",
  "oak",
  "beech",
  "conifers",
  "birch",
  "meadow",
  "scrub",
  "other",
] as const;
export const habitatLabels: Record<(typeof habitats)[number], string> = {
  chestnut: "Castagno",
  oak: "Quercia",
  beech: "Faggio",
  conifers: "Conifere",
  birch: "Betulla",
  meadow: "Prato",
  scrub: "Macchia",
  other: "Altro",
};
export const soils = ["dry", "slightly-damp", "damp", "very-damp"] as const;
export const soilLabels = {
  dry: "Asciutto",
  "slightly-damp": "Leggermente umido",
  damp: "Umido",
  "very-damp": "Molto umido",
};
export const aspects = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export function spotHistory(finds: Find[], id: string) {
  const entries = finds
    .filter((f) => f.kind === "find" && f.spotId === id)
    .sort((a, b) => b.createdAt - a.createdAt);
  return {
    entries,
    count: entries.length,
    weightKg: entries.reduce((sum, f) => sum + (f.weightKg ?? 0), 0),
    hasWeight: entries.some((f) => f.weightKg !== undefined),
    last: entries[0]?.createdAt,
  };
}
export type FindingFilters = {
  query: string;
  kind: "all" | "find" | "spot";
  from: string;
  to: string;
  withPhotos: boolean;
  habitat: string;
};
export function filterFindings(
  finds: Find[],
  filters: FindingFilters,
  photoIds: Set<string>,
) {
  return finds
    .filter(
      (f) =>
        (filters.kind === "all" || f.kind === filters.kind) &&
        `${f.title} ${f.notes}`
          .toLocaleLowerCase()
          .includes(filters.query.toLocaleLowerCase()) &&
        (!filters.from ||
          f.createdAt >= new Date(`${filters.from}T00:00:00`).getTime()) &&
        (!filters.to ||
          f.createdAt < new Date(`${filters.to}T23:59:59.999`).getTime() + 1) &&
        (!filters.withPhotos || photoIds.has(f.id)) &&
        (!filters.habitat ||
          f.habitats?.includes(filters.habitat as (typeof habitats)[number])),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}
