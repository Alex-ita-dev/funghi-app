import type { Coordinate } from "./model";
export const areaConfig = {
  minZoom: 13,
  fineZoom: 15,
  coarseSide: 6,
  fineSide: 8,
  coarseWidthM: 3000,
  fineWidthM: 2000,
  maxCells: 100,
  closeZoom: 17,
  closeSide: 10,
  closeWidthM: 1000,
  heatmapConcurrency: 4,
  weatherBatch: 9,
  landBatch: 8,
  terrainSpacingM: 100,
  elevationBatch: 100,
  concurrency: 2,
} as const;
export type Viewport = Coordinate & { zoom: number };
export type AreaCell = {
  id: string;
  point: Coordinate;
  bounds: [[number, number], [number, number]];
  anchor: Coordinate;
};
export type AreaGrid = { key: string; cells: AreaCell[]; widthM: number };
export function offset(p: Coordinate, east: number, north: number): Coordinate {
  return {
    lat: p.lat + north / 111320,
    lng: p.lng + east / (111320 * Math.cos((p.lat * Math.PI) / 180)),
  };
}
export function createGrid(view: Viewport): AreaGrid | null {
  if (
    ![view.lat, view.lng, view.zoom].every(Number.isFinite) ||
    Math.abs(view.lat) > 80 ||
    Math.abs(view.lng) > 179.9 ||
    view.zoom < areaConfig.minZoom
  )
    return null;
  const fine = view.zoom >= areaConfig.fineZoom;
  const close = view.zoom >= areaConfig.closeZoom;
  const side = close
    ? areaConfig.closeSide
    : fine
      ? areaConfig.fineSide
      : areaConfig.coarseSide;
  const widthM = close
    ? areaConfig.closeWidthM
    : fine
      ? areaConfig.fineWidthM
      : areaConfig.coarseWidthM;
  const center = {
    lat: Math.round(view.lat * 500) / 500,
    lng: Math.round(view.lng * 500) / 500,
  };
  const step = widthM / side;
  const cells: AreaCell[] = [];
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const east = (x + 0.5 - side / 2) * step,
        north = (y + 0.5 - side / 2) * step;
      const point = offset(center, east, north);
      const sw = offset(center, east - step / 2, north - step / 2),
        ne = offset(center, east + step / 2, north + step / 2);
      // Weather uses the SAME spatial key as point analysis.
      const anchor = point;
      cells.push({
        id: `${x}:${y}`,
        point,
        bounds: [
          [sw.lat, sw.lng],
          [ne.lat, ne.lng],
        ],
        anchor,
      });
    }
  return {
    key: `${center.lat.toFixed(3)},${center.lng.toFixed(3)}:${side}:${widthM}`,
    cells,
    widthM,
  };
}
export const scoreColors = [
  "#a64052",
  "#c5763a",
  "#c5b542",
  "#67a556",
  "#277b68",
];
export function scoreColor(score: number | null) {
  return score === null
    ? "#838b94"
    : scoreColors[
        score < 25 ? 0 : score < 45 ? 1 : score < 65 ? 2 : score < 80 ? 3 : 4
      ];
}

export function gridBounds(
  grid: AreaGrid,
): [[number, number], [number, number]] {
  return [grid.cells[0].bounds[0], grid.cells[grid.cells.length - 1].bounds[1]];
}
export function cellStyle(
  cell: { score: number | null; status: string; confidence: number },
  opacity: number,
) {
  const excluded = cell.status === "unsuitable",
    missing = cell.status === "insufficientData";
  const color = excluded
    ? "#475569"
    : missing
      ? "#64748b"
      : scoreColor(cell.score);
  return {
    color,
    fillColor: color,
    weight: excluded || missing ? 2 : 1,
    dashArray: excluded ? "7 4" : missing ? "2 5" : undefined,
    opacity: 0.85,
    fillOpacity: missing
      ? opacity * 0.2
      : opacity * (0.5 + cell.confidence / 200),
  };
}
