import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { createEventAs, joinAsGuest, openDemoEvent, SLUG } from "./helpers";

const EMPTY = "Menunggu kenangan pertama…";

/** The demo host on a 1280 x 720 screen, as on a venue laptop. */
async function startHost(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await context.newPage();
  const eventId = await openDemoEvent(host);
  return { context, host, eventId };
}

async function guestSends(browser: Browser, name: string, send: (guest: Page) => Promise<void>, slug = SLUG) {
  const context = await browser.newContext();
  const guest = await context.newPage();
  if (slug === SLUG) await joinAsGuest(guest, name);
  else {
    // joinAsGuest is fixed to the demo event: same steps for another event's page
    await guest.goto(`/${slug}`);
    await guest.getByPlaceholder("cth. Mak Cik Kiah").fill(name);
    await guest.getByRole("button", { name: "Teruskan" }).click();
    await expect(guest.getByText(`Hai, ${name}!`)).toBeVisible();
  }
  await send(guest);
  await expect(guest.getByRole("heading", { name: "Terima kasih!" })).toBeVisible({ timeout: 30_000 });
  await context.close();
}

const agree = async (guest: Page) => {
  const consent = guest.getByLabel("Saya faham dan bersetuju");
  if (!(await consent.isChecked())) await consent.check();
};

const sendWish = (text: string) => async (guest: Page) => {
  await guest.getByRole("button", { name: "Ucapan" }).click();
  await agree(guest);
  await guest.getByLabel("Ucapan anda").fill(text);
  await guest.getByRole("button", { name: "Hantar ucapan" }).click();
};

const sendPhoto = (width: number, height: number) => async (guest: Page) => {
  await guest.getByRole("button", { name: "Gambar" }).click();
  await agree(guest);
  const buffer = await sharp({ create: { width, height, channels: 3, background: "#3f6b4f" } }).jpeg().toBuffer();
  await guest.getByTestId("photo-input").setInputFiles({ name: "slide.jpg", mimeType: "image/jpeg", buffer });
};

test("invalid options fall back to the defaults", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  await host.goto(`/slideshow/${eventId}?layout=spiral&names=yes`);
  await expect(host.getByTestId("slideshow")).toHaveAttribute("data-layout", "single");
  await expect(host.getByRole("button", { name: "Tetapan" })).toBeVisible();
  await context.close();
});

test("settings change the layout without a reload", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  await host.goto(`/slideshow/${eventId}`);
  await hydrated(host);
  await host.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));
  const button = host.getByRole("button", { name: "Tetapan" });
  await button.click();
  const dialog = host.getByRole("dialog", { name: "Tetapan" });
  await expect(dialog).toBeVisible();
  await expect(host.getByRole("radio", { name: "Satu demi satu" })).toBeFocused();
  await host.getByRole("radio", { name: "Mozek" }).check();
  await expect(host.getByTestId("slideshow")).toHaveAttribute("data-layout", "mosaic");
  expect(host.url()).toContain("layout=mosaic");
  for (const name of ["Bingkai cetak", "Tunjuk nama tetamu", "Panel QR & ucapan"]) await host.getByRole("checkbox", { name }).click();
  await expect.poll(() => host.url()).toContain("frame=print");
  expect(host.url()).toContain("names=0");
  expect(host.url()).toContain("rail=1");
  await expect(host.getByTestId("slideshow")).toHaveAttribute("data-layout", "mosaic");
  expect(await host.evaluate(() => (window as unknown as { __marker: number }).__marker)).toBe(1);
  await host.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  await context.close();
});

test("rail shows a new wish and the main area does not", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  await host.goto(`/slideshow/${eventId}?rail=1`);
  const rail = host.getByTestId("slideshow-rail");
  await expect(rail).toBeVisible();
  const text = `Selamat pengantin baru ${Date.now()}`;
  await guestSends(browser, `Rail ${Date.now()}`, sendWish(text));
  await expect(rail.getByText(text).first()).toBeVisible({ timeout: 15_000 }); // the list may be doubled for the loop
  await host.waitForTimeout(8000); // longer than a slide: it must still not reach the main area
  await expect(host.getByTestId("slideshow-main").getByText(text)).toHaveCount(0);
  await context.close();
});

