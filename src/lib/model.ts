import { z } from "zod";
import { habitats, soils, aspects } from "./findings";

export const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
const time = z.number().int().nonnegative().max(8640000000000000);
export const fixSchema = coordinateSchema.extend({
  accuracy: z.number().nonnegative().max(100000),
  timestamp: time,
});
const carSchema = coordinateSchema.extend({
  savedAt: time,
  accuracy: z.number().nonnegative().nullable(),
});
const pointSchema = fixSchema.extend({
  segment: z.number().int().nonnegative(),
});
export const findSchema = coordinateSchema.extend({
  id: z.string().min(1).max(100),
  kind: z.enum(["find", "spot"]),
  title: z.string().min(1).max(80),
  notes: z.string().max(1000),
  createdAt: time,
  quantity: z.number().int().nonnegative().max(1000000).optional(),
  weightKg: z.number().nonnegative().max(100000).optional(),
  habitats: z.array(z.enum(habitats)).max(8).optional(),
  soil: z.enum(soils).optional(),
  aspect: z.enum(aspects).optional(),
  altitudeM: z.number().min(-12000).max(100000).optional(),
  spotId: z.string().min(1).max(100).optional(),
  source: z.enum(["gps", "map"]),
  accuracy: z.number().nonnegative().nullable(),
});
const tripSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  startedAt: time,
  endedAt: time.nullable(),
  status: z.enum(["active", "paused", "completed"]),
  points: z.array(pointSchema).max(100000),
  segment: z.number().int().nonnegative(),
  elapsedMs: z.number().nonnegative(),
  resumedAt: time.nullable(),
  car: carSchema.nullable(),
});
export const dataSchema = z
  .object({
    version: z.literal(1),
    savedAt: time,
    car: carSchema.nullable(),
    finds: z.array(findSchema).max(10000),
    trips: z.array(tripSchema).max(500),
  })
  .superRefine((data, ctx) => {
    if (data.trips.filter((t) => t.status !== "completed").length > 1)
      ctx.addIssue({ code: "custom", message: "Più uscite aperte" });
    for (const rows of [data.trips, data.finds])
      if (new Set(rows.map((x) => x.id)).size !== rows.length)
        ctx.addIssue({ code: "custom", message: "ID duplicati" });
    for (const f of data.finds) {
      if (
        f.spotId &&
        (f.kind !== "find" ||
          !data.finds.some((s) => s.id === f.spotId && s.kind === "spot"))
      )
        ctx.addIssue({
          code: "custom",
          message: "Fungaia associata non valida",
        });
    }
    for (const trip of data.trips) {
      if ((trip.status === "active") !== (trip.resumedAt !== null))
        ctx.addIssue({ code: "custom", message: "Stato uscita incoerente" });
      if (
        trip.points.some(
          (p, i) =>
            p.segment > trip.segment ||
            (i > 0 &&
              (p.timestamp <= trip.points[i - 1].timestamp ||
                p.segment < trip.points[i - 1].segment)),
        )
      )
        ctx.addIssue({ code: "custom", message: "Ordine traccia non valido" });
    }
  });
export type Coordinate = z.infer<typeof coordinateSchema>;
export type Fix = z.infer<typeof fixSchema>;
export type Car = z.infer<typeof carSchema>;
export type Find = z.infer<typeof findSchema>;
export type TrackPoint = z.infer<typeof pointSchema>;
export type Trip = z.infer<typeof tripSchema>;
export type AppData = z.infer<typeof dataSchema>;
export const emptyData = (): AppData => ({
  version: 1,
  savedAt: Date.now(),
  car: null,
  finds: [],
  trips: [],
});
export const openTrip = (data: AppData) =>
  data.trips.find((t) => t.status !== "completed");

export function distance(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function segments(points: TrackPoint[]): TrackPoint[][] {
  const result: TrackPoint[][] = [];
  for (const point of points) {
    if (
      !result.length ||
      result[result.length - 1][0].segment !== point.segment
    )
      result.push([]);
    result[result.length - 1].push(point);
  }
  return result;
}
export function trackDistance(trip: Trip): number {
  return trip.points.reduce(
    (sum, point, i, points) =>
      sum +
      (i && point.segment === points[i - 1].segment
        ? distance(points[i - 1], point)
        : 0),
    0,
  );
}
export function duration(trip: Trip, now = Date.now()): number {
  return (
    trip.elapsedMs +
    (trip.resumedAt === null ? 0 : Math.max(0, now - trip.resumedAt))
  );
}
export function usableFix(fix: Fix | null, now = Date.now()): boolean {
  return (
    !!fix &&
    fix.accuracy <= 50 &&
    now - fix.timestamp <= 30000 &&
    fix.timestamp <= now + 5000
  );
}
export function addFix(trip: Trip, fix: Fix, now = Date.now()): Trip {
  if (
    trip.status !== "active" ||
    !usableFix(fix, now) ||
    trip.points.length >= 100000
  )
    return trip;
  const previous = trip.points.at(-1);
  if (previous && fix.timestamp <= previous.timestamp) return trip;
  let segment = trip.segment;
  if (previous && segment === previous.segment) {
    const dt = (fix.timestamp - previous.timestamp) / 1000;
    const metres = distance(previous, fix);
    if (dt > 45)
      segment += 1; // Never draw an invented connection across a GPS gap.
    else {
      if (metres / dt > 12) return trip; // Discard a large GPS jump for a walking app.
      if (metres < Math.max(5, Math.min(15, fix.accuracy * 0.35))) return trip;
    }
  }
  return { ...trip, segment, points: [...trip.points, { ...fix, segment }] };
}
export function pauseTrip(trip: Trip, now = Date.now()): Trip {
  return trip.status !== "active"
    ? trip
    : {
        ...trip,
        status: "paused",
        elapsedMs: duration(trip, now),
        resumedAt: null,
      };
}
export function resumeTrip(trip: Trip, now = Date.now()): Trip {
  return trip.status !== "paused"
    ? trip
    : { ...trip, status: "active", resumedAt: now, segment: trip.segment + 1 };
}
export function recoverData(raw: unknown): AppData {
  const data = dataSchema.parse(raw);
  return { ...data, trips: data.trips.map((t) => pauseTrip(t, data.savedAt)) };
}
export function metres(value: number): string {
  return value < 1000
    ? `${Math.round(value)} m`
    : `${(value / 1000).toLocaleString("it-IT", { maximumFractionDigits: 2 })} km`;
}
export function clock(ms: number): string {
  const min = Math.floor(ms / 60000);
  return `${Math.floor(min / 60)
    .toString()
    .padStart(2, "0")}:${(min % 60).toString().padStart(2, "0")}`;
}
export const dateLabel = (t: number) =>
  new Date(t).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export function toGpx(trip: Trip): string {
  const escape = (s: string) =>
    s.replace(
      /[<>&"']/g,
      (c) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;",
          "'": "&apos;",
        })[c]!,
    );
  const car = trip.car
    ? `<wpt lat="${trip.car.lat}" lon="${trip.car.lng}"><name>Auto</name></wpt>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="MycoTrail" xmlns="http://www.topografix.com/GPX/1/1">${car}<trk><name>${escape(trip.name)}</name>${segments(
    trip.points,
  )
    .map(
      (s) =>
        `<trkseg>${s.map((p) => `<trkpt lat="${p.lat}" lon="${p.lng}"><time>${new Date(p.timestamp).toISOString()}</time></trkpt>`).join("")}</trkseg>`,
    )
    .join("")}</trk></gpx>`;
}
