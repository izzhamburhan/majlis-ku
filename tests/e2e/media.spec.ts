import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { joinAsGuest, openDemoEvent } from "./helpers";

const run = promisify(execFile);

async function testVideo(): Promise<Buffer> {
  const out = join(tmpdir(), `majlis-e2e-${Date.now()}.mp4`);
  await run(ffmpegPath!, ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=15",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out]);
  return readFile(out);
}

test("guest sends a video and a voice message; both are processed and shown to the host", async ({ browser }) => {
  const stamp = Date.now();
  const guestName = `Pak Mat ${stamp}`;
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinAsGuest(guest, guestName);

  // Video
  await guest.getByRole("button", { name: "Video" }).click();
  const consent = guest.getByLabel("Saya faham dan bersetuju");
  if (!(await consent.isChecked())) await consent.check();
  await guest.getByTestId("video-input").setInputFiles({ name: "majlis.mp4", mimeType: "video/mp4", buffer: await testVideo() });
  await expect(guest.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 30_000 });
  await expect(guest.getByText("Ia sedang diproses")).toBeVisible();

  // Voice, recorded with Chromium's fake microphone.
  await guest.getByRole("button", { name: "Kongsi lagi" }).click();
  await guest.getByRole("button", { name: "Suara" }).click();
  await guest.getByRole("button", { name: "Mula rakam" }).click();
  await expect(guest.getByText(/Merakam…/)).toBeVisible();
  await guest.waitForTimeout(2000);
  await guest.getByRole("button", { name: "Berhenti" }).click();
  await guest.getByRole("button", { name: "Hantar mesej suara" }).click();
  await expect(guest.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 30_000 });

  // Host sees both once processing finishes.
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  const eventId = await openDemoEvent(host);
  await host.goto(`/dashboard/events/${eventId}/gallery?q=${encodeURIComponent(guestName)}`);
  await expect
    .poll(
      async () => {
        await host.reload();
        const grid = host.getByTestId("gallery-grid");
        return { videos: await grid.locator("video").count(), audios: await grid.locator("audio").count() };
      },
      { timeout: 60_000, intervals: [1000, 2000, 3000] },
    )
    .toEqual({ videos: 1, audios: 1 });

  await Promise.all([guestContext.close(), hostContext.close()]);
});

test("the host gallery and the slideshow receive a new photo live", async ({ browser }) => {
  const stamp = Date.now();
  const guestName = `Live ${stamp}`;
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await hostContext.newPage();
  const eventId = await openDemoEvent(host);

  await host.goto(`/dashboard/events/${eventId}/gallery`);
  await expect(host.getByTestId("live-status")).toHaveAttribute("data-connected", "true");

  const slideshowPage = await hostContext.newPage();
  await slideshowPage.goto(`/slideshow/${eventId}`);
  await expect(slideshowPage.getByTestId("slideshow")).toBeVisible();

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinAsGuest(guest, guestName);
  await guest.getByRole("button", { name: "Gambar" }).click();
  const consent = guest.getByLabel("Saya faham dan bersetuju");
  if (!(await consent.isChecked())) await consent.check();
  const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#3f6b4f" } }).jpeg().toBuffer();
  await guest.getByTestId("photo-input").setInputFiles({ name: "live.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(guest.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 30_000 });

  // No reload: the new tile arrives over SSE.
  await expect(host.getByTestId("live-items").getByText(`oleh ${guestName}`)).toBeVisible({ timeout: 15_000 });
  // The slideshow shows new arrivals next.
  await expect(slideshowPage.getByText(`oleh ${guestName}`)).toBeVisible({ timeout: 15_000 });

  await Promise.all([guestContext.close(), hostContext.close()]);
});