import { describe, expect, it } from "vitest";
import {
  addFix,
  dataSchema,
  distance,
  duration,
  emptyData,
  pauseTrip,
  recoverData,
  resumeTrip,
  segments,
  toGpx,
  trackDistance,
  usableFix,
  type Fix,
  type Trip,
} from "../src/lib/model";
const time = 1700000000000;
const fix = (offset = 0, extra = {}): Fix => ({
  lat: 43.52,
  lng: 11.48 + offset,
  accuracy: 5,
  timestamp: time,
  ...extra,
});
const trip = (): Trip => ({
  id: "test",
  name: "Castagni & sentieri <autunno>",
  startedAt: time,
  endedAt: null,
  status: "active",
  points: [],
  segment: 0,
  elapsedMs: 0,
  resumedAt: time,
  car: null,
});
describe("recording and navigation", () => {
  it("computes distance including at the antimeridian", () => {
    expect(distance({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(
      111194.9266,
      2,
    );
    expect(
      distance({ lat: 0, lng: 179.999 }, { lat: 0, lng: -179.999 }),
    ).toBeLessThan(225);
  });
  it("rejects inaccurate, stale and future positions", () => {
    expect(usableFix(fix(), time)).toBe(true);
    for (const f of [
      fix(0, { accuracy: 51 }),
      fix(0, { timestamp: time - 31000 }),
      fix(0, { timestamp: time + 6000 }),
    ])
      expect(addFix(trip(), f, time).points).toHaveLength(0);
  });
  it("filters jitter, duplicate timestamps and implausible jumps", () => {
    const start = addFix(trip(), fix(), time);
    expect(
      addFix(start, fix(0.00001, { timestamp: time + 10000 }), time + 10000),
    ).toBe(start);
    expect(addFix(start, fix(0.001), time)).toBe(start);
    expect(
      addFix(start, fix(0.1, { timestamp: time + 1000 }), time + 1000),
    ).toBe(start);
    expect(
      addFix(start, fix(0.0002, { timestamp: time + 10000 }), time + 10000)
        .points,
    ).toHaveLength(2);
  });
  it("does not invent straight lines or distance across GPS gaps", () => {
    let t = addFix(trip(), fix(), time);
    t = addFix(t, fix(0.0003, { timestamp: time + 10000 }), time + 10000);
    const before = trackDistance(t);
    t = addFix(t, fix(0.01, { timestamp: time + 70000 }), time + 70000);
    expect(segments(t.points)).toHaveLength(2);
    expect(trackDistance(t)).toBe(before);
  });
  it("pauses time, skips fixes while paused, resumes a new segment", () => {
    const initial = addFix(trip(), fix(), time);
    const paused = pauseTrip(initial, time + 20000);
    expect(duration(paused, time + 50000)).toBe(20000);
    expect(addFix(paused, fix(0.01), time)).toBe(paused);
    const resumed = addFix(
      resumeTrip(paused, time + 60000),
      fix(0.01, { timestamp: time + 60000 }),
      time + 60000,
    );
    expect(duration(resumed, time + 65000)).toBe(25000);
    expect(trackDistance(resumed)).toBe(0);
    expect(segments(resumed.points)).toHaveLength(2);
  });
  it("recovers an active outing paused at the last saved checkpoint", () => {
    const data = { ...emptyData(), savedAt: time + 15000, trips: [trip()] };
    const recovered = recoverData(data);
    expect(recovered.trips[0].status).toBe("paused");
    expect(recovered.trips[0].elapsedMs).toBe(15000);
    expect(recovered.trips[0].resumedAt).toBeNull();
  });
  it("exports valid escaped GPX with separate segments", () => {
    const t = {
      ...trip(),
      points: [
        { ...fix(), segment: 0 },
        { ...fix(0.01, { timestamp: time + 70000 }), segment: 1 },
      ],
      segment: 1,
    };
    const gpx = toGpx(t);
    expect(gpx).toContain("Castagni &amp; sentieri &lt;autunno&gt;");
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx).toContain("2023-11-14T22:13:20.000Z");
  });
});
describe("backup validation", () => {
  it("rejects wrong versions, invalid coordinates and duplicate open outings", () => {
    expect(dataSchema.safeParse({ ...emptyData(), version: 2 }).success).toBe(
      false,
    );
    expect(
      dataSchema.safeParse({
        ...emptyData(),
        car: { lat: 91, lng: 0, savedAt: 0, accuracy: null },
      }).success,
    ).toBe(false);
    expect(
      dataSchema.safeParse({
        ...emptyData(),
        trips: [trip(), { ...trip(), id: "second" }],
      }).success,
    ).toBe(false);
  });
  it("rejects reversed timestamps, segments and inconsistent state", () => {
    const invalid = {
      ...trip(),
      points: [
        { ...fix(), segment: 1 },
        { ...fix(0.01, { timestamp: time - 10 }), segment: 0 },
      ],
      segment: 1,
    };
    expect(
      dataSchema.safeParse({ ...emptyData(), trips: [invalid] }).success,
    ).toBe(false);
    expect(
      dataSchema.safeParse({
        ...emptyData(),
        trips: [{ ...trip(), status: "paused" }],
      }).success,
    ).toBe(false);
  });
});
