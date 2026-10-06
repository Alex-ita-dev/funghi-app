import { describe, expect, it } from "vitest";
import { createMapLayers, resolveMapLayer } from "../src/lib/maps";
import {
  bearing,
  cardinal,
  coordinateText,
  movementHeading,
  normalizePosition,
  type LiveFix,
} from "../src/lib/location";
const fix = (extra: Partial<LiveFix> = {}): LiveFix => ({
  lat: 43.52,
  lng: 11.48,
  accuracy: 5,
  timestamp: 1700000000000,
  altitude: null,
  altitudeAccuracy: null,
  heading: null,
  speed: null,
  ...extra,
});
describe("outdoor map catalogue", () => {
  it("keeps public topo and street available without a paid-provider key", () => {
    const layers = createMapLayers();
    expect(layers.filter((l) => l.url).map((l) => l.id)).toEqual([
      "topo",
      "street",
    ]);
    expect(resolveMapLayer("satellite", layers).id).toBe("topo");
    expect(resolveMapLayer("corrupt", layers).id).toBe("topo");
    expect(resolveMapLayer("street", layers).id).toBe("street");
  });
  it("encodes the public key and provides attribution for every source", () => {
    const layers = createMapLayers(" key&value ");
    expect(layers.find((l) => l.id === "satellite")?.url).toContain(
      "key=key%26value",
    );
    expect(
      layers.every((l) => l.url && l.attribution && l.maxNativeZoom <= 19),
    ).toBe(true);
  });
});
describe("heading", () => {
  it("computes cardinal bearings", () => {
    const a = fix({ lat: 0, lng: 0 });
    for (const [lat, lng, angle] of [
      [1, 0, 0],
      [0, 1, 90],
      [-1, 0, 180],
      [0, -1, 270],
    ])
      expect(bearing(a, fix({ lat, lng }))).toBeCloseTo(angle);
    expect(cardinal(359)).toBe("N");
    expect(cardinal(-90)).toBe("O");
  });
  it("does not invent movement from jitter, a long gap or a jump", () => {
    const a = fix();
    expect(movementHeading(null, a)).toBeNull();
    expect(
      movementHeading(a, fix({ timestamp: a.timestamp + 10000 })),
    ).toBeNull();
    expect(
      movementHeading(a, fix({ lng: 11.481, timestamp: a.timestamp + 60000 })),
    ).toBeNull();
    expect(
      movementHeading(a, fix({ lng: 12, timestamp: a.timestamp + 1000 })),
    ).toBeNull();
    expect(
      movementHeading(a, fix({ lng: 11.4803, timestamp: a.timestamp + 20000 })),
    ).toBeCloseTo(90, 1);
  });
  it("uses hardware GPS course only while moving with adequate accuracy", () => {
    expect(movementHeading(null, fix({ heading: 123, speed: 1 }))).toBe(123);
    expect(movementHeading(null, fix({ heading: 123, speed: 0 }))).toBeNull();
    expect(
      movementHeading(null, fix({ heading: 123, speed: 1, accuracy: 100 })),
    ).toBeNull();
  });
});
describe("SOS fix metadata", () => {
  it("preserves zero altitude and heading and rejects nonfinite sensor values", () => {
    const p = {
      coords: {
        latitude: 43,
        longitude: 11,
        accuracy: 8,
        altitude: 0,
        altitudeAccuracy: NaN,
        heading: 0,
        speed: null,
      },
      timestamp: 1700000000000,
    } as GeolocationPosition;
    expect(normalizePosition(p)).toMatchObject({
      altitude: 0,
      altitudeAccuracy: null,
      heading: 0,
      speed: null,
    });
  });
  it("marks old and future fixes as not current in shared text", () => {
    const p = fix();
    expect(coordinateText(p, p.timestamp + 31000)).toContain("non attuale");
    expect(coordinateText(p, p.timestamp - 10000)).toContain("non attuale");
    expect(coordinateText(p, p.timestamp)).toContain("Latitudine: 43.520000");
    expect(coordinateText(p, p.timestamp)).toContain("non disponibile");
  });
});
