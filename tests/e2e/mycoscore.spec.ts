import { test, expect, type Page } from "@playwright/test";
import { seedLegacy, readRecord } from "./fixtures";
test.use({ serviceWorkers: "block" });
function weather() {
  const today = Math.floor(Date.now() / 86400000) * 86400000;
  const dates = Array.from({ length: 30 }, (_, i) =>
    new Date(today - (30 - i) * 86400000).toISOString().slice(0, 10),
  );
  return {
    elevation: 612,
    daily: {
      time: dates,
      rain_sum: dates.map((_, i) => (i === 25 ? 10 : 3)),
      showers_sum: dates.map(() => 0),
      temperature_2m_mean: dates.map(() => 17),
      temperature_2m_min: dates.map(() => 12),
      temperature_2m_max: dates.map(() => 22),
      et0_fao_evapotranspiration: dates.map(() => 2),
    },
    hourly: {
      time: dates.flatMap((d) =>
        Array.from(
          { length: 24 },
          (_, h) => `${d}T${String(h).padStart(2, "0")}:00`,
        ),
      ),
      relative_humidity_2m: Array(720).fill(80),
      soil_temperature_6cm: Array(720).fill(16),
      soil_moisture_3_to_9cm: Array(720).fill(0.3),
    },
  };
}
async function openPoint(page: Page) {
  await page.getByRole("button", { name: "MycoScore", exact: true }).click();
  await page
    .getByLabel("Mappa interattiva")
    .click({ position: { x: 130, y: 160 } });
  return page.getByRole("dialog", { name: "MycoScore", exact: true });
}
test("point score, explanation, units, cached reload and GPS journal isolation", async ({
  page,
}, testInfo) => {
  await seedLegacy(page);
  // A fixed geographic cell, rather than an incidental low-zoom screen pixel.
  // WebKit may restore a different scroll/viewport offset after modal focus.
  await page.evaluate(() =>
    localStorage.setItem(
      "mycotrail.map-viewport.v1",
      JSON.stringify({ lat: 43.52, lng: 11.48, zoom: 16 }),
    ),
  );
  let calls = 0;
  await page.route("https://api.open-meteo.com/**", (route) => {
    calls++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get("latitude")).toBe("43.52");
    expect(url.searchParams.get("longitude")).toBe("11.48");
    return route.fulfill({ json: weather() });
  });
  await page.goto("/");
  const before = await readRecord(page, "main");
  const dialog = await openPoint(page);
  await expect(dialog.getByTestId("myco-score")).toContainText(/\d+ \/ 100/);
  await expect(
    dialog.getByText("Perché questo punteggio?", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("612 m", { exact: true })).toBeVisible();
  await expect(dialog.getByText("0,3 m³/m³", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mycoscore-light.png") });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({ path: testInfo.outputPath("mycoscore-dark.png") });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await dialog.getByLabel("Profilo sperimentale").selectOption("porcini");
  expect(calls).toBe(1);
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  await page
    .getByRole("button", { name: "Esci da MycoScore", exact: true })
    .click();
  expect(await readRecord(page, "main")).toEqual(before);
  await page.reload();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    }),
  );
  const cached = await openPoint(page);
  await expect(cached.getByText(/Dati memorizzati:/)).toBeVisible();
  await expect(cached.getByTestId("myco-score")).toContainText(/\d+ \/ 100/);
  expect(calls).toBe(1);
  await cached.getByRole("button", { name: "Chiudi", exact: true }).click();
  expect(await readRecord(page, "main")).toEqual(before);
  // Set presentation preferences only, preserving the journal.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("mycotrail");
        r.onsuccess = () => {
          const db = r.result,
            t = db.transaction("data", "readwrite"),
            s = t.objectStore("data"),
            p = s.get("settings");
          p.onsuccess = () =>
            s.put(
              {
                ...p.result,
                preferences: {
                  ...p.result.preferences,
                  language: "en",
                  temperatureUnit: "F",
                  precipitationUnit: "in",
                  altitudeUnit: "ft",
                },
              },
              "settings",
            );
          t.oncomplete = () => {
            db.close();
            resolve();
          };
          t.onabort = () => reject(t.error);
        };
      }),
  );
  await page.reload();
  await page.getByRole("button", { name: "MycoScore", exact: true }).click();
  await page
    .getByLabel("Interactive map")
    .click({ position: { x: 130, y: 160 } });
  await expect(
    page.getByRole("dialog").getByText("60.8 °F", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByText(/ft$/)).toBeVisible();
  expect(calls).toBe(1);
});
test("offline without cache stays recoverable and does not modify existing data", async ({
  page,
}) => {
  await seedLegacy(page);
  await page.goto("/");
  const before = await readRecord(page, "main");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    }),
  );
  const dialog = await openPoint(page);
  await expect(dialog.getByRole("alert")).toContainText(
    "richiede una connessione",
  );
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  // Switching from finding selection back to MycoScore must activate it.
  await page.getByRole("button", { name: "Segna un punto" }).click();
  await page.getByRole("button", { name: "Scegli sulla mappa" }).click();
  await page.getByRole("button", { name: "MycoScore", exact: true }).click();
  await page
    .getByRole("button", { name: "Esci da MycoScore", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Centra sulla mia posizione" }),
  ).toBeVisible();
  expect(await readRecord(page, "main")).toEqual(before);
});
test("missing soil remains absent while a partial score is shown", async ({
  page,
}) => {
  await seedLegacy(page);
  const raw = weather();
  raw.hourly.soil_moisture_3_to_9cm = Array(720).fill(null);
  await page.route("https://api.open-meteo.com/**", (r) =>
    r.fulfill({ json: raw }),
  );
  await page.goto("/");
  const dialog = await openPoint(page);
  await expect(dialog.getByTestId("myco-score")).toContainText(/\d+ \/ 100/);
  await expect(
    dialog.getByText("Umidità a 3–9 cm", { exact: true }).locator(".."),
  ).toContainText("Non disponibile");
  await expect(dialog.getByText("Media", { exact: true })).toBeVisible();
});
