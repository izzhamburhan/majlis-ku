import { describe, expect, it } from "vitest";
import { guestKeyFor } from "@/server/gallery/guest-key";

describe("guestKeyFor", () => {
  it("gives the same 12-hex key for the same guest and salt", () => {
    const a = guestKeyFor("cguest1", "salt-salt-salt");
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(guestKeyFor("cguest1", "salt-salt-salt")).toBe(a);
  });

  it("differs between guests and between salts, and never contains the id", () => {
    const a = guestKeyFor("cguest1", "salt-salt-salt");
    expect(guestKeyFor("cguest2", "salt-salt-salt")).not.toBe(a);
    expect(guestKeyFor("cguest1", "other-salt-value")).not.toBe(a);
    expect(a).not.toContain("cguest1");
  });

  it("is null when the guest record is gone", () => {
    expect(guestKeyFor(null, "salt-salt-salt")).toBeNull();
  });
});
