import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { prisma } from "./db";
import { agreeToConsent, createEventAs, SLUG } from "./helpers";

const photo = (colour: string) => sharp({ create: { width: 640, height: 480, channels: 3, background: colour } }).jpeg().toBuffer();

test("a tap before the page has loaded its script never puts the guest's name in the URL", async ({ browser }) => {
  const context = await browser.newContext();
  const guest = await context.newPage();
  // No client JavaScript at all: the page stays as the server rendered it.
  await guest.route(/\/_next\/static\/.*\.js/, (route) => route.abort());
  await guest.goto(`/${SLUG}`);
  const nameBox = guest.getByPlaceholder("cth. Mak Cik Kiah");
  await nameBox.fill("Tetamu Awal");
  await nameBox.press("Enter");
  await guest.getByRole("button", { name: "Teruskan" }).click({ force: true }).catch(() => undefined);
  await guest.waitForTimeout(1000);
  expect(guest.url()).not.toContain("displayName");
  expect(guest.url()).not.toContain("Tetamu");
  await context.close();
});

test("with a shot limit, the guest sees the shots left and the server refuses one more photo", async ({ browser }) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  const { eventId, slug } = await createEventAs(host, `kamera.${Date.now()}@majlisku.test`, "Majlis Kamera");
  await prisma.event.update({ where: { id: eventId }, data: { shotsPerGuest: 1 } });

  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(`/${slug}`);
  await guest.getByPlaceholder("cth. Mak Cik Kiah").fill("Kak Long");
  await guest.getByRole("button", { name: "Teruskan" }).click();
  await expect(guest.getByText("Hai, Kak Long!")).toBeVisible();
  await agreeToConsent(guest);
  await expect(guest.getByText("1 / 1 keping lagi")).toBeVisible();

  // Two photos picked, one shot left: only one is sent.
  await guest.getByTestId("photo-input").setInputFiles([
    { name: "a.jpg", mimeType: "image/jpeg", buffer: await photo("#7a1f2b") },
    { name: "b.jpg", mimeType: "image/jpeg", buffer: await photo("#c9a227") },
  ]);
  await expect(guest.getByText("1 gambar tidak dihantar kerana filem sudah habis.")).toBeVisible();
  await expect(guest.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 30_000 });
  await guest.getByRole("button", { name: "Kongsi lagi" }).click();
  // The words show on the page and the shutter button says the same to a screen reader.
  await expect(guest.locator("p", { hasText: "Filem anda sudah habis" })).toBeVisible();
  await expect(guest.getByRole("button", { name: "Filem anda sudah habis" })).toBeDisabled();
  // Wishes still work.
  await expect(guest.getByRole("button", { name: "Ucapan" })).toBeEnabled();

  // The server enforces the limit, whatever the page shows.
  const response = await guest.request.post(`/api/e/${slug}/uploads`, { data: { kind: "PHOTO", mimeType: "image/jpeg", sizeBytes: 1000 } });
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "shots_used_up" } });

  await context.close();
  await hostContext.close();
});