test("names=0 hides guest names", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  await host.goto(`/slideshow/${eventId}?names=0`);
  const guestName = `Tanpa Nama ${Date.now()}`;
  await guestSends(browser, guestName, sendPhoto(777, 555));
  // The new photo comes next; its size tells it apart from the demo photos.
  await expect
    .poll(
      () => host.getByTestId("slideshow-main").locator("img").evaluateAll((imgs) => imgs.some((i) => (i as HTMLImageElement).naturalWidth === 777)),
      { timeout: 20_000 },
    )
    .toBe(true);
  await expect(host.getByText(`oleh ${guestName}`)).toHaveCount(0);
  await expect(host.getByText(guestName)).toHaveCount(0);
  await context.close();
});

test("the slideshow refreshes signed URLs every 20 minutes", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  // Slides must change for the old bug to show, so make sure there are at least two items.
  for (const n of [1, 2]) await guestSends(browser, `Segar ${Date.now()}`, sendWish(`Ucapan segar ${n} ${Date.now()}`));
  await host.clock.install();
  await host.goto(`/slideshow/${eventId}`);
  await expect(host.getByTestId("slideshow")).toBeVisible();
  // Slide changes restart a per-slide interval in the old code; the last restart is at about 28 s.
  for (let i = 0; i < 3; i++) await host.clock.runFor(10_000);
  const refreshed = host.waitForRequest((r) => new URL(r.url()).pathname === `/api/events/${eventId}/slideshow`);
  await host.clock.fastForward("19:40"); // 30 s + 19:40 is past 20:00 from load, but not 20:00 from the last slide change
  await refreshed;
  await context.close();
});

test("the slideshow clears when access ends", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  await guestSends(browser, `Segar ${Date.now()}`, sendWish(`Ucapan sebelum ${Date.now()}`)); // so the empty text is not there already
  await host.route("**/api/events/*/slideshow", (route) => route.fulfill({ status: 404, body: "{}" }));
  await host.addInitScript(() => {
    const w = window as unknown as { __esClosed: boolean; EventSource: typeof EventSource };
    const Native = w.EventSource;
    w.__esClosed = false;
    w.EventSource = class extends Native {
      close() {
        w.__esClosed = true;
        super.close();
      }
    };
  });
  await host.clock.install();
  await host.goto(`/slideshow/${eventId}`);
  await expect(host.getByTestId("slideshow")).toBeVisible();
  await host.clock.fastForward("20:00");
  await expect(host.getByText(EMPTY)).toBeVisible();
  await expect(host.getByTestId("slideshow-main").locator("img")).toHaveCount(0);
  expect(await host.evaluate(() => (window as unknown as { __esClosed: boolean }).__esClosed)).toBe(true);
  await context.close();
});

test("the slideshow stream refuses an unknown view", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  const response = await host.request.get(`/api/events/${eventId}/stream?view=tv`);
  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe("validation");
  await context.close();
});

/** Layout images only: the spotlight is a separate, large image on top. */
const layoutImages = (host: Page) =>
  host.getByTestId("slideshow-main").locator("img").evaluateAll((imgs) => imgs.filter((i) => !i.closest('[data-testid="spotlight"]')).length);

/** React has attached to the page, so effects and timers are running. */
const hydrated = (host: Page) =>
  host.waitForFunction(() => Object.keys(document.querySelector('[data-testid="slideshow"]') ?? {}).some((k) => k.startsWith("__reactProps")));

