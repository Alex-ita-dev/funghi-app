import { test, expect, type Page } from "@playwright/test";
import { seedLegacy } from "./fixtures";
// Only the OS location source is simulated; UI, IndexedDB, map, and service worker run normally.
async function fakeGps(page: Page, denied = false) {
  await page.addInitScript(
    ({ denied }) => {
      let watcher: PositionCallback | undefined;
      const position = (lat = 43.52, lng = 11.48) => ({
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy: 8,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(
            ok: PositionCallback,
            fail: PositionErrorCallback,
          ) {
            setTimeout(
              () =>
                denied
                  ? fail({
                      code: 1,
                      message: "Denied",
                      PERMISSION_DENIED: 1,
                      POSITION_UNAVAILABLE: 2,
                      TIMEOUT: 3,
                    })
                  : ok(position()),
              10,
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
      });
      (
        window as unknown as { testGps: (lat: number, lng: number) => void }
      ).testGps = (lat, lng) => watcher?.(position(lat, lng));
    },
    { denied },
  );
}
async function navigate(page: Page, name: string) {
  const nav =
    page.viewportSize()!.width < 701
      ? "Navigazione mobile"
      : "Navigazione principale";
  await page
    .getByRole("navigation", { name: nav })
    .getByRole("button", { name })
    .click();
}
async function database(page: Page) {
  return page.evaluate(
    async () =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open("mycotrail", 1);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction("data").objectStore("data").get("main");
          read.onsuccess = () => {
            resolve(read.result);
            db.close();
          };
          read.onerror = reject;
        };
        request.onerror = reject;
      }),
  );
}

test.beforeEach(async ({ page }) => {
  await seedLegacy(page);
  // Avoid depending on public tile service availability in automated tests.
  await page.route(
    /https:\/\/(.*tile\.opentopomap\.org|tile\.openstreetmap\.org|api\.maptiler\.com)\/.*/,
    (route) => route.abort(),
  );
});

test("save car, record, reload paused, resume, finish and export", async ({
  page,
}) => {
  await fakeGps(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ci vediamo nel bosco." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Salva l’auto", exact: false })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "La mia posizione" })
    .click();
  await expect(
    page.getByRole("button", { name: "Auto salvata" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Avvia uscita", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pausa", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await database(page))?.trips?.[0]?.points.length)
    .toBe(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Riprendi", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Riprendi", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pausa", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Concludi", exact: true }).click();
  await page
    .getByRole("button", { name: "Concludi e salva", exact: true })
    .click();
  await navigate(page, "Le mie uscite");
  await expect(page.getByText("CONCLUSA", { exact: true })).toBeVisible();
  const db = await database(page);
  expect(db.trips[0].status).toBe("completed");
  expect(db.trips[0].car).not.toBeNull();
  expect(db.trips[0].segment).toBe(1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Esporta GPX/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.gpx$/);
});

test("manual finding survives reload, can be edited and deleted when GPS is denied", async ({
  page,
}) => {
  await fakeGps(page, true);
  await page.goto("/");
  await page.getByRole("button", { name: "Attiva GPS" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "GPS non autorizzato" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Segna un punto" }).click();
  await page.getByRole("button", { name: "Scegli sulla mappa" }).click();
  await page
    .getByLabel("Mappa interattiva")
    .click({ position: { x: 110, y: 160 } });
  await page.getByLabel("Nome del punto").fill("Castagno grande");
  await page.getByLabel("Le tue note").fill("<img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "Fungaia", exact: true }).click();
  await page.getByRole("button", { name: "Salva punto" }).click();
  await expect.poll(async () => (await database(page))?.finds?.length).toBe(1);
  await page.reload();
  await navigate(page, "I miei punti");
  await expect(
    page.getByRole("heading", { name: "Castagno grande" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apri sulla mappa" }).click();
  await page.getByRole("button", { name: "Modifica punto" }).click();
  await page.getByLabel("Nome del punto").fill("Castagno alto");
  await page.getByRole("button", { name: "Salva punto" }).click();
  await navigate(page, "I miei punti");
  await expect(
    page.getByRole("heading", { name: "Castagno alto" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Apri sulla mappa" }).click();
  await page.getByRole("button", { name: "Elimina", exact: true }).click();
  await page
    .getByRole("button", { name: "Elimina punto", exact: true })
    .click();
  await expect.poll(async () => (await database(page)).finds.length).toBe(0);
});

test("backup import validation and round trip", async ({ page }) => {
  await fakeGps(page);
  await page.goto("/");
  await navigate(page, "Impostazioni");
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.locator(".toast")).toContainText("Backup non valido");
  const saved = {
    version: 1,
    savedAt: Date.now(),
    car: null,
    trips: [],
    finds: [
      {
        id: "import",
        kind: "spot",
        title: "Fungaia del backup",
        notes: "",
        createdAt: Date.now(),
        source: "map",
        accuracy: null,
        lat: 43.51,
        lng: 11.5,
      },
    ],
  };
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.getByRole("button", { name: "Ripristina dati" }).click();
  await expect
    .poll(async () => (await database(page))?.finds?.[0]?.title)
    .toBe("Fungaia del backup");
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Esporta backup", exact: true })
    .click();
  expect((await dl).suggestedFilename()).toMatch(/mycotrail-backup.*\.json$/);
});

test("no horizontal overflow and app shell reopens offline", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "Playwright WebKit offline SW navigation bug: https://github.com/microsoft/playwright/issues/42775",
  );
  await fakeGps(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ci vediamo nel bosco." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Avvia uscita", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false,
    });
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ci vediamo nel bosco." }),
  ).toBeVisible();
  await expect(page.getByText(/Sei offline\./)).toBeVisible();
});
