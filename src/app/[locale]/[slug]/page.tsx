/* eslint-disable @next/next/no-img-element -- the cover uses a signed, short-lived URL */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";
import { GuestActions } from "@/components/guest/guest-actions";
import { SiteFooter } from "@/components/site-footer";
import { LocaleToggle } from "@/components/locale-toggle";
import { StoriRoot } from "@/components/stori-root";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatEventDate } from "@/lib/dates";
import { display, ui } from "@/lib/fonts";
import { STORI } from "@/lib/stori";
import { readGuestContext } from "@/server/guests/context";
import { guestPageStats } from "@/server/guests/stats";
import { MEDIA_URL_TTL_SEC, storage } from "@/server/media/storage";
import { ENABLED_KINDS } from "@/server/uploads/service";

const getContext = cache((slug: string) => readGuestContext(slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const context = await getContext(slug);
  return context ? { title: context.event.hostNames, robots: { index: false, follow: false } } : {};
}

/** "Aisyah & Daniel" → "A & D", for the hero when there is no cover photo. */
function monogram(hostNames: string): string {
  const parts = hostNames.split(/\s*(?:&|\+| dan | and )\s*/i).filter(Boolean);
  return parts.length > 1 ? parts.map((p) => p.trim().charAt(0).toUpperCase()).join(" & ") : hostNames.trim().charAt(0).toUpperCase();
}

export default async function GuestEventPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const context = await getContext(slug);
  if (!context) notFound();
  const { event, guest, pinOk } = context;
  const [t, tc, messages, tr, types, stats] = await Promise.all([
    getTranslations("event"),
    getTranslations("common"),
    getMessages(),
    getTranslations("report"),
    getTranslations("eventTypes"),
    guestPageStats(event, guest?.id ?? null),
  ]);
  const coverUrl = event.coverKey && pinOk ? await storage().getDownloadUrl(event.coverKey, { expiresInSec: MEDIA_URL_TTL_SEC }) : null;
  const galleryHref = event.galleryVisibility === "GUESTS" ? getPathname({ href: `/${slug}/gallery`, locale: locale as Locale }) : null;
  const hasDock = event.plan.includesGallery;

  return (
    // The bottom padding keeps the report link and footer clear of the floating dock.
    <StoriRoot className={`${display.variable} ${ui.variable} ${hasDock ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))]" : ""}`}>
      <div className="mx-auto flex w-full max-w-lg flex-col">
        <section className="relative flex min-h-svh flex-col">
          {/* The cover fills the first screen. Without one (or before the PIN), the dusk ground carries the monogram. */}
          <div aria-hidden className="absolute inset-x-0 top-0 h-svh overflow-hidden bg-[var(--st-ground-deep)]">
            {coverUrl ? (
              <img src={coverUrl} alt="" fetchPriority="high" decoding="async" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-3/5 items-center justify-center">
                <span className="font-serif text-6xl text-brand">{monogram(event.hostNames)}</span>
              </div>
            )}
          </div>

          <div className="relative z-10 flex justify-end px-5 pt-3">
            <span className="st-glass rounded-full">
              <LocaleToggle locale={locale as Locale} label={tc("switchTo")} />
            </span>
          </div>

          <div className="st-fade relative z-10 mt-auto px-5 pt-16">
            <header>
              <h1 className="font-serif text-[2.35rem] leading-[1.08] text-balance">{event.hostNames}</h1>
              <p className="mt-3 text-muted">
                {types(event.type)}
                {event.venueName ? ` · ${event.venueName}` : ""}
              </p>
              <p className="mt-1 text-sm text-muted">{formatEventDate(event.startsAt, locale as Locale)}</p>
            </header>

            {hasDock ? (
              <NextIntlClientProvider messages={{ guest: messages.guest }}>
                <GuestActions
                  slug={slug}
                  privacyHref={getPathname({ href: "/privacy", locale: locale as Locale })}
                  needsPin={!pinOk}
                  initialName={guest?.displayName ?? null}
                  galleryHref={pinOk ? galleryHref : null}
                  features={{
                    video: ENABLED_KINDS.includes("VIDEO") && event.plan.videoAllowed,
                    voice: ENABLED_KINDS.includes("VOICE"),
                    maxVideoSeconds: event.plan.maxVideoSeconds ?? 60,
                  }}
                  shots={stats.shots}
                />
              </NextIntlClientProvider>
            ) : null}
          </div>
        </section>

        <div className="px-5 pt-4 text-center">
          {event.welcomeText && pinOk ? <p className="leading-relaxed text-pretty text-muted">{event.welcomeText}</p> : null}
          {event.plan.includesGallery && pinOk ? (
            <p className="mt-4 text-sm tracking-wide text-muted tabular-nums">{t("counts", { photos: stats.photos, guests: stats.guests })}</p>
          ) : null}
          <p className="mt-6">
            <Link href={`/${slug}/report`} className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4">
              {tr("link")}
            </Link>
          </p>
        </div>
        <SiteFooter color={STORI.muted} />
      </div>
    </StoriRoot>
  );
}
