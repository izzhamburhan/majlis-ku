import type { Adapter, AdapterAccount } from "next-auth/adapters";
import { describe, expect, it, vi } from "vitest";
import { withoutProviderTokens } from "@/server/auth/adapter";

const account = {
  userId: "u1",
  type: "oidc",
  provider: "google",
  providerAccountId: "1234567890",
  access_token: "ya29.access-token-value",
  refresh_token: "1//refresh-token-value",
  id_token: "eyJ.id-token.value",
  expires_at: 1_800_000_000,
  token_type: "bearer",
  scope: "openid email profile",
} as AdapterAccount;

describe("withoutProviderTokens", () => {
  it("removes the access, refresh and ID tokens before saving, and keeps what Auth.js needs", async () => {
    const linkAccount = vi.fn(async (value: AdapterAccount) => value);
    const wrapped = withoutProviderTokens({ linkAccount } as unknown as Adapter);

    await wrapped.linkAccount?.(account);

    expect(linkAccount).toHaveBeenCalledTimes(1);
    const saved = linkAccount.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(saved).toMatchObject({ userId: "u1", type: "oidc", provider: "google", providerAccountId: "1234567890" });
    for (const name of ["access_token", "refresh_token", "id_token"]) expect(saved, name).not.toHaveProperty(name);
    expect(JSON.stringify(saved)).not.toMatch(/token-value|id-token/);
  });

  it("does not change the account object it was given, and leaves every other adapter method alone", async () => {
    const getUser = vi.fn(async () => null);
    const wrapped = withoutProviderTokens({ getUser, linkAccount: async () => undefined } as unknown as Adapter);
    await wrapped.linkAccount?.(account);
    expect(account.access_token).toBe("ya29.access-token-value");
    expect(wrapped.getUser).toBe(getUser);
  });

  it("adds no linkAccount to an adapter that has none", () => {
    expect(withoutProviderTokens({} as Adapter).linkAccount).toBeUndefined();
  });
});