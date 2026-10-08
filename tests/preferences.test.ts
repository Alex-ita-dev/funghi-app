import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { emptyData, trackDistance } from "../src/lib/model";
import {
  readData,
  readSettings,
  writeData,
  writeSettings,
} from "../src/lib/storage";
import {
  countryPreset,
  countries,
  defaultSettings,
  detectCountry,
  detectLanguage,
  mergeSettings,
  needsOnboarding,
  species,
} from "../src/lib/preferences";
import { dictionaries } from "../src/locales";
import { translator } from "../src/lib/i18n";
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  feetToMetres,
  formatAltitude,
  formatDate,
  formatDistance,
  formatPrecipitation,
  formatTemperature,
  formatTime,
  formatWeight,
  inchesToMm,
  kgToLb,
  kmToMiles,
  lbToKg,
  metresToFeet,
  milesToKm,
  mmToInches,
} from "../src/lib/units";

const metric = defaultSettings(["it-IT"], false).preferences;
const imperial = { ...metric, ...countryPreset("US") };
async function record(
  key: string,
  value?: unknown,
  remove = false,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("mycotrail", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("data");
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("data", "readwrite");
      const store = tx.objectStore("data");
      const request = remove
        ? store.clear()
        : value === undefined
          ? store.get(key)
          : store.put(value, key);
      tx.oncomplete = () => {
        const result = request.result;
        db.close();
        resolve(result);
      };
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  });
}
beforeEach(async () => {
  await record("", undefined, true);
});

