import { test, expect, type Page } from "@playwright/test";
import { readRecord, seedLegacy } from "./fixtures";

async function settingsPage(page: Page, language = "it") {
  await page
    .getByRole("navigation", {
      name:
        page.viewportSize()!.width < 701
          ? language === "it"
            ? "Navigazione mobile"
            : "Mobile navigation"
          : language === "it"
            ? "Navigazione principale"
            : "Main navigation",
    })
    .getByRole("button", {
      name: language === "it" ? "Impostazioni" : "Settings",
      exact: true,
    })
    .click();
}
async function complete(page: Page) {
  await page.getByRole("button", { name: "Inizia", exact: true }).click();
  await page.getByLabel("Nome o nickname").fill("Castagno");
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await page.getByLabel("Paese", { exact: true }).selectOption("IT");
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await page.getByRole("button", { name: /Entrambi/ }).click();
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await page.getByLabel("Porcini", { exact: true }).check();
  await page.getByLabel("Tartufo bianco", { exact: true }).check();
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await page.getByRole("button", { name: "Intermedio", exact: true }).click();
  await page.getByRole("button", { name: "Continua", exact: true }).click();
  await page
    .getByRole("button", { name: "Entra nel bosco", exact: true })
    .click();
}
const saved = {
  version: 1,
  savedAt: 20001,
  car: { lat: 43, lng: 11, accuracy: 8, savedAt: 1 },
  finds: [
    {
      id: "keep",
      kind: "spot",
      title: "Castagno originale",
      notes: "Nota privata",
      lat: 43,
      lng: 11,
      source: "map",
      accuracy: null,
      createdAt: 1,
    },
  ],
  trips: [
    {
      id: "route",
      name: "Percorso originale",
      startedAt: 1,
      endedAt: 20001,
      status: "completed",
      segment: 0,
      elapsedMs: 20000,
      resumedAt: null,
      car: null,
      points: [
        { lat: 43, lng: 11, accuracy: 8, timestamp: 1, segment: 0 },
        { lat: 43, lng: 11.001, accuracy: 8, timestamp: 20001, segment: 0 },
      ],
    },
  ],
};
test.beforeEach(async ({ page }) => {
  await page.route(
    /https:\/\/(.*tile\.opentopomap\.org|tile\.openstreetmap\.org|api\.maptiler\.com)\/.*/,
    (r) => r.abort(),
  );
});
test("new user completes profile; reload and offline do not restart onboarding", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Benvenuto in MycoTrail" }),
  ).toBeVisible();
  await complete(page);
  await expect(
    page.getByRole("heading", { name: "Ci vediamo nel bosco." }),
  ).toBeVisible();
  const stored = await readRecord(page, "settings");
  expect(stored.onboardingCompleted).toBe(true);
  expect(stored.profile).toMatchObject({
    nickname: "Castagno",
    searchMode: "both",
    experience: "intermediate",
    favouriteSpecies: ["boletus-edulis-group", "tuber-magnatum"],
  });
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => {}));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ci vediamo nel bosco." }),
  ).toBeVisible();
  expect((await readRecord(page, "settings")).profile).toEqual(stored.profile);
});
test("legacy journal remains accessible and profile reconfiguration preserves every record", async ({
  page,
}) => {
  await seedLegacy(page, saved);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ci vediamo nel bosco." }),
  ).toBeVisible();
  await expect(
    page.getByText("Completa il tuo profilo MycoTrail", { exact: true }),
  ).toBeVisible();
  expect(await readRecord(page, "main")).toEqual(saved);
  await settingsPage(page);
  await page
    .getByRole("button", { name: "Riconfigura profilo", exact: true })
    .click();
  await complete(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await readRecord(page, "main")).toEqual(saved);
  await page.reload();
  expect(await readRecord(page, "main")).toEqual(saved);
  await expect(
    page.getByText("Completa il tuo profilo MycoTrail", { exact: true }),
  ).toHaveCount(0);
});
test("theme changes immediately, follows the system and persists", async ({
  page,
}, testInfo) => {
  await seedLegacy(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await settingsPage(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Tema", { exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: testInfo.outputPath("settings-light.png"),
    fullPage: true,
  });
  await page.getByLabel("Tema", { exact: true }).selectOption("dark");
  await expect
    .poll(async () => (await readRecord(page, "settings")).preferences.theme)
    .toBe("dark");
  await page.screenshot({
    path: testInfo.outputPath("settings-dark.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await settingsPage(page);
  await page.getByLabel("Tema", { exact: true }).selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
test("six languages update without reload and fit narrow screens", async ({
  page,
}) => {
  await seedLegacy(page);
  await page.goto("/");
  await settingsPage(page);
  for (const [language, label, heading] of [
    ["en", "Language", "Appearance"],
    ["de", "Sprache", "Darstellung"],
    ["es", "Idioma", "Aspecto"],
    ["fr", "Langue", "Apparence"],
    ["pt", "Idioma", "Aspeto"],
    ["it", "Lingua", "Aspetto"],
  ]) {
    await page.locator(".setting-row select").nth(1).selectOption(language);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(language);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByLabel("Lingua", { exact: true }).selectOption("en");
  await expect
    .poll(async () => (await readRecord(page, "settings")).preferences.language)
    .toBe("en");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "See you in the forest." }),
  ).toBeVisible();
});
test("country presets and manual overrides change presentation, never stored GPS", async ({
  page,
}) => {
  await seedLegacy(page, saved);
  await page.goto("/");
  const original = await readRecord(page, "main");
  await settingsPage(page);
  await page.getByLabel("Paese", { exact: true }).selectOption("US");
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue("en");
  await expect(page.getByLabel("Distance", { exact: true })).toHaveValue(
    "imperial",
  );
  await page.getByLabel("Altitude", { exact: true }).selectOption("m");
  await expect
    .poll(
      async () => (await readRecord(page, "settings")).preferences.altitudeUnit,
    )
    .toBe("m");
  await page
    .getByRole("navigation", {
      name:
        page.viewportSize()!.width < 701
          ? "Mobile navigation"
          : "Main navigation",
    })
    .getByRole("button", { name: "My outings", exact: true })
    .click();
  await expect(page.locator(".trip-row-stat strong")).toContainText("ft");
  expect(await readRecord(page, "main")).toEqual(original);
  await settingsPage(page, "en");
  await page.getByLabel("Distance", { exact: true }).selectOption("metric");
  await page
    .getByRole("navigation", {
      name:
        page.viewportSize()!.width < 701
          ? "Mobile navigation"
          : "Main navigation",
    })
    .getByRole("button", { name: "My outings", exact: true })
    .click();
  await expect(page.locator(".trip-row-stat strong")).toContainText("m");
  expect(await readRecord(page, "main")).toEqual(original);
});
