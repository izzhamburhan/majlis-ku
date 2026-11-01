/* eslint-disable @next/next/no-img-element -- the cover uses a signed, short-lived URL */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";
import { GuestActions } from "@/components/guest/guest-actions";
import { SiteFooter } from "@/components/site-footer";
import { LocaleToggle } from "@/components/locale-toggle";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatEventDate } from "@/lib/dates";
import { display, ui } from "@/lib/fonts";
import { IVORY, songketPalette, songketVars } from "@/lib/songket";
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

/** "Aisyah & Daniel" → "A & D", for the arch when there is no cover photo. */
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

  return (
    <div className={`songket ${display.variable} ${ui.variable} flex min-h-dvh flex-col`} style={songketVars(event.themeColor)}>
      {/* Overscroll and the area under the page take the deep ground, not the site's cream. */}
      <style>{`body{background:${songketPalette(event.themeColor).groundDeep}}`}</style>
      <div className="sk-band shrink-0" aria-hidden />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-12">
        <div className="flex justify-end pt-3 [&_a]:border-[var(--sk-gold)]/50 [&_a]:text-[var(--sk-ivory)] [&_a:hover]:bg-white/5">
          <LocaleToggle locale={locale as Locale} label={tc("switchTo")} />
        </div>

        <header className="sk-rise mt-2 flex flex-col items-center text-center">
          <div className="sk-arch relative aspect-[4/5] w-[44%] max-w-48 overflow-hidden bg-[var(--sk-ground-lift)]">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="songket flex h-full w-full items-center justify-center bg-[var(--sk-ground-lift)]">
                <span className="sk-display text-4xl text-[var(--sk-gold-light)]">{monogram(event.hostNames)}</span>
              </div>
            )}
          </div>
          <h1 className="sk-display mt-7 text-[2.35rem] leading-[1.08] text-balance">{event.hostNames}</h1>
          <p className="mt-3 text-[var(--sk-ivory)]/90">
            {types(event.type)}
            {event.venueName ? ` · ${event.venueName}` : ""}
          </p>
          <p className="mt-1 text-sm text-[var(--sk-ivory)]/80">{formatEventDate(event.startsAt, locale as Locale)}</p>
          {event.plan.includesGallery && pinOk ? (
            <p className="sk-rule mt-6 w-full text-sm tracking-wide tabular-nums">
              <span>{t("counts", { photos: stats.photos, guests: stats.guests })}</span>
            </p>
          ) : null}
        </header>

        {event.welcomeText && pinOk ? <p className="mt-5 text-center leading-relaxed text-pretty text-[var(--sk-ivory)]/85">{event.welcomeText}</p> : null}

        {event.plan.includesGallery ? (
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

        <p className="mt-auto pt-10 text-center">
          <Link href={`/${slug}/report`} className="inline-flex min-h-11 items-center text-sm text-[var(--sk-ivory)]/75 underline underline-offset-4">
            {tr("link")}
          </Link>
        </p>
      </main>
      <SiteFooter color={IVORY} />
      <div className="sk-band shrink-0 rotate-180" aria-hidden />
    </div>
  );
}
