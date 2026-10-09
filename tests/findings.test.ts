import { beforeEach, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { emptyData, recoverData, type Find } from "../src/lib/model";
import {
  readData,
  writeData,
  readPhotoMeta,
  readPhotoBlob,
} from "../src/lib/storage";
import { exportBackup, parseBackup } from "../src/lib/backup";
import { spotHistory, filterFindings } from "../src/lib/findings";
import { type Photo } from "../src/lib/photos";
import { defaultSettings } from "../src/lib/preferences";
import { formatWeight, lbToKg, kgToLb } from "../src/lib/units";
const find: Find = {
  id: "one",
  kind: "find",
  title: "Porcini",
  notes: "Castagno",
  createdAt: 1000,
  lat: 43.5,
  lng: 11.4,
  source: "gps",
  accuracy: 8,
};
const jpeg = new Blob([new Uint8Array([255, 216, 255, 224, 0, 16, 255, 217])], {
  type: "image/jpeg",
});
const photo = (id = "photo", findingId = "one"): Photo => ({
  id,
  findingId,
  blob: jpeg,
  thumbnail: jpeg,
  mimeType: "image/jpeg",
  timestamp: 1000,
  originalSize: 8000000,
  width: 1920,
  height: 1080,
  primary: true,
  localOnly: true,
});
beforeEach(async () => {
  await writeData(emptyData(), { replaceAll: [] });
});
it("keeps old findings and creates a record without photos without changing coordinates or notes", async () => {
  const data = { ...emptyData(), finds: [find] };
  await writeData(data);
  expect(await readData()).toEqual(data);
  expect(recoverData(data).finds[0]).toEqual(find);
  expect(await readPhotoMeta()).toEqual([]);
});
it("saves photo blobs separately, updates details and retains unchanged images", async () => {
  const data = { ...emptyData(), finds: [find] };
  await writeData(data, { findingId: find.id, photos: [photo()] });
  expect((await readPhotoBlob("photo"))?.size).toBe(jpeg.size);
  expect((await readPhotoBlob("photo", true))?.size).toBe(jpeg.size);
  expect(JSON.stringify(await readData())).not.toContain("image/jpeg");
  const edited = {
    ...find,
    title: "Porcino",
    weightKg: 1.2,
    quantity: 4,
    habitats: ["chestnut" as const],
    altitudeM: 260,
  };
  await writeData(
    { ...data, finds: [edited] },
    { findingId: find.id, photos: await readPhotoMeta(find.id) },
  );
  expect((await readData()).finds[0]).toEqual(edited);
  expect((await readPhotoBlob("photo"))?.size).toBe(jpeg.size);
});
it("deletes a single photo and promotes a replacement, deletes all blobs with their finding", async () => {
  const data = { ...emptyData(), finds: [find] };
  await writeData(data, {
    findingId: "one",
    photos: [photo(), { ...photo("second"), primary: false }],
  });
  await writeData(data, {
    findingId: "one",
    photos: [
      {
        ...(await readPhotoMeta()).find((p) => p.id === "second")!,
        primary: true,
      },
    ],
  });
  expect(await readPhotoBlob("photo")).toBeUndefined();
  expect(await readPhotoBlob("photo", true)).toBeUndefined();
  expect(await readPhotoMeta()).toHaveLength(1);
  await writeData({ ...data, finds: [] });
  expect(await readPhotoMeta()).toEqual([]);
  expect(await readPhotoBlob("second")).toBeUndefined();
});
it("imports old backups and round trips a versioned photo backup including details", async () => {
  const data = {
    ...emptyData(),
    finds: [
      {
        ...find,
        quantity: 4,
        weightKg: 1.2,
        soil: "damp" as const,
        aspect: "SW" as const,
      },
    ],
  };
  expect(parseBackup(JSON.stringify(data))).toEqual({ data, photos: [] });
  await writeData(data, { findingId: "one", photos: [photo()] });
  const encoded = await exportBackup(data);
  expect(JSON.parse(encoded).version).toBe(2);
  const restored = parseBackup(encoded);
  await writeData(emptyData(), { replaceAll: [] });
  await writeData(restored.data, { replaceAll: restored.photos });
  expect(await readData()).toEqual(data);
  expect(
    new Uint8Array(await (await readPhotoBlob("photo"))!.arrayBuffer()),
  ).toEqual(new Uint8Array(await jpeg.arrayBuffer()));
  await writeData(parseBackup(JSON.stringify(emptyData())).data, {
    replaceAll: [],
  });
  expect(await readPhotoBlob("photo")).toBeUndefined();
});
it("rejects missing photo references atomically without changing the journal", async () => {
  const original = { ...emptyData(), finds: [find] };
  await writeData(original, { findingId: "one", photos: [photo()] });
  const { blob, thumbnail, ...missing } = photo("missing");
  await expect(
    writeData(
      { ...original, finds: [{ ...find, title: "Changed" }] },
      { findingId: "one", photos: [missing] },
    ),
  ).rejects.toThrow();
  expect(await readData()).toEqual(original);
  expect(await readPhotoMeta()).toHaveLength(1);
});
it("rejects malformed backups, dangling photos and duplicate primary photos before restore", async () => {
  const data = { ...emptyData(), finds: [find] };
  await writeData(data, { findingId: "one", photos: [photo()] });
  const raw = JSON.parse(await exportBackup(data));
  raw.photos[0].findingId = "missing";
  expect(() => parseBackup(JSON.stringify(raw))).toThrow();
  raw.photos[0].findingId = "one";
  raw.photos.push({ ...raw.photos[0], id: "two" });
  expect(() => parseBackup(JSON.stringify(raw))).toThrow();
  raw.photos = [];
  raw.data.finds[0].spotId = "missing";
  expect(() => parseBackup(JSON.stringify(raw))).toThrow();
});
it("provides chronological spot history, totals and combined notebook filters", () => {
  const spot = { ...find, id: "spot", kind: "spot" as const };
  const rows = [
    spot,
    {
      ...find,
      spotId: "spot",
      weightKg: 1.2,
      quantity: 4,
      habitats: ["chestnut" as const],
    },
    { ...find, id: "two", createdAt: 2000, spotId: "spot", weightKg: 0.3 },
  ];
  expect(spotHistory(rows, "spot")).toMatchObject({
    count: 2,
    weightKg: 1.5,
    last: 2000,
  });
  expect(spotHistory(rows, "spot").entries.map((f) => f.id)).toEqual([
    "two",
    "one",
  ]);
  expect(
    filterFindings(
      rows,
      {
        query: "porc",
        kind: "find",
        from: "",
        to: "",
        withPhotos: true,
        habitat: "chestnut",
      },
      new Set(["one"]),
    ),
  ).toHaveLength(1);
});
it("converts canonical kg to metric and imperial without changing stored weight", () => {
  const prefs = defaultSettings(["en"], true).preferences;
  expect(formatWeight(0.1, { ...prefs, weightUnit: "metric" })).toBe("100 g");
  expect(formatWeight(0.1, { ...prefs, weightUnit: "imperial" })).toContain(
    "oz",
  );
  expect(formatWeight(1.2, { ...prefs, weightUnit: "imperial" })).toContain(
    "lb",
  );
  expect(lbToKg(kgToLb(1.2))).toBeCloseTo(1.2, 10);
});
