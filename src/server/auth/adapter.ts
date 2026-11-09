import type { Adapter, AdapterAccount } from "next-auth/adapters";

/**
 * Sign-in only needs to know who the person is. The Google access, refresh and ID tokens let someone act as them
 * at Google, and nothing here ever calls Google again, so they are removed before the account row is saved
 * (provider, providerAccountId, type and userId stay: that is what links a later sign-in to the user).
 */
export function withoutProviderTokens(adapter: Adapter): Adapter {
  const { linkAccount } = adapter;
  if (!linkAccount) return adapter;
  return {
    ...adapter,
    linkAccount: (account: AdapterAccount) => {
      const { access_token: _access, refresh_token: _refresh, id_token: _id, ...safe } = account;
      return linkAccount(safe);
    },
  };
}
