import { describe, expect, it } from "vitest";
import { acceptGoogleProfile, mayPromoteToAdmin } from "@/server/auth/verified-email";

const admins = ["owner@example.com"];

describe("acceptGoogleProfile", () => {
  it("Google profile without email_verified true is refused", () => {
    expect(acceptGoogleProfile({ email: "owner@example.com", email_verified: false })).toBe(false);
    expect(acceptGoogleProfile({ email: "owner@example.com" })).toBe(false);
    expect(acceptGoogleProfile({ email: "owner@example.com", email_verified: "true" })).toBe(false);
    expect(acceptGoogleProfile({ email: "owner@example.com", email_verified: 1 })).toBe(false);
    expect(acceptGoogleProfile(undefined)).toBe(false);
    expect(acceptGoogleProfile(null)).toBe(false);
  });

  it("refuses a verified profile that has no email", () => {
    expect(acceptGoogleProfile({ email_verified: true })).toBe(false);
    expect(acceptGoogleProfile({ email: "", email_verified: true })).toBe(false);
    expect(acceptGoogleProfile({ email: "  ", email_verified: true })).toBe(false);
  });

  it("accepts email_verified true with an email", () => {
    expect(acceptGoogleProfile({ email: "owner@example.com", email_verified: true })).toBe(true);
  });
});

describe("mayPromoteToAdmin", () => {
  it("an unverified email never becomes admin", () => {
    // Google says unverified.
    expect(mayPromoteToAdmin({ provider: "google", email: "owner@example.com", emailVerified: null, profile: { email: "owner@example.com", email_verified: false }, adminEmails: admins })).toBe(false);
    // Google gave no profile.
    expect(mayPromoteToAdmin({ provider: "google", email: "owner@example.com", emailVerified: null, profile: undefined, adminEmails: admins })).toBe(false);
    // A magic-link user whose email was never verified.
    expect(mayPromoteToAdmin({ provider: "email", email: "owner@example.com", emailVerified: null, adminEmails: admins })).toBe(false);
    // Unknown provider.
    expect(mayPromoteToAdmin({ provider: "github", email: "owner@example.com", emailVerified: new Date(), adminEmails: admins })).toBe(false);
  });

  it("promotes a verified admin email from either provider", () => {
    expect(mayPromoteToAdmin({ provider: "google", email: "Owner@Example.com", emailVerified: null, profile: { email: "owner@example.com", email_verified: true }, adminEmails: admins })).toBe(true);
    expect(mayPromoteToAdmin({ provider: "email", email: "owner@example.com", emailVerified: new Date(), adminEmails: admins })).toBe(true);
  });

  it("never promotes an email that is not in the admin list", () => {
    expect(mayPromoteToAdmin({ provider: "email", email: "guest@example.com", emailVerified: new Date(), adminEmails: admins })).toBe(false);
    expect(mayPromoteToAdmin({ provider: "email", email: null, emailVerified: new Date(), adminEmails: admins })).toBe(false);
  });
});