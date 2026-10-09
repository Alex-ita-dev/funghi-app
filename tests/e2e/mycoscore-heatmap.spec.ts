import { test, expect } from "@playwright/test";
import { seedLegacy, readRecord } from "./fixtures";
import { weather } from "./myco-fixtures";
test.use({ serviceWorkers: "block" });
test("explicit batched heatmap, cell detail, cached offline reload and journal isolation", async ({
  page,
}, info) => {
  await seedLegacy(page);
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
          ? weather()
          : lats.map(() => weather()),
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
  expect(calls).toBeLessThanOrEqual(6);
  const count = calls;
  await page.getByLabel("Mappa interattiva").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("heatmap-light.png") });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({ path: info.outputPath("heatmap-dark.png") });
  // Center is covered by a cell; canvas hit testing must open the shared detail UI.
  const map = page.getByLabel("Mappa interattiva"),
    box = await map.boundingBox();
  await map.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  const dialog = page.getByRole("dialog", { name: "MycoScore", exact: true });
  await expect(dialog.getByTestId("myco-score")).toContainText(/\d+ \/ 100/);
  await expect(
    dialog.getByText("Pendenza", { exact: true }).locator(".."),
  ).toContainText("11,3°");
  await expect(
    dialog.getByText("Esposizione", { exact: true }).locator(".."),
  ).toContainText("S");
  expect(calls).toBe(count);
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  await controls.getByRole("button", { name: "Aggiorna analisi" }).click();
  await expect(controls.getByText(/Dati memorizzati:/)).toBeVisible();
  expect(calls).toBe(count);
  await controls
    .getByRole("button", { name: "Mostra mappa condizioni" })
    .click();
  await expect(page.locator(".leaflet-mycoHeat-pane canvas")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Centra sulla mia posizione" }),
  ).toBeVisible();
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
  await controls.getByText("Legenda MycoScore", { exact: true }).click();
  await controls
    .getByText("Zone e punteggi (accesso da tastiera)", { exact: true })
    .click();
  await controls.getByRole("button", { name: /^25:/ }).click();
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
  let release: (() => void) | undefined;
  await page.route("https://api.open-meteo.com/**", async (route) => {
    calls++;
    await new Promise<void>((r) => {
      release = r;
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
  await expect.poll(() => calls).toBe(1);
  await controls.getByRole("button", { name: "Annulla", exact: true }).click();
  release?.();
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
