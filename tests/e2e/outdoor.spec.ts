import { test, expect, type Page } from "@playwright/test";
import { seedLegacy } from "./fixtures";
test.beforeEach(async ({ page }) => {
  await seedLegacy(page);
});
async function setup(page: Page, denied = false) {
  await page.route(
    /https:\/\/(.*tile\.opentopomap\.org|tile\.openstreetmap\.org|api\.maptiler\.com)\/.*/,
    (r) => r.abort(),
  );
  await page.addInitScript(
    ({ denied }) => {
      const position = (patch = {}) => ({
        coords: {
          latitude: 43.52,
          longitude: 11.48,
          accuracy: 8,
          altitude: 275,
          altitudeAccuracy: 12,
          heading: 90,
          speed: 1,
          ...patch,
        },
        timestamp: Date.now(),
      });
      let watcher: PositionCallback | undefined;
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition(
            ok: PositionCallback,
            error: PositionErrorCallback,
          ) {
            setTimeout(
              () =>
                denied
                  ? error({
                      code: 1,
                      message: "denied",
                    } as GeolocationPositionError)
                  : ok(position() as GeolocationPosition),
              1,
            );
          },
          watchPosition(ok: PositionCallback) {
            watcher = ok;
            return 1;
          },
          clearWatch() {
            watcher = undefined;
          },
        },
        configurable: true,
      });
      Object.assign(window, {
        outdoorGps: (patch: object) =>
          watcher?.(position(patch) as GeolocationPosition),
      });
      Object.defineProperty(navigator, "share", {
        value: async (data: ShareData) => {
          Object.assign(window, { sharedPosition: data.text });
        },
        configurable: true,
      });
    },
    { denied },
  );
}
test("map preference, failure fallback and missing provider key", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Scegli mappa: Topografica" }).click();
  await expect(page.getByRole("button", { name: /^Satellite/ })).toBeDisabled();
  await page.getByRole("button", { name: /^Stradale/ }).click();
  await expect(
    page.getByRole("button", { name: "Scegli mappa: Stradale" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Scegli mappa: Stradale" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Scegli mappa: Stradale" }).click();
  await page.getByRole("button", { name: /^Topografica/ }).click();
  await page.getByRole("button", { name: "Usa stradale" }).click();
  await expect(
    page.getByRole("button", { name: "Scegli mappa: Stradale" }),
  ).toBeVisible();
});
test("fullscreen saves a point and car, returns to car and exits", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Espandi mappa" }).click();
  const full = page.getByRole("region", { name: "Mappa a schermo intero" });
  await full.getByRole("button", { name: "Salva auto", exact: true }).click();
  await page.getByRole("button", { name: "La mia posizione" }).click();
  await full.getByRole("button", { name: "Salva punto", exact: true }).click();
  await page.getByRole("button", { name: "La mia posizione" }).click();
  await page.getByLabel("Nome del punto").fill("Punto V2");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salva punto", exact: true })
    .click();
  await full.getByRole("button", { name: "Torna auto" }).click();
  await expect(full.getByText(/non è un itinerario calcolato/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await full.getByRole("button", { name: "Riduci mappa" }).click();
  await expect(full).toHaveCount(0);
});
test("SOS stays available offline and includes altitude and sharing", async ({
  page,
  context,
}) => {
  await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: "SOS", exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("link", { name: "Chiama 112" })).toHaveAttribute(
    "href",
    "tel:112",
  );
  await expect(panel.getByText(/Nessuna posizione rilevata/)).toBeVisible();
  await context.setOffline(true);
  await panel.getByRole("button", { name: "Aggiorna posizione GPS" }).click();
  await expect(panel.getByText("43.520000", { exact: true })).toBeVisible();
  await expect(panel.getByText("275 m (±12 m)", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Condividi coordinate" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { sharedPosition: string }).sharedPosition,
    ),
  ).toContain("Latitudine: 43.520000");
  await page.clock.install();
  await page.clock.fastForward(31000);
  await expect(panel.getByText(/Posizione precedente/)).toBeVisible();
});
test("GPS denial is explained for both platforms", async ({ page }) => {
  await setup(page, true);
  await page.goto("/");
  await page
    .getByRole("navigation", {
      name:
        page.viewportSize()!.width < 701
          ? "Navigazione mobile"
          : "Navigazione principale",
    })
    .getByRole("button", { name: "Impostazioni" })
    .click();
  await page
    .getByRole("button", { name: "Attiva posizione", exact: true })
    .click();
  await expect(page.getByTestId("gps-permission")).toHaveText("Negato");
  await page.getByText("Aiuto per iPhone e Android", { exact: true }).click();
  await expect(page.getByText(/Android:.*attiva Posizione/)).toBeVisible();
});
test("heading uses GPS course and expires instead of leaving a stale arrow", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Attiva GPS", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Attiva bussola.*Movimento GPS.*90/ }),
  ).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(16000);
  await expect(
    page.getByRole("button", {
      name: /Attiva bussola.*Direzione non disponibile/,
    }),
  ).toBeVisible();
});
