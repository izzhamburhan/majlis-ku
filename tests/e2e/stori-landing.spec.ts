import { expect, test } from "@playwright/test";
import { prisma } from "./db";

// The Stori landing page: a hero photo, guest photos, steps, the venue screen, privacy, pricing from the plan table.

test.afterAll(async () => {
  await prisma.$disconnect();
});

const ringgit = (sen: number) => `RM ${(sen / 100).toFixed(2)}`;

test("landing is inside the Stori root", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("[data-stori]");
  await expect(root).toHaveCount(1);
  await expect(root.getByRole("heading", { level: 1 })).toHaveText("Kenangan majlis anda, terkumpul di satu tempat");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(37, 29, 42)");
  // The header and footer stay on the page.
  await expect(root.getByRole("link", { name: "Privasi", exact: true })).toBeVisible();
  await expect(root.getByRole("link", { name: "Cipta majlis anda" }).first()).toBeVisible();
});

test("pricing shows prices from the plan table", async ({ page }) => {
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  expect(plans.length).toBeGreaterThan(0);
  await page.goto("/");
  const cards = page.getByTestId("plan-card");
  await expect(cards).toHaveCount(plans.length);
  for (const [index, plan] of plans.entries()) {
    const card = cards.nth(index);
    await expect(card).toContainText(plan.nameMs);
    await expect(card.getByTestId("plan-price")).toHaveText(ringgit(plan.priceSen));
    if (plan.includesGallery && plan.uploadLimit === null) await expect(card).toContainText("Muat naik tanpa had");
    if (plan.includesGallery && plan.uploadLimit !== null) await expect(card).toContainText(`${plan.uploadLimit} muat naik`);
    await expect(card).toContainText(`${plan.retentionDays} hari`);
  }
});

test("a changed plan price shows on the page, and the English page uses English names", async ({ page }) => {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: "ECARD" } });
  try {
    await prisma.plan.update({ where: { code: "ECARD" }, data: { priceSen: 4350 } });
    await page.goto("/en");
    const card = page.getByTestId("plan-card").filter({ hasText: plan.nameEn });
    await expect(card.getByTestId("plan-price")).toHaveText("RM 43.50");
  } finally {
    await prisma.plan.update({ where: { code: "ECARD" }, data: { priceSen: plan.priceSen } });
  }
});

test("landing photos: only the hero is eager, all have a size, none overflow at 360 wide", async ({ page }) => {
  for (const path of ["/", "/en"]) {
    await page.goto(path);
    const images = await page.locator("main img").evaluateAll((list) =>
      (list as HTMLImageElement[]).map((img) => ({
        src: new URL(img.src).pathname,
        loading: img.getAttribute("loading"),
        width: img.getAttribute("width"),
        height: img.getAttribute("height"),
        alt: img.getAttribute("alt"),
      })),
    );
    expect(images.length).toBeGreaterThanOrEqual(7);
    for (const image of images) {
      expect(image.src).toMatch(/^\/landing\/(couple-joy|couple-pink|couple-mono|couple-outdoor|bride-leaves|bride-henna|bride-veil)\.jpg$/);
      expect(image.width).toMatch(/^\d+$/);
      expect(image.height).toMatch(/^\d+$/);
    }
    // Only the closing banner is decorative (empty alt); every other photo is described.
    expect(images.filter((image) => !image.alt)).toHaveLength(1);
    const eager = images.filter((image) => image.loading !== "lazy");
    expect(eager).toHaveLength(1);
    expect(eager[0]!.src).toBe("/landing/couple-joy.jpg");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
});
