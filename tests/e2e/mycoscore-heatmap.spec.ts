import { test, expect } from "@playwright/test";
import { seedLegacy, readRecord } from "./fixtures";
import { heatmapWeather, mockLand } from "./myco-fixtures";
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await mockLand(page);
});
test("explicit batched heatmap, cell detail, cached offline reload and journal isolation", async ({
  page,
}, info) => {
  // Full area/detail/species/offline/GPS lifecycle; each assertion retains its normal timeout.
  test.setTimeout(60000);
  await page.addInitScript(() => {
    (window as any).heatGpsCalls = 0;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(ok: PositionCallback) {
          (window as any).heatGpsCalls++;
          ok({
            coords: {
              latitude: 43.52,
              longitude: 11.48,
              accuracy: 8,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          });
        },
        watchPosition() {
          return 1;
        },
        clearWatch() {},
      },
    });
  });
  await seedLegacy(page);
  let landCalls = 0;
  await page.route("https://ic.imagery1.arcgis.com/**", (route) => {
    landCalls++;
    const geometry = JSON.parse(
      new URL(route.request().url()).searchParams.get("geometry")!,
    );
    return route.fulfill({
      json: {
        samples: Array.from(
          { length: geometry.points.length },
          (_, locationId) => ({
            locationId,
            value:
              geometry.points[Math.floor(locationId / 9) * 9][0] < 11.47
                ? "1"
                : "2",
            resolution: 10,
            attributes: { Year: 2025 },
          }),
        ),
      },
    });
  });
  await page.evaluate(() =>
    localStorage.setItem(
      "mycotrail.map-viewport.v1",
      JSON.stringify({ lat: 43.52, lng: 11.48, zoom: 15 }),
    ),
  );
  let calls = 0;
  await page.route("https://api.open-meteo.com/**", (route) => {
    calls++;
    const u = new URL(route.request().url()),
      lats = u.searchParams.get("latitude")!.split(",").map(Number);
    return route.fulfill({
      json: u.pathname.endsWith("elevation")
        ? { elevation: lats.map((lat) => 612 + (lat - 43.52) * 111320 * 0.2) }
        : lats.length === 1
          ? heatmapWeather()
          : lats.map(() => heatmapWeather()),
    });
  });
  await page.goto("/");
  const before = await readRecord(page, "main");
  await page.getByRole("button", { name: "MycoScore", exact: true }).click();
  const controls = page.getByRole("region", {
    name: "Mostra mappa condizioni",
  });
  await controls.getByLabel("Profilo sperimentale").selectOption("porcini");
  await controls
    .getByRole("button", { name: "Mostra mappa condizioni" })
    .click();
  expect(calls).toBe(0);
  await controls.getByRole("button", { name: "Analizza questa zona" }).click();
  await expect(page.locator(".leaflet-mycoHeat-pane canvas")).toBeVisible();
  await expect(controls.getByText(/Porcini · Dati recuperati:/)).toBeVisible();
  expect(calls).toBeLessThanOrEqual(8);
  expect(landCalls).toBe(8);
  await expect(
    controls.getByText("Area non idonea", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    controls.getByText("Legenda MycoScore", { exact: true }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "MycoScore", exact: true });
  await controls
    .getByText("Zone e punteggi (accesso da tastiera)", { exact: true })
    .click();
  const waterCell = controls.getByRole("button", {
    name: /^1:.*Area non idonea/,
  });
  await expect(waterCell).toBeVisible();
  await waterCell.click();
  await expect(dialog.getByTestId("myco-status")).toHaveText("Area non idonea");
  await expect(dialog.getByTestId("myco-score")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  await controls
    .getByText("Zone e punteggi (accesso da tastiera)", { exact: true })
    .click();
  await controls.screenshot({ path: info.outputPath("heatmap-controls.png") });
  const count = calls;
  const landCount = landCalls;
  await page.getByLabel("Mappa interattiva").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("heatmap-light.png") });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({ path: info.outputPath("heatmap-dark.png") });
  // Center is covered by a cell; canvas hit testing must open the shared detail UI.
  const map = page.getByLabel("Mappa interattiva"),
    box = await map.boundingBox();
  await map.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await expect(dialog.getByTestId("myco-score")).toContainText(/\d+ \/ 100/);
  const porciniScore = await dialog.getByTestId("myco-score").innerText();
  await dialog.getByText("Mostra dettagli", { exact: true }).click();
  await expect(
    dialog.getByText("Pendenza", { exact: true }).locator(".."),
  ).toContainText("11,3°");
  await expect(
    dialog.getByText("Esposizione", { exact: true }).locator(".."),
  ).toContainText("S");
  expect(calls).toBe(count);
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  await controls
    .getByLabel("Profilo sperimentale")
    .selectOption("chanterelles");
  await expect(
    controls.getByText(/Finferli · Dati memorizzati:/),
  ).toBeVisible();
  await map.scrollIntoViewIfNeeded();
  await map.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await expect(dialog.getByTestId("myco-score")).not.toHaveText(porciniScore);
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  expect(calls).toBe(count);
  expect(landCalls).toBe(landCount);
  await controls.getByRole("button", { name: "Aggiorna analisi" }).click();
  await expect(controls.getByText(/Dati memorizzati:/)).toBeVisible();
  expect(calls).toBe(count);
  await controls.getByRole("button", { name: "Nascondi mappa" }).click();
  await expect(page.locator(".leaflet-mycoHeat-pane canvas")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Centra sulla mia posizione" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Centra sulla mia posizione" })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).heatGpsCalls))
    .toBeGreaterThan(0);
  await expect(page.getByLabel("Mappa interattiva")).toBeVisible();
  expect(calls).toBe(count);
  expect(await readRecord(page, "main")).toEqual(before);
  await page.reload();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    }),
  );
  await page.getByRole("button", { name: "MycoScore", exact: true }).click();
  await controls.getByLabel("Profilo sperimentale").selectOption("porcini");
  await controls
    .getByRole("button", { name: "Mostra mappa condizioni" })
    .click();
  await expect(page.locator(".leaflet-mycoHeat-pane canvas")).toBeVisible();
  await expect(controls.getByText(/Dati memorizzati:/)).toBeVisible();
  expect(calls).toBe(count);
  await controls
    .getByText("Zone e punteggi (accesso da tastiera)", { exact: true })
    .click();
  await controls.getByRole("button", { name: /^28:/ }).click();
  await expect(dialog.getByTestId("myco-score")).toBeVisible();
  expect(calls).toBe(count);
  expect(await readRecord(page, "main")).toEqual(before);
});
test("cancel leaves map stable and no late overlay; pan and zoom never trigger analysis", async ({
  page,
}) => {
  await seedLegacy(page);
  await page.goto("/");
  const before = await readRecord(page, "main");
  let calls = 0;
  const releases: (() => void)[] = [];
  await page.route("https://api.open-meteo.com/**", async (route) => {
    calls++;
    await new Promise<void>((r) => {
      releases.push(r);
    });
    await route.abort();
  });
  await page.getByRole("button", { name: "MycoScore", exact: true }).click();
  const controls = page.getByRole("region", {
    name: "Mostra mappa condizioni",
  });
  await controls
    .getByRole("button", { name: "Mostra mappa condizioni" })
    .click();
  await controls.getByRole("button", { name: "Analizza questa zona" }).click();
  await expect(
    controls.getByRole("button", { name: "Annulla", exact: true }),
  ).toBeVisible();
  await expect.poll(() => calls).toBe(2);
  await controls.getByRole("button", { name: "Annulla", exact: true }).click();
  releases.forEach((release) => release());
  await expect(
    controls.getByRole("button", { name: "Analizza questa zona" }),
  ).toBeEnabled();
  const count = calls;
  await page.getByRole("button", { name: "Ingrandisci", exact: true }).click();
  await expect(page.locator(".leaflet-mycoHeat-pane canvas")).toHaveCount(0);
  expect(calls).toBe(count);
  await page
    .getByRole("button", { name: "Esci da MycoScore", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Centra sulla mia posizione" }),
  ).toBeVisible();
  expect(await readRecord(page, "main")).toEqual(before);
});
