import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { agreeToConsent, signInAs } from "./helpers";

async function createEvent(host: Page, names: string): Promise<{ eventId: string; slug: string }> {
  await host.getByRole("link", { name: "+ Majlis baharu" }).click();
  await host.getByLabel("Tajuk majlis").fill("Majlis Ujian");
  await host.getByLabel("Nama tuan rumah / pasangan").fill(names);
  await host.getByRole("button", { name: "Cipta majlis" }).click();
  await host.waitForURL(/\/dashboard\/events\/[a-z0-9]+$/);
  const url = (await host.getByTestId("event-url").textContent())!.trim();
  return { eventId: host.url().split("/").pop()!, slug: new URL(url).pathname.slice(1) };
}

test("approval, hide, delete, export, co-host and deleting the event", async ({ browser }) => {
  const stamp = Date.now();
  const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const owner = await ownerContext.newPage();
  await signInAs(owner, `owner-${stamp}@majlisku.test`);
  const { eventId, slug } = await createEvent(owner, `Moderasi ${stamp}`);

  // Approve before showing, gallery public.
  await owner.goto(`/dashboard/events/${eventId}/edit`);
  await owner.getByLabel("Semua tetamu yang ada pautan").check();
  await owner.getByLabel("Luluskan dahulu sebelum dipaparkan").check();
  await owner.getByRole("button", { name: "Simpan tetapan" }).click();
  await expect(owner.getByRole("status").first()).toHaveText("Disimpan");

  // A guest sends a photo and a wish.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/${slug}`);
  await guest.getByPlaceholder("cth. Mak Cik Kiah").fill("Tetamu Ujian");
  await guest.getByRole("button", { name: "Teruskan" }).click();
  await agreeToConsent(guest);
  const photo = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#d48aa6" } }).jpeg().toBuffer();
  await guest.getByTestId("photo-input").setInputFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(guest.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 30_000 });
  await guest.getByRole("button", { name: "Kongsi lagi" }).click();
  await guest.getByRole("button", { name: "Ucapan" }).click();
  await guest.getByLabel("Ucapan anda").fill("Tahniah dan selamat berbahagia!");
  await guest.getByRole("button", { name: "Hantar ucapan" }).click();
  await expect(guest.getByRole("heading", { name: "Terima kasih!" })).toBeVisible();

  // Nothing is public until approved.
  await guest.goto(`/${slug}/gallery`);
  await expect(guest.getByText("Belum ada apa-apa di sini.")).toBeVisible();

  await owner.goto(`/dashboard/events/${eventId}/gallery`);
  await expect(owner.getByTestId("gallery-grid").getByText("Menunggu kelulusan")).toHaveCount(2);
  await owner.getByRole("button", { name: "Luluskan semua (2)" }).click();
  await expect(owner.getByTestId("gallery-grid").getByText("Menunggu kelulusan")).toHaveCount(0);

  await guest.reload();
  await expect(guest.getByTestId("gallery-grid").locator("li")).toHaveCount(2);

  // Hide the photo: it leaves the guest gallery.
  const photoTile = owner.getByTestId("gallery-grid").locator("li").filter({ has: owner.locator("img") });
  await photoTile.getByRole("button", { name: "Sembunyi" }).click();
  await expect(photoTile.getByText("Disembunyikan")).toBeVisible();
  await guest.reload();
  await expect(guest.getByTestId("gallery-grid").locator("li")).toHaveCount(1);

  // Exports
  const zip = await owner.request.get(`/api/events/${eventId}/export/media`);
  expect(zip.status()).toBe(200);
  expect(zip.headers()["content-type"]).toBe("application/zip");
  const zipBody = await zip.body();
  expect(zipBody.subarray(0, 2).toString()).toBe("PK");
  expect(zipBody.includes(Buffer.from("gambar/Tetamu Ujian-"))).toBe(true);
  expect(zipBody.includes(Buffer.from("ucapan.pdf"))).toBe(true);
  const pdf = await owner.request.get(`/api/events/${eventId}/export/wishes`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Delete the photo: the slot comes back.
  owner.once("dialog", (dialog) => void dialog.accept());
  await photoTile.getByRole("button", { name: "Padam" }).click();
  await expect(owner.getByTestId("gallery-grid").locator("img")).toHaveCount(0);
  await owner.goto(`/dashboard/events/${eventId}`);
  await expect(owner.getByTestId("usage-items")).toHaveText("0 / 100 item digunakan");

  // Invite a co-host; they can moderate but not delete the event.
  const cohostEmail = `cohost-${stamp}@majlisku.test`;
  await owner.goto(`/dashboard/events/${eventId}/edit`);
  await owner.getByLabel("E-mel").fill(cohostEmail);
  await owner.getByRole("button", { name: "Jemput" }).click();
  await expect(owner.getByTestId("members")).toContainText(cohostEmail);

  const cohostContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const cohost = await cohostContext.newPage();
  await signInAs(cohost, cohostEmail);
  await expect(cohost.getByText(`Moderasi ${stamp}`)).toBeVisible();
  await cohost.goto(`/dashboard/events/${eventId}/gallery`);
  await expect(cohost.getByRole("button", { name: "Sembunyi" })).toHaveCount(1);
  await cohost.goto(`/dashboard/events/${eventId}/edit`);
  await expect(cohost.getByRole("button", { name: "Padam majlis ini" })).toHaveCount(0);
  await expect(cohost.getByRole("button", { name: "Jemput" })).toHaveCount(0);

  // The owner deletes the event; the guest link stops working.
  await owner.reload();
  await owner.getByLabel(`Taip ${slug} untuk sahkan`).fill("salah");
  await owner.getByRole("button", { name: "Padam majlis ini" }).click();
  await expect(owner.getByText("Teks pengesahan tidak sepadan.")).toBeVisible();
  await owner.getByLabel(`Taip ${slug} untuk sahkan`).fill(slug);
  await owner.getByRole("button", { name: "Padam majlis ini" }).click();
  await owner.waitForURL(/\/dashboard$/);
  const gone = await guest.goto(`/${slug}`);
  expect(gone?.status()).toBe(404);

  await Promise.all([ownerContext.close(), guestContext.close(), cohostContext.close()]);
});