import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { agreeToConsent, signInAs } from "./helpers";

async function photo(color: string) {
  return sharp({ create: { width: 1200, height: 900, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
}

test("host creates an event; a guest adds a photo and a wish; the host sees both", async ({ browser }) => {
  const stamp = Date.now();
  const hostEmail = `host-gb-${stamp}@majlisku.test`;
  const names = `Siti & Amir ${stamp}`;

  // Host: create the event.
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signInAs(host, hostEmail);
  await host.getByRole("link", { name: "+ Majlis baharu" }).click();
  await host.getByLabel("Tajuk majlis").fill("Majlis Perkahwinan");
  await host.getByLabel("Nama tuan rumah / pasangan").fill(names);
  await host.getByLabel("Nama tempat").fill("Dewan Contoh");
  await host.getByRole("button", { name: "Cipta majlis" }).click();
  await host.waitForURL(/\/dashboard\/events\/[a-z0-9]+$/);
  const eventUrl = (await host.getByTestId("event-url").textContent())!.trim();
  const slug = new URL(eventUrl).pathname.slice(1);
  expect(slug).toMatch(/^siti-dan-amir-\d+-[a-z0-9]{5}$/);

  // QR downloads work for the host.
  const png = await host.request.get(`${host.url().replace(/\/dashboard.*/, "")}/api/events/${host.url().split("/").pop()}/qr?format=png`);
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");

  // Make the gallery visible to guests.
  await host.getByRole("link", { name: "Tetapan" }).click();
  await host.getByLabel("Semua tetamu yang ada pautan").check();
  await host.getByRole("button", { name: "Simpan tetapan" }).click();
  await expect(host.getByRole("status")).toHaveText("Disimpan");

  // Guest: no account, just a name.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/${slug}`);
  await expect(guest.getByRole("heading", { level: 1 })).toHaveText(names);
  await guest.getByPlaceholder("cth. Mak Cik Kiah").fill("Mak Cik Kiah");
  await guest.getByRole("button", { name: "Teruskan" }).click();
  await expect(guest.getByText("Hai, Mak Cik Kiah!")).toBeVisible();

  await agreeToConsent(guest);
  await guest.getByTestId("photo-input").setInputFiles([
    { name: "satu.jpg", mimeType: "image/jpeg", buffer: await photo("#c9a227") },
    { name: "dua.jpg", mimeType: "image/jpeg", buffer: await photo("#7a1f2b") },
  ]);
  await expect(guest.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 30_000 });

  await guest.getByRole("button", { name: "Kongsi lagi" }).click();
  await guest.getByRole("button", { name: "Ucapan" }).click();
  await guest.getByLabel("Ucapan anda").fill("Selamat pengantin baru!");
  await guest.getByRole("button", { name: "Hantar ucapan" }).click();
  await expect(guest.getByRole("heading", { name: "Terima kasih!" })).toBeVisible();

  // Guest gallery is public for this event.
  await guest.getByRole("link", { name: "Lihat galeri" }).click();
  await expect(guest.getByTestId("gallery-grid").locator("li")).toHaveCount(3);

  // Host gallery: two photos and the wish, with filters.
  await host.getByRole("link", { name: "Galeri" }).click();
  const grid = host.getByTestId("gallery-grid");
  await expect(grid.locator("li")).toHaveCount(3);
  await expect(grid.getByText("“Selamat pengantin baru!”")).toBeVisible();
  await host.getByRole("link", { name: "Ucapan", exact: true }).click();
  await expect(grid.locator("li")).toHaveCount(1);
  await host.getByRole("link", { name: "Gambar", exact: true }).click();
  await expect(grid.locator("img")).toHaveCount(2);

  // Usage meter counts the photos.
  await host.getByRole("link", { name: "Ringkasan" }).click();
  await expect(host.getByTestId("usage-items")).toHaveText("2 / 100 item digunakan");

  // Another host cannot see this event.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signInAs(other, `other-${stamp}@majlisku.test`);
  const response = await other.goto(host.url());
  expect(response?.status()).toBe(404);

  await Promise.all([hostContext.close(), guestContext.close(), otherContext.close()]);
});

test("a private gallery is not visible to guests and a fake file is rejected", async ({ page, request }) => {
  // The demo event's gallery is private by default.
  const response = await page.goto("/demo-aisyah-daniel/gallery");
  expect(response?.status()).toBe(404);

  // Join as a guest, then try to upload text pretending to be a JPEG.
  await page.goto("/demo-aisyah-daniel");
  await page.getByPlaceholder("cth. Mak Cik Kiah").fill("Penguji");
  await page.getByRole("button", { name: "Teruskan" }).click();
  await expect(page.getByText("Hai, Penguji!")).toBeVisible();
  const start = await page.request.post("/api/e/demo-aisyah-daniel/uploads", {
    data: { kind: "PHOTO", mimeType: "image/jpeg", sizeBytes: 20 },
  });
  expect(start.status(), await start.text()).toBe(201);
  const { uploadId, url } = (await start.json()) as { uploadId: string; url: string };
  const put = await page.request.put(url, { data: Buffer.from("this is not a photo!"), headers: { "Content-Type": "image/jpeg" } });
  expect(put.status()).toBe(204);
  const complete = await page.request.post(`/api/e/demo-aisyah-daniel/uploads/${uploadId}/complete`);
  expect(complete.status()).toBe(422);
  expect((await complete.json()).error.code).toBe("invalid_file");

  // Without the guest cookie the upload API refuses.
  const anonymous = await request.post("/api/e/demo-aisyah-daniel/uploads", { data: { kind: "PHOTO", mimeType: "image/jpeg", sizeBytes: 20 } });
  expect(anonymous.status()).toBe(401);
});