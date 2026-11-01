import { describe, expect, it } from "vitest";
import { eventFormSchema, eventSettingsSchema } from "@/lib/schemas/event";

const valid = {
  type: "WEDDING",
  title: "Walimatulurus",
  hostNames: "Aisyah & Daniel",
  startsAtLocal: "2026-12-12T11:00",
  venueName: "Dewan Seri",
  venueAddress: "",
  googleMapsUrl: "https://maps.google.com/?q=3.1,101.6",
  wazeUrl: "",
  welcomeText: "Selamat datang",
  themeColor: "#8b5e3c",
};

describe("eventFormSchema", () => {
  it("accepts a valid form and turns empty optional fields into null", () => {
    const parsed = eventFormSchema.parse(valid);
    expect(parsed.venueAddress).toBeNull();
    expect(parsed.wazeUrl).toBeNull();
    expect(parsed.startsAt.toISOString()).toBe("2026-12-12T03:00:00.000Z");
  });

  it("rejects a bad colour, a non-http link and a missing title", () => {
    expect(eventFormSchema.safeParse({ ...valid, themeColor: "red" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...valid, googleMapsUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...valid, title: "  " }).success).toBe(false);
  });
});

describe("eventSettingsSchema", () => {
  it("accepts a 4 to 8 digit PIN or an empty one", () => {
    expect(eventSettingsSchema.parse({ galleryVisibility: "GUESTS", requireApproval: "on", pin: "1234" })).toEqual({
      galleryVisibility: "GUESTS",
      requireApproval: true,
      pin: "1234",
      shotsPerGuest: null,
    });
    expect(eventSettingsSchema.parse({ galleryVisibility: "PRIVATE", pin: "" })).toEqual({
      galleryVisibility: "PRIVATE",
      requireApproval: false,
      pin: null,
      shotsPerGuest: null,
    });
  });

  it("rejects a short or non-numeric PIN", () => {
    expect(eventSettingsSchema.safeParse({ galleryVisibility: "PRIVATE", pin: "12" }).success).toBe(false);
    expect(eventSettingsSchema.safeParse({ galleryVisibility: "PRIVATE", pin: "abcd" }).success).toBe(false);
  });

  it("reads the shot limit: empty means unlimited, else a whole number from 1 to 100", () => {
    const base = { galleryVisibility: "PRIVATE" };
    expect(eventSettingsSchema.parse({ ...base, shotsPerGuest: "" }).shotsPerGuest).toBeNull();
    expect(eventSettingsSchema.parse(base).shotsPerGuest).toBeNull();
    expect(eventSettingsSchema.parse({ ...base, shotsPerGuest: "24" }).shotsPerGuest).toBe(24);
    expect(eventSettingsSchema.parse({ ...base, shotsPerGuest: " 100 " }).shotsPerGuest).toBe(100);
    for (const bad of ["0", "101", "abc", "2.5", "-3"]) {
      expect(eventSettingsSchema.safeParse({ ...base, shotsPerGuest: bad }).success, bad).toBe(false);
    }
  });
});