test("a new photo is spotlit, then joins the mosaic", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  await host.goto(`/slideshow/${eventId}?layout=mosaic`);
  await expect(host.getByTestId("slideshow")).toHaveAttribute("data-layout", "mosaic");
  const guestName = `Sorotan ${Date.now()}`;
  await guestSends(browser, guestName, sendPhoto(777, 555));
  const spotlight = host.getByTestId("spotlight");
  await expect(spotlight).toContainText(guestName, { timeout: 15_000 });
  const id = await spotlight.getAttribute("data-item-id");
  // The spotlight must not cover the controls. A short timeout: the spotlight ends by itself after about 5 s.
  await host.getByRole("button", { name: "Tetapan" }).click({ timeout: 2000 });
  await expect(host.getByRole("dialog", { name: "Tetapan" })).toBeVisible();
  await host.keyboard.press("Escape");
  await expect(host.getByRole("dialog")).toBeHidden();
  await expect(spotlight).toBeHidden({ timeout: 10_000 }); // about 5 s
  const tile = host.getByTestId("slideshow-main").locator(`[data-item-id="${id}"] img`);
  await expect(tile).toBeVisible();
  // The tile is the 400 px thumbnail, not the 777 px display image.
  await expect.poll(() => tile.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await tile.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeLessThanOrEqual(400);
  await context.close();
});

test("multi layouts render no video element and at most 12 images", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  await guestSends(browser, `Gambar ${Date.now()}`, sendPhoto(640, 480)); // so there is at least one image
  for (const layout of ["collage", "film", "mosaic"]) {
    await host.goto(`/slideshow/${eventId}?layout=${layout}`);
    await expect.poll(() => layoutImages(host), { message: layout }).toBeGreaterThan(0);
    expect(await host.getByTestId("slideshow-main").locator("video").count(), layout).toBe(0);
    expect(await layoutImages(host), layout).toBeLessThanOrEqual(12);
  }
  await context.close();
});

test("every layout fits the screen, the rail text is large, and nothing sits under the controls", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  const inside = (b: { x: number; y: number; width: number; height: number }, o: { x: number; y: number; width: number; height: number }) =>
    b.x >= o.x - 1 && b.y >= o.y - 1 && b.x + b.width <= o.x + o.width + 1 && b.y + b.height <= o.y + o.height + 1;
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await host.setViewportSize(size);
    const screen = { x: 0, y: 0, ...size };
    for (const layout of ["collage", "film", "mosaic", "single"]) {
      for (const rail of ["0", "1"]) {
        const where = `${layout} rail=${rail} at ${size.width}`;
        await host.goto(`/slideshow/${eventId}?layout=${layout}&rail=${rail}&frame=print`);
        await expect(host.getByTestId("slideshow")).toHaveAttribute("data-layout", layout);
        await hydrated(host);
        const main = await host.getByTestId("slideshow-main").boundingBox();
        expect(main && inside(main, screen), `${where}: main area outside the screen`).toBe(true);
        if (rail === "1") {
          const railBox = await host.getByTestId("slideshow-rail").boundingBox();
          expect(railBox && inside(railBox, screen), `${where}: rail outside the screen`).toBe(true);
          const parts = await host.getByTestId("slideshow-rail").evaluate((aside) => {
            const box = aside.getBoundingClientRect();
            const out = { children: [] as { tag: string; inside: boolean }[], scanSize: 0, wishSize: 0 };
            for (const child of [...aside.children].filter((c) => c.getAttribute("data-testid") !== "rail-viewport")) {
              const r = child.getBoundingClientRect();
              out.children.push({ tag: child.tagName, inside: r.x >= box.x - 1 && r.y >= box.y - 1 && r.right <= box.right + 1 && r.bottom <= box.bottom + 1 });
            }
            out.scanSize = parseFloat(getComputedStyle(aside.children[2]!).fontSize);
            const wish = aside.querySelector("li p");
            out.wishSize = wish ? parseFloat(getComputedStyle(wish).fontSize) : 24;
            return out;
          });
          for (const c of parts.children) expect(c.inside, `${where}: rail <${c.tag}> is clipped`).toBe(true);
          expect(parts.scanSize, `${where}: scan text size`).toBeGreaterThanOrEqual(24);
          expect(parts.wishSize, `${where}: wish text size`).toBeGreaterThanOrEqual(24);
        }
        // The controls sit in a band of their own: no image under them.
        const button = await host.getByRole("button", { name: "Tetapan" }).boundingBox();
        const boxes = await host.getByTestId("slideshow-main").locator("img").evaluateAll((imgs) =>
          imgs.map((i) => {
            const r = i.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          }),
        );
        for (const b of boxes) {
          const apart = !button || b.x >= button.x + button.width || b.x + b.width <= button.x || b.y >= button.y + button.height || b.y + b.height <= button.y;
          expect(apart, `${where}: an image is under the Settings button`).toBe(true);
        }
      }
    }
  }
  await context.close();
});

