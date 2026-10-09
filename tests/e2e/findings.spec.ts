import { test, expect } from "@playwright/test";
import { seedLegacy, readRecord } from "./fixtures";
test.use({ serviceWorkers: "block" });
test("finding photos survive reload, edit, backup restore and deletion", async ({
  page,
}) => {
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().startsWith("Local save failed:"))
      console.error(message.text());
  });
  await seedLegacy(page);
  await page.route(
    /https:\/\/(.*tile\.opentopomap\.org|tile\.openstreetmap\.org|api\.maptiler\.com)\/.*/,
    (r) => r.abort(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Segna un punto" }).click();
  await page.getByRole("button", { name: "Scegli sulla mappa" }).click();
  await page
    .getByLabel("Mappa interattiva")
    .click({ position: { x: 110, y: 160 } });
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Nome del punto", { exact: true })
    .fill("Porcini fotografati");
  await dialog
    .getByLabel("Scegli foto", { exact: true })
    .setInputFiles([
      "tests/e2e/assets/finding.jpg",
      "tests/e2e/assets/finding.jpg",
    ]);
  await expect(
    dialog.getByRole("button", { name: "Principale", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Usa come principale", exact: true }),
  ).toBeVisible();
  await dialog.getByText("Aggiungi dettagli", { exact: true }).click();
  await dialog.getByLabel("Quantità", { exact: true }).fill("4");
  await dialog.getByLabel("Peso", { exact: true }).fill("1.2");
  await dialog.getByLabel("Castagno", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Salva punto", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const original = (await readRecord(page, "main")).finds[0];
  const inspect = () =>
    page.evaluate(
      () =>
        new Promise<any>((resolve, reject) => {
          const r = indexedDB.open("mycotrail");
          r.onsuccess = () => {
            const db = r.result;
            const t = db.transaction(["photos", "photoMeta", "photoThumbs"]);
            const m = t.objectStore("photoMeta").getAll(),
              b = t.objectStore("photos").getAll(),
              thumb = t.objectStore("photoThumbs").getAll();
            t.oncomplete = () => {
              resolve({
                meta: m.result,
                sizes: b.result.map((x: Blob | { bytes: ArrayBuffer }) =>
                  x instanceof Blob ? x.size : x.bytes.byteLength,
                ),
                thumbs: thumb.result.length,
              });
              db.close();
            };
          };
          r.onerror = reject;
        }),
    );
  expect((await inspect()).meta[0].width).toBe(1920);
  await page.reload();
  const nav = page.getByRole("navigation", {
    name:
      page.viewportSize()!.width < 701
        ? "Navigazione mobile"
        : "Navigazione principale",
  });
  await nav.getByRole("button", { name: /^I miei punti/ }).click();
  await page.getByRole("button", { name: "Apri sulla mappa" }).click();
  await expect(
    dialog.getByRole("img", { name: "Foto del ritrovamento" }),
  ).toHaveCount(2);
  await dialog
    .getByRole("button", { name: "Apri foto 1", exact: true })
    .click();
  const viewer = page.getByRole("dialog", {
    name: "Foto del ritrovamento",
    exact: true,
  });
  await expect(viewer.getByRole("img")).toBeVisible();
  await viewer.getByRole("button", { name: "Chiudi", exact: true }).click();
  await dialog.getByRole("button", { name: "Modifica punto" }).click();
  await dialog
    .getByLabel("Nome del punto", { exact: true })
    .fill("Porcini aggiornati");
  await dialog
    .getByRole("button", { name: "Elimina foto 1", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Salva punto", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect((await inspect()).meta).toHaveLength(1);
  expect((await inspect()).meta[0].primary).toBe(true);
  const updated = (await readRecord(page, "main")).finds[0];
  expect([updated.lat, updated.lng, updated.createdAt]).toEqual([
    original.lat,
    original.lng,
    original.createdAt,
  ]);
  await nav.getByRole("button", { name: "Impostazioni", exact: true }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Esporta backup", exact: true })
    .click();
  const file = await (await download).path();
  await nav.getByRole("button", { name: /^I miei punti/ }).click();
  await page.getByRole("button", { name: "Apri sulla mappa" }).click();
  await dialog.getByRole("button", { name: "Elimina", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Elimina punto", exact: true })
    .click();
  await expect.poll(async () => (await inspect()).meta.length).toBe(0);
  expect((await inspect()).sizes).toEqual([]);
  expect((await inspect()).thumbs).toBe(0);
  await nav.getByRole("button", { name: "Impostazioni", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(file!);
  await dialog
    .getByRole("button", { name: "Ripristina dati", exact: true })
    .click();
  await expect.poll(async () => (await inspect()).meta.length).toBe(1);
  expect((await readRecord(page, "main")).finds[0]).toEqual(updated);
  await page.reload();
  await nav.getByRole("button", { name: /^I miei punti/ }).click();
  await page.getByRole("button", { name: "Apri sulla mappa" }).click();
  await expect(
    dialog.getByRole("img", { name: "Foto del ritrovamento" }),
  ).toBeVisible();
});
