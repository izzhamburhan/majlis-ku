import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { prisma } from "./db";
import { createEventAs, openDemoEvent, signInAs } from "./helpers";

// The Stori host pages (dashboard, new event, event layout and pages) and the Photobook TV.
// Desktop viewport: a host works on a laptop; the project default is a phone.

const DUSK = "rgb(37, 29, 42)";
const VIEWPORT = { width: 1440, height: 900 };

let state: Awaited<ReturnType<BrowserContext["storageState"]>>;
let eventId = "";
let hostNames = "";

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const created = await createEventAs(page, `stori.host.${Date.now()}.${Math.round(Math.random() * 1e6)}@majlisku.test`, "Majlis Hos");
  eventId = created.eventId;
  hostNames = (await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { hostNames: true } })).hostNames;
  state = await context.storageState();
  await context.close();
});

async function asHost(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: VIEWPORT, storageState: state });
  return { page: await context.newPage(), close: () => context.close() };
}

const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** WCAG contrast of an element's text colour against its own background colour, read from computed styles. */
async function contrastOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((el) => {
    const parse = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number) as [number, number, number];
    const linear = (v: number) => ((v / 255) <= 0.04045 ? v / 255 / 12.92 : (((v / 255) + 0.055) / 1.055) ** 2.4);
    const lum = ([r, g, b]: [number, number, number]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
    const style = getComputedStyle(el);
    const [a, b] = [lum(parse(style.color)), lum(parse(style.backgroundColor))].sort((x, y) => y - x) as [number, number];
    return (a + 0.05) / (b + 0.05);
  });
}

test("dashboard is inside the Stori root", async ({ browser }) => {
  const { page, close } = await asHost(browser);
  await page.goto("/dashboard");
  const root = page.locator("[data-stori]");
  await expect(root).toHaveCount(1);
  await expect(root.getByRole("heading", { level: 1, name: "Majlis saya" })).toBeVisible();
  await expect(root.getByRole("link", { name: "+ Majlis baharu" })).toBeVisible();
  expect(await bodyBackground(page)).toBe(DUSK);
  await close();
});

test("new event form is readable on dusk", async ({ browser }) => {
  const { page, close } = await asHost(browser);
  await page.goto("/dashboard/events/new");
  await expect(page.locator("[data-stori]")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await bodyBackground(page)).toBe(DUSK);
  expect(await contrastOf(page, 'input[name="title"]')).toBeGreaterThanOrEqual(4.5);
  // Submit with nothing filled in to see the error text; it must also read on dusk.
  await page.getByLabel("Tajuk majlis").evaluate((el) => ((el as HTMLInputElement).required = false));
  await page.getByLabel("Nama tuan rumah / pasangan").evaluate((el) => ((el as HTMLInputElement).required = false));
  await page.getByRole("button", { name: "Cipta majlis" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Sila semak" });
  await expect(alert).toBeVisible();
  const [text, background] = await alert.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  expect(text).toBe("rgb(255, 180, 168)");
  expect(background).not.toBe("rgb(255, 255, 255)");
  await close();
});

test("overview shows the venue screen action and keeps the share, QR and usage panels", async ({ browser }) => {
  const { page, close } = await asHost(browser);
  await page.goto(`/dashboard/events/${eventId}`);
  await expect(page.locator("[data-stori]")).toHaveCount(1);
  expect(await bodyBackground(page)).toBe(DUSK);

  // The names h1 stays in the layout, once; the banner does not repeat the names.
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(hostNames);
  const banner = page.getByTestId("event-banner");
  await expect(banner).toBeVisible();
  await expect(banner).not.toContainText(hostNames);
  const action = banner.getByRole("link", { name: "Buka skrin dewan" });
  await expect(action).toHaveAttribute("href", new RegExp(`/slideshow/${eventId}$`));
  // No cover yet: a plain panel with the action, no photo.
  await expect(banner.locator("img")).toHaveCount(0);

  // Everything the overview had before.
  await expect(page.getByTestId("event-url")).toContainText("/");
  await expect(page.getByRole("button", { name: "Salin" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kongsi di WhatsApp" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Kod QR" })).toBeVisible();
  await expect(page.getByTestId("download-png")).toBeVisible();
  await expect(page.getByRole("link", { name: "Pendiri meja A5 (PDF)" })).toBeVisible();
  await expect(page.getByText(/^Pelan: /)).toBeVisible();
  await expect(page.getByTestId("usage-items")).toBeVisible();
  await expect(page.getByText(/^Media disimpan sehingga/)).toBeVisible();

  // The event nav is a pill bar.
  const nav = page.getByRole("navigation", { name: "Event" });
  const current = nav.getByRole("link", { name: "Ringkasan" });
  await expect(current).toHaveAttribute("aria-current", "page");
  expect(parseFloat(await current.evaluate((el) => getComputedStyle(el).borderTopLeftRadius))).toBeGreaterThanOrEqual(20);
  await close();
});

test("overview banner shows the signed cover when the event has one", async ({ browser }) => {
  await prisma.event.update({ where: { id: eventId }, data: { coverKey: `events/${eventId}/cover/test.jpg` } });
  const { page, close } = await asHost(browser);
  try {
    await page.goto(`/dashboard/events/${eventId}`);
    const banner = page.getByTestId("event-banner");
    const cover = banner.locator("img");
    await expect(cover).toHaveCount(1);
    await expect(cover).toHaveAttribute("src", /sig=|signature=|exp=/);
    await expect(banner.getByRole("link", { name: "Buka skrin dewan" })).toBeVisible();
    await expect(banner).not.toContainText(hostNames);
  } finally {
    await prisma.event.update({ where: { id: eventId }, data: { coverKey: null } });
    await close();
  }
});

test("the names heading stays on every sub-page and forms are readable", async ({ browser }) => {
  const { page, close } = await asHost(browser);
  for (const sub of ["gallery", "card", "rsvp", "edit"]) {
    await page.goto(`/dashboard/events/${eventId}/${sub}`);
    await expect(page.locator("[data-stori]"), sub).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 }), sub).toHaveText(hostNames);
    expect(await bodyBackground(page), sub).toBe(DUSK);
  }
  await page.goto(`/dashboard/events/${eventId}/edit`);
  expect(await contrastOf(page, 'input[name="title"]')).toBeGreaterThanOrEqual(4.5);
  expect(await contrastOf(page, 'input[name="hostNames"]')).toBeGreaterThanOrEqual(4.5);
  await close();
});

