import { expect, test, type Browser } from "@playwright/test";
import { prisma } from "./db";
import { createEventAs } from "./helpers";

// The Stori guest gallery and report page: dusk ground, rounded tiles and a floating link back to the guest page.

let slug = "";

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** A free-plan event whose gallery is open to guests, with one wish in it. */
async function makeEvent(browser: Browser): Promise<string> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const host = await context.newPage();
  const created = await createEventAs(host, `stori.gallery.${Date.now()}.${Math.round(Math.random() * 1e6)}@majlisku.test`, "Majlis Galeri");
  await prisma.event.update({ where: { id: created.eventId }, data: { galleryVisibility: "GUESTS" } });
  await prisma.wish.create({ data: { eventId: created.eventId, guestName: "Mak Long", message: "Selamat pengantin baru" } });
  await context.close();
  return created.slug;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  slug = await makeEvent(browser);
});

const DUSK = "rgb(37, 29, 42)";

test("gallery is inside the Stori root", async ({ page }) => {
  await page.goto(`/${slug}/gallery`);
  const root = page.locator("[data-stori]");
  await expect(root).toHaveCount(1);
  await expect(root.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(DUSK);
});

test("gallery tiles are rounded and the grid keeps its items", async ({ page }) => {
  await page.goto(`/${slug}/gallery`);
  const tiles = page.getByTestId("gallery-grid").locator("li");
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first()).toContainText("Selamat pengantin baru");
  const radius = await tiles.first().evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  expect(radius).toBeGreaterThanOrEqual(20);
});

test("Tambah kenangan link returns to the guest page", async ({ page }) => {
  await page.goto(`/${slug}/gallery`);
  const link = page.getByRole("link", { name: "Tambah kenangan" });
  await expect(link).toHaveAttribute("href", new RegExp(`/${slug}$`));
  expect(await link.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  const box = await link.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/${slug}$`));
});

test("Tambah kenangan reads in English", async ({ page }) => {
  await page.goto(`/en/${slug}/gallery`);
  await expect(page.getByRole("link", { name: "Add a memory" })).toBeVisible();
});

test("report page is inside the Stori root", async ({ page }) => {
  await page.goto(`/${slug}/report`);
  const root = page.locator("[data-stori]");
  await expect(root).toHaveCount(1);
  await expect(root.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(DUSK);
});