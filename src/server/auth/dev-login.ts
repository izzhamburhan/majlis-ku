import "server-only";
import { randomBytes } from "node:crypto";
import { isDeployed } from "@/lib/deployed";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { isAdminEmail } from "./roles";

// Instant sign-in for local development: skips the magic link and opens a normal database session.
// Auth.js reads this cookie as its own session cookie (http, not secure, on localhost).
export const DEV_SESSION_COOKIE = "authjs.session-token";
const SESSION_DAYS = 30;

/** Only on a developer's machine: never in production or deployed mode, and off once real email is configured. */
export function devLoginAllowed(nodeEnv: string | undefined, emailServer: string | undefined, deployed = isDeployed()): boolean {
  return nodeEnv !== "production" && !deployed && !emailServer;
}

export async function createDevSession(email: string): Promise<{ sessionToken: string; expires: Date }> {
  if (!devLoginAllowed(process.env.NODE_ENV, process.env.EMAIL_SERVER)) throw new Error("Instant sign-in is only available in local development");
  const address = email.trim().toLowerCase();
  // Same as a first magic-link sign-in: the user is created verified, and ADMIN_EMAILS get the admin role.
  const admin = isAdminEmail(address, env().ADMIN_EMAILS);
  const user = await db.user.upsert({
    where: { email: address },
    update: admin ? { role: "ADMIN" } : {},
    create: { email: address, emailVerified: new Date(), ...(admin ? { role: "ADMIN" as const } : {}) },
  });
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { sessionToken, userId: user.id, expires } });
  return { sessionToken, expires };
}
