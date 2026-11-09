import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { prisma } from "./db";
import { agreeToConsent, createEventAs } from "./helpers";

// The Stori guest page: a full-bleed cover, a floating dock and dusk sheets. Phone viewport (360 x 740) from the config.

let slug = "";
let pinSlug = "";
let shotsSlug = "";

const PIN = "2468";

// These tests join as a guest many times. Every e2e run shares one client IP, so clear the
// per-IP join limit here to keep this file from using up the allowance of the other specs.
test.beforeEach(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "guestJoin:" } } });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** A free-plan event whose gallery is open to guests; with `pin`, guests must enter it first. */
async function makeEvent(browser: Browser, pin?: string, shotsPerGuest?: number): Promise<string> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const host = await context.newPage();
  const created = await createEventAs(host, `stori.${Date.now()}.${Math.round(Math.random() * 1e6)}@majlisku.test`, "Majlis Stori");
  if (pin) {
    await host.goto(`/dashboard/events/${created.eventId}/edit`);
    await host.getByLabel("PIN majlis").fill(pin);
    await host.getByRole("button", { name: "Simpan tetapan" }).click();
    await expect(host.getByRole("status").first()).toHaveText("Disimpan");
  }
  await prisma.event.update({ where: { id: created.eventId }, data: { galleryVisibility: "GUESTS", ...(shotsPerGuest ? { shotsPerGuest } : {}) } });
  await context.close();
  return created.slug;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  slug = await makeEvent(browser);
  pinSlug = await makeEvent(browser, PIN);
  shotsSlug = await makeEvent(browser, undefined, 1);
});

async function join(page: Page, path: string, name = "Mak Cik Kiah") {
  await page.goto(path);
  await page.getByPlaceholder("cth. Mak Cik Kiah").fill(name);
  await page.getByRole("button", { name: "Teruskan" }).click();
  await expect(page.getByText(`Hai, ${name}!`)).toBeVisible();
}

const dockOf = (page: Page) => page.getByRole("navigation", { name: "Apa yang anda mahu kongsi?" });

test("guest page is inside the Stori root", async ({ page }) => {
  await page.goto(`/${slug}`);
  const root = page.locator("[data-stori]");
  await expect(root).toHaveCount(1);
  await expect(root.getByRole("heading", { level: 1 })).toBeVisible();
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(37, 29, 42)");
});

test("withdrawn consent stays withdrawn after a reload", async ({ page }) => {
  await join(page, `/${slug}`);
  await agreeToConsent(page);
  await page.getByLabel("Saya faham dan bersetuju").uncheck();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Saya faham dan bersetuju")).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Ambil gambar" })).toBeDisabled();
});

