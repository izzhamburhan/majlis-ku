import { getTranslations, setRequestLocale } from "next-intl/server";
import { SignOutButton } from "@/components/sign-out-button";
import { SiteHeader } from "@/components/site-header";
import { StoriRoot } from "@/components/stori-root";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatEventDate } from "@/lib/dates";
import { display, ui } from "@/lib/fonts";
import { requireUser } from "@/server/auth/session";
import { listEventsForUser } from "@/server/events/service";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale as Locale);
  const [t, tc, events] = await Promise.all([getTranslations("dashboard"), getTranslations("common"), listEventsForUser(user.id)]);
  return (
    <StoriRoot className={`${display.variable} ${ui.variable}`}>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-serif text-3xl">{t("title")}</h1>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/events/new" className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-medium text-on-brand hover:bg-brand-dark">
              + {t("newEvent")}
            </Link>
            <SignOutButton label={tc("signOut")} />
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">{t("signedInAs", { email: user.email })}</p>
        {events.length === 0 ? (
          <p className="mt-8 rounded-3xl bg-surface p-6 text-muted ring-1 ring-[var(--st-line)]">{t("empty")}</p>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/dashboard/events/${event.id}`}
                  className="block rounded-3xl bg-surface p-5 ring-1 ring-[var(--st-line)] transition-colors hover:bg-[var(--st-surface-lift)]"
                >
                  <span className="block h-1.5 w-12 rounded-full" style={{ backgroundColor: event.themeColor }} />
                  <span className="mt-3 block font-serif text-2xl">{event.hostNames}</span>
                  <span className="block text-muted">{event.title}</span>
                  <span className="mt-2 block text-sm text-muted">{formatEventDate(event.startsAt, locale as Locale)}</span>
                  <span className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-cream px-2 py-1">{locale === "ms" ? event.plan.nameMs : event.plan.nameEn}</span>
                    <span className="rounded-full bg-cream px-2 py-1">{t("items", { count: event.uploadCount })}</span>
                    {event.status === "ARCHIVED" ? <span className="rounded-full bg-cream px-2 py-1 text-brand ring-1 ring-[var(--color-brand)]">{t("archived")}</span> : null}
                    {event.members[0]?.role === "COHOST" ? <span className="rounded-full bg-cream px-2 py-1">{t("cohost")}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </StoriRoot>
  );
}
