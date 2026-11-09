import { isAdminEmail } from "./roles";

// Admin promotion, account linking (allowDangerousEmailAccountLinking) and co-host invites all trust the email
// address, so a sign-in only counts when the provider proved the person owns it.

type GoogleProfile = { email?: unknown; email_verified?: unknown } | null | undefined;

/** Google sign-in is accepted only when Google says the email is verified (a real `true`) and an email exists. */
export function acceptGoogleProfile(profile: GoogleProfile): boolean {
  if (!profile) return false;
  return profile.email_verified === true && typeof profile.email === "string" && profile.email.trim() !== "";
}

/**
 * Whether this sign-in may promote the user to ADMIN: the email is in ADMIN_EMAILS and was verified by this sign-in.
 * Magic link: the user opened a link sent to the address, and Auth.js has set `emailVerified`. Google: `email_verified`.
 */
export function mayPromoteToAdmin(input: {
  provider: string | undefined;
  email: string | null | undefined;
  emailVerified: Date | null | undefined;
  profile?: GoogleProfile;
  adminEmails: readonly string[];
}): boolean {
  if (!isAdminEmail(input.email, input.adminEmails)) return false;
  if (input.provider === "google") return acceptGoogleProfile(input.profile);
  if (input.provider === "email") return Boolean(input.emailVerified);
  return false;
}