import { test, expect, type Page } from "@playwright/test";
import { seedLegacy, readRecord } from "./fixtures";
import { mockLand, weather } from "./myco-fixtures";
test.use({ serviceWorkers: "block" });
async function selectPoint(page: Page, profile = "porcini") {
  await page.getByRole("button", { name: "MycoScore", exact: true }).click();
  await page
    .getByRole("region", { name: "Mostra mappa condizioni" })
    .getByLabel("Profilo sperimentale")
    .selectOption(profile);
  await page
    .getByLabel("Mappa interattiva")
    .click({ position: { x: 150, y: 170 } });
  return page.getByRole("dialog", { name: "MycoScore", exact: true });
}
for (const [place, code, surface] of [
  ["Adriatic", 1, "Acqua"],
  ["Sahara", 8, "Suolo nudo"],
  ["built square", 7, "Superficie edificata"],
] as const) {
  test(`${place}: hard exclusion skips weather and leaves journal intact`, async ({
    page,
  }, info) => {
    await seedLegacy(page);
    await mockLand(page, code);
    let calls = 0;
    await page.route("https://api.open-meteo.com/**", (route) => {
      calls++;
      return route.abort();
    });
    await page.goto("/");
    const before = await readRecord(page, "main");
    const dialog = await selectPoint(page);
    await expect(dialog.getByTestId("myco-status")).toHaveText(
      "Area non idonea",
    );
    await expect(dialog.getByTestId("myco-score")).toHaveCount(0);
    await expect(
      dialog.getByText(new RegExp(surface, "i")).first(),
    ).toBeVisible();
    expect(calls).toBe(0);
    if (place === "Adriatic")
      await page.screenshot({ path: info.outputPath("ecology-water.png") });
    await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Centra sulla mia posizione" }),
    ).toBeVisible();
    expect(await readRecord(page, "main")).toEqual(before);
  });
}
test("urban tree cover, Chanterelles, independent DEM failure and simple details", async ({
  page,
}, info) => {
  await seedLegacy(page);
  await mockLand(page, 2);
  let calls = 0;
  await page.route("https://api.open-meteo.com/**", (route) => {
    calls++;
    return new URL(route.request().url()).pathname.endsWith("elevation")
      ? route.fulfill({ status: 503, body: "unavailable" })
      : route.fulfill({ json: weather() });
  });
  await page.goto("/");
  const before = await readRecord(page, "main");
  const dialog = await selectPoint(page, "chanterelles");
  await expect(dialog.getByLabel("Profilo sperimentale")).toHaveValue(
    "chanterelles",
  );
  await expect(dialog.getByTestId("myco-score")).toContainText(/\d+ \/ 100/);
  await expect(dialog.getByTestId("myco-status")).toHaveCount(0);
  expect(await dialog.locator(".myco-reasons li").count()).toBeLessThanOrEqual(
    5,
  );
  await expect(dialog.locator(".ecology-details")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.screenshot({ path: info.outputPath("ecology-chanterelles.png") });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({
    path: info.outputPath("ecology-chanterelles-dark.png"),
  });
  await dialog.getByText("Mostra dettagli", { exact: true }).click();
  await expect(
    dialog.getByText("Pendenza", { exact: true }).locator(".."),
  ).toContainText("Non disponibile");
  await expect(
    dialog.getByText("Copertura arborea", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(2);
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  await page
    .getByRole("button", { name: "Esci da MycoScore", exact: true })
    .click();
  expect(await readRecord(page, "main")).toEqual(before);
});
