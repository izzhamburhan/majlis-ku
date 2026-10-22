import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

const MAIL_LOG = join(process.cwd(), ".data", "dev-mail.log");

/** The newest development sign-in link sent to `email` (the app writes them to .data/dev-mail.log). */
export async function latestSignInLink(email: string, after: Date): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const text = await readFile(MAIL_LOG, "utf8").catch(() => "");
    const entry = text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { to: string; url: string; at: string })
      .filter((e) => e.to === email && new Date(e.at) >= after)
      .at(-1);
    if (entry) return entry.url;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No sign-in link for ${email}`);
}

/** Sign in as a host through the real magic-link flow. */
export async function signInAs(page: Page, email: string): Promise<void> {
  const started = new Date(Date.now() - 1000);
  await page.goto("/signin");
  await page.getByLabel("E-mel").fill(email);
  await page.getByRole("button", { name: "Hantar pautan log masuk" }).click();
  await page.waitForURL(/check-email/);
  await page.goto(await latestSignInLink(email, started));
  await page.waitForURL(/dashboard/);
}

/** Sign in as `email`, create an event through the UI, and return its id and guest slug. */
export async function createEventAs(page: Page, email: string, title = "Majlis Ujian"): Promise<{ eventId: string; slug: string }> {
  await signInAs(page, email);
  await page.getByRole("link", { name: "+ Majlis baharu" }).click();
  await page.getByLabel("Tajuk majlis").fill(title);
  await page.getByLabel("Nama tuan rumah / pasangan").fill(`Tuan Rumah ${Date.now()}`);
  await page.getByRole("button", { name: "Cipta majlis" }).click();
  await page.waitForURL(/\/dashboard\/events\/[a-z0-9]+$/);
  const url = (await page.getByTestId("event-url").textContent())!.trim();
  return { eventId: page.url().split("/").pop()!, slug: new URL(url).pathname.slice(1) };
}

export const SLUG = "demo-aisyah-daniel"; // seeded on the Premium plan

export async function joinAsGuest(page: Page, name: string) {
  await page.goto(`/${SLUG}`);
  const nameBox = page.getByPlaceholder("cth. Mak Cik Kiah");
  if (await nameBox.isVisible()) {
    await nameBox.fill(name);
    await page.getByRole("button", { name: "Teruskan" }).click();
  }
  await expect(page.getByText(`Hai, ${name}!`)).toBeVisible();
}

export async function openDemoEvent(host: Page) {
  await signInAs(host, "demo.host@majlisku.test");
  await host.getByRole("link", { name: /Aisyah & Daniel/ }).first().click();
  await host.waitForURL(/\/dashboard\/events\/[a-z0-9]+$/);
  return host.url().split("/").pop()!;
}
