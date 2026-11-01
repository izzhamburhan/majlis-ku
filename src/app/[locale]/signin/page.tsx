import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { googleEnabled, signIn } from "@/auth";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPathname, redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createDevSession, DEV_SESSION_COOKIE, devLoginAllowed } from "@/server/auth/dev-login";

const emailSchema = z.object({ email: z.email().max(254), locale: z.enum(["ms", "en"]) });

async function signInWithEmail(formData: FormData) {
  "use server";
  const { email, locale } = emailSchema.parse({ email: formData.get("email"), locale: formData.get("locale") });
  await signIn("email", {
    email: email.toLowerCase(),
    redirect: false,
    redirectTo: getPathname({ href: "/dashboard", locale }),
  });
  // Our own redirect keeps the check-email page in the guest's language.
  redirect({ href: "/signin/check-email", locale });
}

/** Local development only: sign in at once, without the magic link. createDevSession refuses in production. */
async function devSignIn(formData: FormData) {
  "use server";
  const { email, locale } = emailSchema.parse({ email: formData.get("email"), locale: formData.get("locale") });
  const { sessionToken, expires } = await createDevSession(email);
  (await cookies()).set(DEV_SESSION_COOKIE, sessionToken, { httpOnly: true, sameSite: "lax", secure: false, path: "/", expires });
  redirect({ href: "/dashboard", locale });
}

async function signInWithGoogle(formData: FormData) {
  "use server";
  const locale = z.enum(["ms", "en"]).parse(formData.get("locale"));
  await signIn("google", { redirectTo: getPathname({ href: "/dashboard", locale }) });
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const dev = devLoginAllowed(process.env.NODE_ENV, process.env.EMAIL_SERVER);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-sm px-4 py-10">
        <h1 className="font-serif text-3xl">{t("title")}</h1>
        <p className="mt-2 text-ink/70">{t("subtitle")}</p>
        {error ? (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">
            {t("error")}
          </p>
        ) : null}
        <form action={signInWithEmail} className="mt-6 space-y-3">
          <input type="hidden" name="locale" value={locale as Locale} />
          <label className="block">
            <span className="text-sm font-medium">{t("emailLabel")}</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              className="mt-1 block min-h-12 w-full rounded-xl border border-ink/20 bg-white px-4"
            />
          </label>
          <button type="submit" className="min-h-12 w-full rounded-full bg-brand font-medium text-white hover:bg-brand-dark">
            {t("sendLink")}
          </button>
        </form>
        {dev ? <p className="mt-3 text-sm text-ink/60">{t("devHint")}</p> : null}
        {dev ? (
          <section className="mt-6 rounded-xl border border-dashed border-ink/30 p-4" aria-labelledby="dev-login">
            <h2 id="dev-login" className="font-medium">
              {t("devTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink/70">{t("devHelp")}</p>
            <div className="mt-3 grid gap-2">
              {[
                ["demo.host@majlisku.test", t("devAsHost")],
                ["admin@majlisku.test", t("devAsAdmin")],
              ].map(([email, label]) => (
                <form key={email} action={devSignIn}>
                  <input type="hidden" name="locale" value={locale as Locale} />
                  <input type="hidden" name="email" value={email} />
                  <button type="submit" className="min-h-12 w-full rounded-full border border-ink/20 bg-white px-4 font-medium hover:bg-ink/5">
                    {label}
                  </button>
                </form>
              ))}
            </div>
          </section>
        ) : null}
        {googleEnabled ? (
          <>
            <p className="my-5 text-center text-sm text-ink/60">{t("or")}</p>
            <form action={signInWithGoogle}>
              <input type="hidden" name="locale" value={locale} />
              <button type="submit" className="min-h-12 w-full rounded-full border border-ink/20 bg-white font-medium">
                {t("google")}
              </button>
            </form>
          </>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}