import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { EmailConfig } from "next-auth/providers/email";
import { createTransport } from "nodemailer";
import { BRAND_NAME } from "@/lib/brand";
import { isDeployed } from "@/lib/deployed";
import { env } from "@/lib/env";

/** Where development sign-in links are written when no SMTP server is configured (read by e2e tests). */
export const DEV_MAIL_LOG = join(process.cwd(), ".data", "dev-mail.log");

export async function sendVerificationRequest({ identifier, url }: { identifier: string; url: string }): Promise<void> {
  const { EMAIL_SERVER, EMAIL_FROM } = env();
  if (!EMAIL_SERVER) {
    // Deployed without a mail server, the only places left for the link are a log and a file: refuse instead.
    // The message names no address and no link.
    if (isDeployed()) throw new Error("Email sign-in is not configured: EMAIL_SERVER is empty");
    console.log(`\n[auth] Sign-in link for ${identifier}:\n${url}\n`);
    await mkdir(dirname(DEV_MAIL_LOG), { recursive: true });
    await appendFile(DEV_MAIL_LOG, `${JSON.stringify({ to: identifier, url, at: new Date().toISOString() })}\n`);
    return;
  }
  const host = new URL(url).host;
  await createTransport(EMAIL_SERVER).sendMail({
    to: identifier,
    from: EMAIL_FROM,
    subject: `${BRAND_NAME}: pautan log masuk / sign-in link`,
    text: `Log masuk ke ${BRAND_NAME} / Sign in to ${BRAND_NAME}:\n${url}\n\n${host}`,
    html: `<p>Log masuk ke ${BRAND_NAME} / Sign in to ${BRAND_NAME}</p><p><a href="${url}">${url}</a></p>`,
  });
}

export const emailProvider: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  maxAge: 24 * 60 * 60,
  sendVerificationRequest,
  options: {},
};