test("shutter and gallery picker stay disabled until consent is agreed", async ({ page }) => {
  await join(page, `/${slug}`);
  const label = page.getByLabel("Saya faham dan bersetuju");
  await expect(label).toHaveCount(1);
  await expect(label).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Ambil gambar" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pilih dari galeri" })).toBeDisabled();
  await expect(page.getByTestId("photo-input")).toBeDisabled();
  for (const name of ["Video", "Suara", "Ucapan"]) await expect(page.getByRole("button", { name })).toBeDisabled();
  // The panel has no way to dismiss it.
  await expect(page.getByRole("button", { name: /tutup|close|dismiss/i })).toHaveCount(0);

  await agreeToConsent(page);
  await expect(page.getByLabel("Saya faham dan bersetuju")).toHaveCount(1);
  await expect(page.getByLabel("Saya faham dan bersetuju")).toBeChecked();
  await expect(page.getByRole("button", { name: "Ambil gambar" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Pilih dari galeri" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Suara" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Ucapan" })).toBeEnabled();
  // A free plan has no video: the item stays disabled with the plan note.
  await expect(page.getByRole("button", { name: "Video" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Video" })).toContainText("Pelan Premium");
});

test("dock shows Galeri, Video, Suara, Ucapan and the shutter", async ({ page }) => {
  await page.goto(`/${slug}`);
  // Not in the name view.
  await expect(dockOf(page)).toHaveCount(0);
  await join(page, `/${slug}`);
  const dock = dockOf(page);
  await expect(dock).toBeVisible();
  await expect(dock.getByRole("link", { name: "Galeri" })).toHaveAttribute("href", new RegExp(`/${slug}/gallery$`));
  for (const name of ["Video", "Suara", "Ucapan", "Ambil gambar"]) await expect(dock.getByRole("button", { name })).toBeVisible();
  const box = await dock.boundingBox();
  const position = await dock.evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe("fixed");
  expect(box!.y + box!.height).toBeLessThanOrEqual(740);
});

test("dock targets are at least 44 px", async ({ page }) => {
  await join(page, `/${slug}`);
  await agreeToConsent(page);
  const targets = dockOf(page).locator("a, button");
  expect(await targets.count()).toBe(5);
  for (const target of await targets.all()) {
    const box = await target.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

/** The fixed dock plus the raised shutter that sticks out above it: the highest point a fixed control reaches. */
async function dockTop(page: Page): Promise<number> {
  const dockBox = await page.getByTestId("guest-dock").boundingBox();
  const shutterBox = await page.getByTestId("guest-shutter").boundingBox();
  return Math.min(dockBox!.y, shutterBox!.y);
}

/** At the top of the page the names sit above the dock; at the bottom the last control (the footer link) does too. */
async function expectClearOfDock(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, label).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  const top = await dockTop(page);
  const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(h1!.y + h1!.height, `${label}: names above the dock`).toBeLessThanOrEqual(top);
  const panel = page.getByRole("checkbox");
  const box = await panel.boundingBox();
  // Consent shown in the first screen must not sit behind the dock; one further down is reached by scrolling (checked below).
  if (box!.y < top) expect(box!.y + box!.height, `${label}: consent above the dock`).toBeLessThanOrEqual(top);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1);
  const last = await page.locator("footer a").last().boundingBox();
  expect(last!.y + last!.height, `${label}: last control above the dock`).toBeLessThanOrEqual(await dockTop(page));
  await page.evaluate(() => window.scrollTo(0, 0));
}

const LOCALES = [
  { prefix: "", strip: "Gambar saya", more: /Kongsi lagi/, out: "Filem anda sudah habis" },
  { prefix: "/en", strip: "My photos", more: /Share more/, out: "You have used all your shots" },
];

async function joinAt(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole("textbox").fill("Kak Long");
  await page.getByRole("button").filter({ hasText: /Teruskan|Continue/ }).click();
  await expect(page.getByRole("checkbox")).toBeVisible();
}

for (const { prefix, strip, more, out } of LOCALES) {
  test(`no horizontal scroll at 360 wide and the dock covers neither names nor controls: consent not agreed, agreed with strip, zero shots (${prefix || "/ms"})`, async ({ page }) => {
    test.setTimeout(90_000);
    // 1. Consent not agreed, then agreed: the panel gives way to one quiet line.
    await joinAt(page, `${prefix}/${slug}`);
    await expectClearOfDock(page, "consent not agreed");
    await page.getByRole("checkbox").check();
    await expectClearOfDock(page, "consent agreed");

    // 2. Agreed with the strip: a photo that fails to send stays in the strip with its retry control.
    await page.route("**/api/e/*/uploads", (route) =>
      route.request().method() === "POST" ? route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: { code: "limit_reached" } }) }) : route.fallback(),
    );
    const buffer = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#3f6b4f" } }).jpeg().toBuffer();
    await page.getByTestId("photo-input").setInputFiles({ name: "strip.jpg", mimeType: "image/jpeg", buffer });
    await expect(page.getByRole("region", { name: strip })).toBeVisible();
    await expect(page.getByRole("region", { name: strip }).getByRole("button")).toBeVisible();
    await expectClearOfDock(page, "agreed with strip");
    await page.unroute("**/api/e/*/uploads");
  });

  test(`the dock covers neither names nor controls when the film is used up (${prefix || "/ms"})`, async ({ page }) => {
    test.setTimeout(90_000);
    await joinAt(page, `${prefix}/${shotsSlug}`);
    await page.getByRole("checkbox").check();
    const buffer = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#7a1f2b" } }).jpeg().toBuffer();
    await page.getByTestId("photo-input").setInputFiles({ name: "only.jpg", mimeType: "image/jpeg", buffer });
    await page.getByRole("button", { name: more }).click({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: out })).toBeDisabled();
    await expect(page.locator("p", { hasText: out })).toBeVisible();
    await expectClearOfDock(page, "zero shots");
  });
}

test("correct PIN shows Galeri without a reload", async ({ page }) => {
  await page.goto(`/${pinSlug}`);
  await page.evaluate(() => {
    (window as unknown as { __kept: boolean }).__kept = true;
  });
  await page.getByLabel("Masukkan PIN daripada tuan rumah").fill(PIN);
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.getByPlaceholder("cth. Mak Cik Kiah").fill("Pak Long");
  await page.getByRole("button", { name: "Teruskan" }).click();
  await expect(page.getByText("Hai, Pak Long!")).toBeVisible();
  await expect(dockOf(page).getByRole("link", { name: "Galeri" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __kept?: boolean }).__kept)).toBe(true);
});