import { expect, test, type Browser, type Page } from "@playwright/test";
import { prisma } from "./db";
import { agreeToConsent, createEventAs } from "./helpers";

// The Stori guest page: a full-bleed cover, a floating dock and dusk sheets. Phone viewport (360 x 740) from the config.

let slug = "";
let pinSlug = "";

const PIN = "2468";

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** A free-plan event whose gallery is open to guests; with `pin`, guests must enter it first. */
async function makeEvent(browser: Browser, pin?: string): Promise<string> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const host = await context.newPage();
  const created = await createEventAs(host, `stori.${Date.now()}.${Math.round(Math.random() * 1e6)}@majlisku.test`, "Majlis Stori");
  if (pin) {
    await host.goto(`/dashboard/events/${created.eventId}/edit`);
    await host.getByLabel("PIN majlis").fill(pin);
    await host.getByRole("button", { name: "Simpan tetapan" }).click();
    await expect(host.getByRole("status").first()).toHaveText("Disimpan");
  }
  await prisma.event.update({ where: { id: created.eventId }, data: { galleryVisibility: "GUESTS" } });
  await context.close();
  return created.slug;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  slug = await makeEvent(browser);
  pinSlug = await makeEvent(browser, PIN);
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

for (const locale of ["", "/en"]) {
  test(`no horizontal scroll at 360 wide and the dock covers neither names nor consent (${locale || "/ms"})`, async ({ page }) => {
    await page.goto(`${locale}/${slug}`);
    await page.getByRole("textbox").fill("Kak Long");
    await page.getByRole("button").filter({ hasText: /Teruskan|Continue/ }).click();
    const consent = page.getByRole("checkbox");
    for (const agreed of [false, true]) {
      if (agreed) await consent.check();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // The raised shutter sticks out above the dock.
      const dockBox = await page.getByTestId("guest-dock").boundingBox();
      const shutterBox = await page.getByTestId("guest-shutter").boundingBox();
      const dock = { y: Math.min(dockBox!.y, shutterBox!.y) };
      const h1 = await page.getByRole("heading", { level: 1 }).boundingBox();
      const box = await consent.boundingBox();
      expect(h1!.y + h1!.height).toBeLessThanOrEqual(dock.y);
      expect(box!.y + box!.height).toBeLessThanOrEqual(dock.y);
    }
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