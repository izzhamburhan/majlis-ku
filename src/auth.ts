import { PrismaAdapter } from "@auth/prisma-adapter";
import type { UserRole } from "@prisma/client";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isDeployed } from "@/lib/deployed";
import { env } from "@/lib/env";
import { emailProvider } from "@/server/auth/email";
import { providerIds } from "@/server/auth/sign-in-options";
import { acceptGoogleProfile, mayPromoteToAdmin } from "@/server/auth/verified-email";
import { db } from "@/server/db";

declare module "next-auth" {
  interface User {
    role?: UserRole;
  }
  interface Session {
    user: { id: string; email: string; name?: string | null; image?: string | null; role: UserRole };
  }
}

const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, ADMIN_EMAILS, EMAIL_SERVER } = env();

export const googleEnabled = Boolean(AUTH_GOOGLE_ID && AUTH_GOOGLE_SECRET);

// Deployed without EMAIL_SERVER there is no email provider at all (see sign-in-options.ts).
const providers = providerIds({ deployed: isDeployed(), emailServer: EMAIL_SERVER, google: googleEnabled }).map((id) =>
  id === "email" ? emailProvider : Google({ allowDangerousEmailAccountLinking: true }),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  trustHost: true,
  providers,
  pages: { signIn: "/signin", verifyRequest: "/signin/check-email", error: "/signin" },
  callbacks: {
    // Account linking and admin promotion trust the email, so Google must vouch for it. Refused sign-ins land on the sign-in error.
    signIn({ account, profile }) {
      return account?.provider === "google" ? acceptGoogleProfile(profile) : true;
    },
    session({ session, user }) {
      session.user.id = user.id;
      session.user.role = user.role ?? "HOST";
      return session;
    },
  },
  events: {
    // Promote emails listed in ADMIN_EMAILS on every sign-in, so admins need no manual DB edit. Only a verified email counts.
    async signIn({ user, account, profile }) {
      if (user.id && user.role !== "ADMIN" && mayPromoteToAdmin({ provider: account?.provider, email: user.email, emailVerified: (user as { emailVerified?: Date | null }).emailVerified, profile, adminEmails: ADMIN_EMAILS })) {
        await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      }
    },
  },
});