describe("canonical conversions and locale presentation", () => {
  it("converts km ↔ miles without changing source values", () => {
    expect(kmToMiles(1.609344)).toBeCloseTo(1);
    expect(milesToKm(kmToMiles(42))).toBeCloseTo(42);
  });
  it("converts metres ↔ feet including below sea level", () => {
    expect(metresToFeet(0.3048)).toBeCloseTo(1);
    expect(feetToMetres(metresToFeet(-12))).toBeCloseTo(-12);
  });
  it("converts Celsius ↔ Fahrenheit", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(fahrenheitToCelsius(212)).toBe(100);
    expect(fahrenheitToCelsius(celsiusToFahrenheit(-20))).toBeCloseTo(-20);
  });
  it("converts kilograms ↔ pounds", () => {
    expect(kgToLb(0.45359237)).toBeCloseTo(1);
    expect(lbToKg(kgToLb(3.7))).toBeCloseTo(3.7);
  });
  it("converts millimetres ↔ inches", () => {
    expect(mmToInches(25.4)).toBe(1);
    expect(inchesToMm(mmToInches(12))).toBeCloseTo(12);
  });
  it("formats thresholds, altitude, temperature, weight and rain centrally", () => {
    expect(formatDistance(245, metric)).toBe("245 m");
    expect(formatDistance(1420, metric)).toBe("1,42 km");
    expect(formatDistance(243.84, imperial)).toBe("800 ft");
    expect(formatDistance(1609.344, imperial)).toBe("1 mi");
    expect(formatAltitude(0, imperial)).toBe("0 ft");
    expect(formatTemperature(0, imperial)).toBe("32 °F");
    expect(formatWeight(0.028349523125, imperial)).toBe("1 oz");
    expect(formatWeight(1, metric)).toBe("1 kg");
    expect(formatPrecipitation(25.4, imperial)).toBe("1 in");
  });
  it("honours all explicit date formats and 12/24 hour cycles", () => {
    const stamp = new Date(2026, 9, 8, 17, 6).getTime();
    expect(formatDate(stamp, metric)).toBe("08/10/2026");
    expect(formatDate(stamp, imperial)).toBe("10/08/2026");
    expect(formatDate(stamp, { ...metric, dateFormat: "ISO" })).toBe(
      "2026-10-08",
    );
    expect(formatTime(stamp, metric)).toBe("17:06");
    expect(formatTime(stamp, imperial)).toMatch(/05:06.*PM/);
  });
});
describe("localization and country presets", () => {
  it("detects supported browser languages in order and falls back to English", () => {
    expect(detectLanguage(["zh-CN", "de-AT"])).toBe("de");
    expect(detectLanguage(["pt-BR"])).toBe("pt");
    expect(detectLanguage(["ja-JP"])).toBe("en");
    expect(detectLanguage([])).toBe("en");
    expect(translator("ja")("Impostazioni")).toBe("Settings");
    expect(detectCountry(["it-CH"])).toBe("CH");
    expect(detectCountry(["it"])).toBe("OTHER");
  });
  it("supplies complete country presets, with deliberate UK outdoor defaults", () => {
    for (const country of countries)
      expect(countryPreset(country).country).toBe(country);
    expect(countryPreset("IT")).toMatchObject({
      language: "it",
      temperatureUnit: "C",
      distanceUnit: "metric",
      dateFormat: "DMY",
      timeFormat: "24",
    });
    expect(countryPreset("US")).toMatchObject({
      language: "en",
      altitudeUnit: "ft",
      weightUnit: "imperial",
      dateFormat: "MDY",
      timeFormat: "12",
    });
    expect(countryPreset("GB")).toMatchObject({
      temperatureUnit: "C",
      distanceUnit: "imperial",
      altitudeUnit: "m",
    });
  });
  it("preserves manual overrides until another preset is explicitly selected", () => {
    let s = defaultSettings(["it-IT"], false);
    s = mergeSettings(s, { preferences: countryPreset("US") });
    s = mergeSettings(s, {
      preferences: { language: "de", altitudeUnit: "m" },
    });
    expect(s.preferences).toMatchObject({
      country: "US",
      language: "de",
      altitudeUnit: "m",
      temperatureUnit: "F",
    });
  });
  it("all six catalogs cover every message and interpolation parameter", () => {
    const keys = Object.keys(dictionaries.it).sort();
    for (const [locale, catalog] of Object.entries(dictionaries)) {
      expect(Object.keys(catalog).sort(), locale).toEqual(keys);
      for (const [key, value] of Object.entries(catalog)) {
        expect(value.trim().length, `${locale}: ${key}`).toBeGreaterThan(0);
        expect(
          value.match(/\{\{\w+\}\}/g)?.sort() ?? [],
          `${locale}: ${key}`,
        ).toEqual(key.match(/\{\{\w+\}\}/g)?.sort() ?? []);
      }
    }
    for (const s of species) expect(keys).toContain(s.name);
    expect(
      translator("en")("Passaggio {{step}} di {{total}}", {
        step: 2,
        total: 7,
      }),
    ).toBe("Step 2 of 7");
  });
});
describe("IndexedDB preferences migration and onboarding", () => {
  it("creates only preferences for a genuinely new installation", async () => {
    const s = await readSettings(["it-IT"]);
    expect(needsOnboarding(s)).toBe(true);
    expect(await record("main")).toBeUndefined();
  });
  it("does not block an existing empty legacy journal", async () => {
    const data = emptyData();
    await writeData(data);
    const s = await readSettings(["it-IT"]);
    expect(needsOnboarding(s)).toBe(false);
    expect(s.onboardingCompleted).toBe(false);
    expect(await record("main")).toEqual(data);
  });
  it("persists manual preferences and completed onboarding on reload", async () => {
    await readSettings(["it-IT"]);
    await writeSettings({
      preferences: { theme: "dark", language: "fr", distanceUnit: "imperial" },
      profile: { nickname: "Bosco", favouriteSpecies: ["future-species"] },
      onboardingCompleted: true,
    });
    const loaded = await readSettings(["de-DE"]);
    expect(loaded.preferences).toMatchObject({
      theme: "dark",
      language: "fr",
      distanceUnit: "imperial",
    });
    expect(loaded.profile.nickname).toBe("Bosco");
    expect(needsOnboarding(loaded)).toBe(false);
  });
  it("migration and reconfiguration never change the legacy journal or its SI points", async () => {
    const data = {
      ...emptyData(),
      car: { lat: 43, lng: 11, accuracy: 5, savedAt: 1 },
      finds: [
        {
          id: "keep",
          kind: "spot" as const,
          title: "Privato",
          notes: "originale",
          lat: 43,
          lng: 11,
          source: "map" as const,
          accuracy: null,
          createdAt: 1,
        },
      ],
      trips: [
        {
          id: "trip",
          name: "Originale",
          startedAt: 1,
          endedAt: 20001,
          status: "completed" as const,
          points: [
            { lat: 43, lng: 11, accuracy: 5, timestamp: 1, segment: 0 },
            { lat: 43, lng: 11.001, accuracy: 5, timestamp: 20001, segment: 0 },
          ],
          segment: 0,
          elapsedMs: 20000,
          resumedAt: null,
          car: null,
        },
      ],
    };
    await writeData(data);
    const original = JSON.stringify(await record("main"));
    await readSettings(["en-US"]);
    await writeSettings({
      preferences: countryPreset("US"),
      profile: { nickname: "new", searchMode: "both" },
      onboardingCompleted: true,
    });
    await writeSettings({
      profile: { nickname: "updated" },
      preferences: { theme: "dark" },
    });
    expect(JSON.stringify(await record("main"))).toBe(original);
    expect(await readData()).toEqual(data);
    const m = trackDistance(data.trips[0]);
    expect(formatDistance(m, metric)).not.toBe(formatDistance(m, imperial));
    expect(await record("main")).toEqual(data);
  });
  it("merges concurrent patches transactionally instead of losing unrelated fields", async () => {
    await readSettings(["it-IT"]);
    await Promise.all([
      writeSettings({ preferences: { language: "es" } }),
      writeSettings({ preferences: { theme: "dark" } }),
      writeSettings({ profile: { nickname: "A" } }),
    ]);
    expect((await readSettings([])).preferences).toMatchObject({
      language: "es",
      theme: "dark",
    });
    expect((await readSettings([])).profile.nickname).toBe("A");
  });
  it("rejects unknown or invalid preferences without overwriting either record", async () => {
    const main = emptyData();
    await writeData(main);
    await record("settings", { version: 99, private: "keep" });
    await expect(readSettings([])).rejects.toBeDefined();
    expect(await record("main")).toEqual(main);
    expect(await record("settings")).toEqual({ version: 99, private: "keep" });
  });
});
