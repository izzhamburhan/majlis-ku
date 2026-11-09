// Which sign-in methods exist, as pure decisions shared by auth.ts (providers) and the sign-in page (what to show).
// Deployed without a mail server means no email sign-in at all: the only other place a link could go is a log or a file.

type Options = { deployed: boolean; emailServer: string | undefined; google: boolean };

/** Email sign-in works when a real mail server is set, or locally (the link goes to the dev log). Never deployed without one. */
export function emailSignInEnabled({ deployed, emailServer }: Pick<Options, "deployed" | "emailServer">): boolean {
  return !deployed || Boolean(emailServer);
}

/** Auth.js providers to register, in order. */
export function providerIds(options: Options): ("email" | "google")[] {
  return [...(emailSignInEnabled(options) ? (["email"] as const) : []), ...(options.google ? (["google"] as const) : [])];
}

/** What the sign-in page offers. `dev` is the local instant sign-in (never in production, never deployed, never with real email). */
export function signInMethods(options: Options & { nodeEnv: string | undefined }): {
  email: boolean;
  google: boolean;
  dev: boolean;
  none: boolean;
} {
  const email = emailSignInEnabled(options);
  const dev = !options.deployed && options.nodeEnv !== "production" && !options.emailServer;
  return { email, google: options.google, dev, none: !email && !options.google };
}