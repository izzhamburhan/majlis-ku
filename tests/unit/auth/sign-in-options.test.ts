import { describe, expect, it } from "vitest";
import { providerIds, signInMethods } from "@/server/auth/sign-in-options";

const smtp = "smtp://user:pass@mail.example.com:587";

describe("providerIds", () => {
  it("email provider is not registered when deployed without EMAIL_SERVER", () => {
    expect(providerIds({ deployed: true, emailServer: undefined, google: true })).toEqual(["google"]);
    expect(providerIds({ deployed: true, emailServer: "", google: true })).toEqual(["google"]);
    expect(providerIds({ deployed: true, emailServer: undefined, google: false })).toEqual([]);
  });

  it("keeps the email provider locally and when a real mail server is configured", () => {
    expect(providerIds({ deployed: false, emailServer: undefined, google: false })).toEqual(["email"]);
    expect(providerIds({ deployed: false, emailServer: undefined, google: true })).toEqual(["email", "google"]);
    expect(providerIds({ deployed: true, emailServer: smtp, google: true })).toEqual(["email", "google"]);
  });
});

describe("signInMethods", () => {
  it("the sign-in page shows no email form when deployed without EMAIL_SERVER", () => {
    expect(signInMethods({ deployed: true, emailServer: undefined, google: true, nodeEnv: "production" })).toEqual({
      email: false,
      google: true,
      dev: false,
      none: false,
    });
  });

  it("shows a no-method state when deployed with neither email nor Google", () => {
    expect(signInMethods({ deployed: true, emailServer: undefined, google: false, nodeEnv: "production" })).toMatchObject({
      email: false,
      google: false,
      none: true,
    });
  });

  it("local development is unchanged: email form, instant sign-in, Google when configured", () => {
    expect(signInMethods({ deployed: false, emailServer: undefined, google: false, nodeEnv: "development" })).toEqual({
      email: true,
      google: false,
      dev: true,
      none: false,
    });
    // e2e and CI run NODE_ENV=production over http without DEPLOYED: the email form stays, instant sign-in does not.
    expect(signInMethods({ deployed: false, emailServer: undefined, google: false, nodeEnv: "production" })).toMatchObject({
      email: true,
      dev: false,
    });
  });

  it("never offers instant sign-in while deployed, whatever NODE_ENV says", () => {
    expect(signInMethods({ deployed: true, emailServer: undefined, google: true, nodeEnv: "development" }).dev).toBe(false);
  });
});