test("settings dialog keeps focus inside and closes on Escape", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  await host.goto(`/slideshow/${eventId}`);
  await hydrated(host);
  const button = host.getByRole("button", { name: "Tetapan" });
  await button.click();
  const dialog = host.getByRole("dialog", { name: "Tetapan" });
  await expect(dialog).toBeVisible();
  await host.getByRole("radio", { name: "Kolaj" }).check();
  const focusInside = () => host.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
  for (const key of [...Array(6).fill("Shift+Tab"), ...Array(10).fill("Tab")]) {
    await host.keyboard.press(key);
    expect(await focusInside(), `after ${key}`).toBe(true);
  }
  await dialog.getByRole("heading", { name: "Tetapan" }).click();
  await host.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  await context.close();
});

test("reduced-motion rail shows only wishes that fit", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  for (const n of [1, 2, 3]) await guestSends(browser, `Muat ${Date.now()}`, sendWish(`Ucapan untuk panel sisi nombor ${n}, harap majlis ini penuh berkat dan kenangan indah ${Date.now()}`));
  await host.emulateMedia({ reducedMotion: "reduce" });
  await host.goto(`/slideshow/${eventId}?rail=1`);
  await hydrated(host);
  const viewport = host.getByTestId("rail-viewport");
  await expect(viewport.locator("li").first()).toBeVisible();
  const clipped = await host.getByTestId("slideshow-rail").evaluate((aside) => {
    const box = aside.querySelector('[data-testid="rail-viewport"]')!.getBoundingClientRect();
    const items = [...aside.querySelectorAll("li")].filter((li) => !li.closest("[aria-hidden=true]")); // the hidden copy only measures
    return { count: items.length, outside: items.filter((li) => li.getBoundingClientRect().bottom > box.bottom + 1 || li.getBoundingClientRect().top < box.top - 1).length };
  });
  expect(clipped.count).toBeGreaterThan(0);
  expect(clipped.outside).toBe(0);
  await context.close();
});

test("print frame shows the guest name once", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  await host.goto(`/slideshow/${eventId}?layout=single&frame=print`);
  const guestName = `Bingkai ${Date.now()}`;
  await guestSends(browser, guestName, sendPhoto(555, 777)); // a portrait photo
  const main = host.getByTestId("slideshow-main");
  await expect
    .poll(() => main.locator("img").evaluateAll((imgs) => imgs.some((i) => (i as HTMLImageElement).naturalWidth === 555)), { timeout: 20_000 })
    .toBe(true);
  await expect(host.getByText(guestName)).toHaveCount(1); // the margin only: no second caption in the main area or the bottom bar
  const frame = await main.locator("figure").boundingBox();
  const image = await main.locator("img").first().boundingBox();
  expect(frame && image && frame.width - image.width <= 40).toBe(true); // the frame hugs the photo
  await context.close();
});

