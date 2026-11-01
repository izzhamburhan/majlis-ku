import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { CRON_SECRET } from "./cron-secret";
import { prisma } from "./db";
import { agreeToConsent, createEventAs, signInAs } from "./helpers";

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const bearer = (secret: string) => ({ Authorization: `Bearer ${secret}` });

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** A guest joins by name and sends one photo and one wish, as in guestbook.spec.ts. */
async function guestSendsPhotoAndWish(browser: Browser, slug: string): Promise<void> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(`/${slug}`);
  await guest.getByPlaceholder("cth. Mak Cik Kiah").fill("Tetamu Purge");
  await guest.getByRole("button", { name: "Teruskan" }).click();
  await agreeToConsent(guest);
  const photo = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#d48aa6" } }).jpeg().toBuffer();
  await guest.getByTestId("photo-input").setInputFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(guest.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 30_000 });
  await guest.getByRole("button", { name: "Kongsi lagi" }).click();
  await guest.getByRole("button", { name: "Ucapan" }).click();
  await guest.getByLabel("Ucapan anda").fill("Selamat pengantin baru!");
  await guest.getByRole("button", { name: "Hantar ucapan" }).click();
  await expect(guest.getByRole("heading", { name: "Terima kasih!" })).toBeVisible();
  await context.close();
}

async function openPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

test("purge archives an expired event and deletes guest data", async ({ browser }) => {
  const stamp = Date.now();
  const hostContext = await browser.newContext(DESKTOP);
  const host = await hostContext.newPage();
  const { eventId, slug } = await createEventAs(host, `host-purge-${stamp}@majlisku.test`);
  await guestSendsPhotoAndWish(browser, slug);
  // The RSVP row comes from the fixture: the form needs a Premium plan and a published card, and this test is about the purge.
  await prisma.rsvp.create({ data: { eventId, name: "Tetamu RSVP", attending: true, pax: 2 } });

  // A signed media URL from the host gallery, valid before the purge.
  await host.goto(`/dashboard/events/${eventId}/gallery`);
  const src = await host.getByTestId("gallery-grid").locator("img").first().getAttribute("src");
  const mediaUrl = new URL(src!, host.url()).toString();
  expect((await host.request.get(mediaUrl)).status()).toBe(200);
  expect(await prisma.upload.count({ where: { eventId } })).toBeGreaterThan(0);

  // Retention ends yesterday; the cron route runs the purge. The in-process timer may be mid-run, and a cron call that joins that run
  // returns 200 without having seen this event, so poll for the end state and call again if it is not there yet.
  await prisma.event.update({ where: { id: eventId }, data: { purgeAt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
  const purge = () => host.request.post("/api/cron/purge", { headers: bearer(CRON_SECRET) });
  expect((await purge()).status()).toBe(200);
  await expect
    .poll(
      async () => {
        const { archivedAt } = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { archivedAt: true } });
        if (!archivedAt) expect((await purge()).status()).toBe(200); // the purge is idempotent, so calling again is safe
        return archivedAt !== null;
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  expect((await guest.goto(`/${slug}`))?.status()).toBe(404);
  expect((await guest.request.get(mediaUrl)).status()).toBe(404);
  await host.goto(`/dashboard/events/${eventId}`);
  await expect(host.getByRole("status").filter({ hasText: "Tempoh simpanan tamat. Gambar, video, suara, ucapan dan RSVP tetamu telah dipadam" })).toBeVisible();

  const [uploads, wishes, rsvps, guests, event] = await Promise.all([
    prisma.upload.count({ where: { eventId } }),
    prisma.wish.count({ where: { eventId } }),
    prisma.rsvp.count({ where: { eventId } }),
    prisma.guest.count({ where: { eventId } }),
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
  ]);
  expect({ uploads, wishes, rsvps, guests }).toEqual({ uploads: 0, wishes: 0, rsvps: 0, guests: 0 });
  expect(event.archivedAt).not.toBeNull();

  const adminContext = await browser.newContext(DESKTOP);
  const admin = await adminContext.newPage();
  await signInAs(admin, "admin@majlisku.test");
  await openPage(admin, "/admin/audit");
  await expect(admin.getByRole("row").filter({ hasText: slug }).filter({ hasText: "Dipadam automatik (tempoh simpanan tamat)" })).toHaveCount(1);
  await Promise.all([hostContext.close(), guestContext.close(), adminContext.close()]);
});

test("cron purge needs the secret", async ({ request }) => {
  expect((await request.post("/api/cron/purge", { headers: bearer("wrong-secret-0123456789") })).status()).toBe(401);
  expect((await request.post("/api/cron/purge")).status()).toBe(401);
});

test("PIN attempts are counted in the database", async ({ browser }) => {
  const hostContext = await browser.newContext(DESKTOP);
  const host = await hostContext.newPage();
  const { eventId, slug } = await createEventAs(host, `host-pin-${Date.now()}@majlisku.test`);
  await openPage(host, `/dashboard/events/${eventId}/edit`);
  await host.getByLabel("PIN majlis").fill("2468");
  await host.getByRole("button", { name: "Simpan tetapan" }).click();
  await expect(host.getByRole("status").first()).toHaveText("Disimpan");

  const guestContext = await browser.newContext();
  const pin = (value: string) => guestContext.request.post(`/api/e/${slug}/pin`, { data: { pin: value } });
  const rows = () => prisma.rateLimit.findMany({ where: { key: { startsWith: `pinAttempt:${eventId}:` } } });

  expect((await pin("1111")).status()).toBe(403);
  expect((await pin("1111")).status()).toBe(403);
  const counted = await rows();
  expect(counted).toHaveLength(1);
  expect(counted[0]!.count).toBe(2);

  expect((await pin("2468")).status()).toBe(204);
  expect(await rows()).toHaveLength(0);

  for (let i = 0; i < 5; i++) expect((await pin("1111")).status()).toBe(403);
  const locked = await pin("2468");
  expect(locked.status()).toBe(429);
  expect((await locked.json()).error.code).toBe("locked");
  await Promise.all([hostContext.close(), guestContext.close()]);
});

test("privacy and terms pages in both languages, linked from the guest page footer", async ({ page }) => {
  const pages = [
    { path: "/privacy", title: "Dasar Privasi" },
    { path: "/terms", title: "Terma Perkhidmatan" },
    { path: "/en/privacy", title: "Privacy Policy" },
    { path: "/en/terms", title: "Terms of Service" },
  ];
  for (const { path, title } of pages) {
    expect((await page.goto(path))?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(title);
  }

  await page.goto("/demo-aisyah-daniel");
  await page.getByRole("navigation", { name: "Maklumat undang-undang" }).getByRole("link", { name: "Privasi" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await page.goto("/en/demo-aisyah-daniel");
  await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Terms" }).click();
  await expect(page).toHaveURL(/\/en\/terms$/);
});

test("security headers on pages and API responses", async ({ request }) => {
  for (const path of ["/ms", "/api/health"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["permissions-policy"], path).toBe("camera=(), microphone=(self), geolocation=()");
    expect(headers["content-security-policy"], path).toBe("frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  }
});

test("health route reports ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});