test("saved and suspended notices read on dusk, not as light panels", async ({ browser }) => {
  const { page, close } = await asHost(browser);
  await page.goto(`/dashboard/events/${eventId}/edit`);
  await page.getByRole("button", { name: "Simpan tetapan" }).click();
  const saved = page.getByRole("status").filter({ hasText: "Disimpan" }).first();
  await expect(saved).toBeVisible();
  const [color, background] = await saved.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  expect(color).toBe("rgb(168, 224, 184)");
  expect(background).toBe("rgb(53, 42, 61)");

  await prisma.event.update({ where: { id: eventId }, data: { status: "SUSPENDED" } });
  try {
    await page.goto(`/dashboard/events/${eventId}`);
    const banner = page.getByRole("status").filter({ hasText: "digantung" });
    await expect(banner).toBeVisible();
    expect(await banner.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(53, 42, 61)");
    expect(await contrastOf(page, "[role=status]")).toBeGreaterThanOrEqual(4.5);
  } finally {
    await prisma.event.update({ where: { id: eventId }, data: { status: "ACTIVE" } });
    await close();
  }
});

test("card builder chrome is dusk and template previews keep their fonts", async ({ browser }) => {
  // The demo event is on the Premium plan, which includes the e-card.
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const demoId = await openDemoEvent(page);
  await page.goto(`/dashboard/events/${demoId}/card`);
  expect(await bodyBackground(page)).toBe(DUSK);
  const previews = page.getByRole("button", { name: /A & D/ });
  await expect(previews.first()).toBeVisible();
  // The preview text uses a literal template font, not the dusk display font (Yeseva One).
  const fonts = await previews.locator("span", { hasText: "A & D" }).evaluateAll((els) => els.map((el) => getComputedStyle(el).fontFamily));
  expect(fonts.length).toBeGreaterThan(0);
  for (const family of fonts) expect(family).not.toContain("Yeseva");
  expect(await contrastOf(page, "textarea")).toBeGreaterThanOrEqual(4.5);
  await context.close();
});

test("admin stays outside the Stori root", async ({ browser }) => {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await signInAs(page, "admin@majlisku.test");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ringkasan");
  await expect(page.locator("[data-stori]")).toHaveCount(0);
  expect(await bodyBackground(page)).not.toBe(DUSK);
  // An admin reading a host's overview sees it in the Stori look, read-only.
  await page.goto(`/dashboard/events/${eventId}`);
  await expect(page.locator("[data-stori]")).toHaveCount(1);
  await expect(page.getByTestId("event-banner").getByRole("link", { name: "Buka skrin dewan" })).toBeVisible();
  await context.close();
});

test("photobook root is Stori and other layouts are not", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const host = await context.newPage();
  const demoId = await openDemoEvent(host);

  await host.goto(`/slideshow/${demoId}?layout=photobook`);
  const book = host.getByTestId("photobook");
  await expect(book).toBeVisible();
  await expect(book).toHaveClass(/\bstori\b/);
  await expect(host.locator(".stori")).toHaveCount(1);
  // The Stori root is the book itself, not a page wrapper.
  await expect(host.locator("[data-stori]")).toHaveCount(0);
  expect(await book.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(DUSK);
  // The controls and the settings button stay outside the book.
  await expect(host.getByRole("button", { name: "Tetapan" })).toBeVisible();
  expect(await host.getByRole("button", { name: "Tetapan" }).evaluate((el) => !!el.closest(".stori"))).toBe(false);
  // The stamp, tape and pressed flower no longer blend with multiply.
  for (const cls of [".pb-cop", ".pb-pressed", ".pb-tape"]) {
    const found = host.locator(cls);
    if ((await found.count()) === 0) continue;
    expect(await found.first().evaluate((el) => getComputedStyle(el).mixBlendMode), cls).toBe("normal");
  }

  for (const layout of ["single", "collage", "film", "mosaic"]) {
    await host.goto(`/slideshow/${demoId}?layout=${layout}`);
    await expect(host.getByTestId("slideshow")).toHaveAttribute("data-layout", layout);
    await expect(host.locator(".stori"), layout).toHaveCount(0);
  }
  await context.close();
});