test("reduced motion stops the film animation", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  for (const n of [1, 2]) await guestSends(browser, `Gerak ${Date.now()}`, sendWish(`Ucapan gerak ${n} ${Date.now()}`)); // two distinct items at least
  await host.emulateMedia({ reducedMotion: "reduce" });
  await host.clock.install();
  await host.goto(`/slideshow/${eventId}?layout=film`);
  const track = host.getByTestId("film-track");
  await expect(track).toBeVisible();
  await hydrated(host);
  await expect(track).toHaveCSS("animation-name", "none");
  const first = () => track.locator("> *").first().getAttribute("data-item-id");
  const before = await first();
  await host.clock.runFor(4100);
  await expect.poll(first).not.toBe(before);
  await context.close();
});

test("a second upload shows even when only one item was there", async ({ browser }) => {
  test.setTimeout(120_000); // sign-in, two guests and an 8 s wait
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await context.newPage();
  const { eventId, slug } = await createEventAs(host, `solo.${Date.now()}@majlisku.test`);
  await host.goto(`/slideshow/${eventId}`);
  await hydrated(host);
  const main = host.getByTestId("slideshow-main");
  const first = `Ucapan pertama ${Date.now()}`;
  await guestSends(browser, `Satu ${Date.now()}`, sendWish(first), slug);
  await expect(main.getByText(first)).toBeVisible({ timeout: 15_000 });
  await host.waitForTimeout(8000); // longer than a slide: the first timer has fired, and with one item the slide did not change
  const second = `Ucapan kedua ${Date.now()}`;
  await guestSends(browser, `Dua ${Date.now()}`, sendWish(second), slug);
  await expect(main.getByText(second)).toBeVisible({ timeout: 15_000 }); // the 7 s slide timer plus margin
  await context.close();
});

test("the slideshow stream sends no original links", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  type Win = { __abort: AbortController; __ready: number; __items: Promise<string>[] };
  await host.evaluate((id) => {
    const w = window as unknown as Win;
    w.__abort = new AbortController();
    w.__ready = 0;
    // Resolves with the data line of the first `event: item`, or "" if the stream ends or is aborted.
    const firstItem = async (url: string) => {
      try {
        const reader = (await fetch(url, { signal: w.__abort.signal })).body!.pipeThrough(new TextDecoderStream()).getReader();
        let text = "";
        let ready = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return "";
          text += value;
          if (!ready && text.includes("event: ready")) {
            ready = true;
            w.__ready += 1;
          }
          const match = /event: item\ndata: (.*)\n/.exec(text);
          if (match) return match[1]!;
        }
      } catch {
        return "";
      }
    };
    w.__items = [firstItem(`/api/events/${id}/stream?view=slideshow`), firstItem(`/api/events/${id}/stream`)];
  }, eventId);
  await host.waitForFunction(() => (window as unknown as Win).__ready === 2);
  await guestSends(browser, `Asal ${Date.now()}`, sendPhoto(640, 480));
  const [slideshow, hostStream] = await host.evaluate(() => Promise.all((window as unknown as Win).__items));
  await host.evaluate(() => (window as unknown as Win).__abort.abort()); // close both readers
  expect(slideshow).toContain('"originalUrl":null');
  expect(hostStream).toMatch(/"originalUrl":"[^"]+"/);
  await context.close();
});

test("reduced motion straightens the collage", async ({ browser }) => {
  const { context, host, eventId } = await startHost(browser);
  await host.emulateMedia({ reducedMotion: "reduce" });
  await host.goto(`/slideshow/${eventId}?layout=collage`);
  await hydrated(host);
  const cards = host.getByTestId("slideshow-main").locator('[data-item-id]:not([data-testid="spotlight"])');
  await expect(cards.first()).toBeVisible();
  // matrix(a, b, c, d, ...): a rotation shows up as b and c away from 0
  const tilt = () =>
    cards.evaluateAll((els) => Math.max(...els.map((e) => { const m = new DOMMatrix(getComputedStyle(e).transform); return Math.max(Math.abs(m.b), Math.abs(m.c)); })));
  await expect.poll(tilt).toBeLessThan(0.001);
  await context.close();
});
