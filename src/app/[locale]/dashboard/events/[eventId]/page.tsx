/* eslint-disable @next/next/no-img-element -- the QR image comes from an authenticated API route; the cover URL is signed and short-lived */
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CopyButton } from "@/components/host/copy-button";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatEventDay } from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { eventUrl, requireEventMember } from "@/server/events/access";
import { MEDIA_URL_TTL_SEC, storage } from "@/server/media/storage";

export default async function EventOverviewPage({ params }: { params: Promise<{ locale: string; eventId: string }> }) {
  const { locale, eventId } = await params;
  setRequestLocale(locale);
  // The cover is signed from the event this page's own access check returned, as the edit page does: whoever passes
  // the check (host, co-host, admin reading) sees it, nobody else.
  const { event } = await requireEventMember(locale as Locale, eventId);
  const [t, tc] = await Promise.all([getTranslations("eventOverview"), getTranslations("common")]);
  const coverUrl = event.coverKey ? await storage().getDownloadUrl(event.coverKey, { expiresInSec: MEDIA_URL_TTL_SEC }) : null;
  const url = eventUrl(event.slug);
  const api = `/api/events/${event.id}`;
  const planName = locale === "ms" ? event.plan.nameMs : event.plan.nameEn;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(t("whatsappText", { names: event.hostNames, url }))}`;
  const limit = event.plan.uploadLimit;
  const percent = limit === null ? null : limit === 0 ? 100 : Math.min(100, Math.round((event.uploadCount / limit) * 100));
  const card = "rounded-3xl bg-surface p-5 ring-1 ring-[var(--st-line)]";
  const download = "inline-flex min-h-11 items-center rounded-full border border-[var(--st-line)] px-4 text-sm font-medium hover:bg-[var(--st-surface-lift)]";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* The cover photo and the way to the venue screen. The names are in the page heading above, not repeated here. */}
      <section data-testid="event-banner" className={`relative overflow-hidden rounded-3xl bg-surface ring-1 ring-[var(--st-line)] md:col-span-2 ${coverUrl ? "h-56 sm:h-72" : ""}`}>
        {coverUrl ? <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
        <div className={`flex justify-end p-5 ${coverUrl ? "absolute inset-x-0 bottom-0" : ""}`}>
          <a
            href={getPathname({ href: `/slideshow/${event.id}`, locale: locale as Locale })}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center rounded-full bg-brand px-6 font-semibold text-on-brand shadow-lg hover:bg-brand-dark"
          >
            {t("openVenueScreen")} ↗
          </a>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-serif text-2xl">{t("shareTitle")}</h2>
        <p className="mt-3 text-sm font-medium">{t("shareLink")}</p>
        <p className="mt-1 rounded-xl bg-cream p-3 font-mono text-sm break-all" data-testid="event-url">
          {url}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={url} label={tc("copy")} copiedLabel={tc("copied")} />
          <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-[#25d366] px-4 text-sm font-medium text-white" /* stori-keep: WhatsApp green */>
            {t("whatsapp")}
          </a>
        </div>
      </section>

      <section className={card}>
        <h2 className="font-serif text-2xl">{t("qrTitle")}</h2>
        <p className="text-sm text-muted">{t("qrHelp")}</p>
        <img src={`${api}/qr?format=svg`} alt={t("qrTitle")} width={200} height={200} className="mx-auto mt-3 size-48 rounded-2xl" />
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <a href={`${api}/qr?format=png&download=1`} className={download} data-testid="download-png">
            {t("downloadPng")}
          </a>
          <a href={`${api}/qr?format=svg&download=1`} className={download}>
            {t("downloadSvg")}
          </a>
          <a href={`${api}/qr/stand?size=a5`} className={download}>
            {t("downloadA5")}
          </a>
          <a href={`${api}/qr/stand?size=a4`} className={download}>
            {t("downloadA4")}
          </a>
        </div>
      </section>

      <section className={`${card} md:col-span-2`}>
        <h2 className="font-serif text-2xl">{t("usageTitle")}</h2>
        <p className="mt-2 text-sm">{t("plan", { plan: planName })}</p>
        {event.plan.includesGallery ? (
          <>
            <p className="mt-3 font-medium" data-testid="usage-items">
              {limit !== null ? t("itemsUsed", { used: event.uploadCount, limit }) : t("itemsUnlimited", { used: event.uploadCount })}
            </p>
            {percent !== null ? (
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--st-line)]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full ${percent >= 90 ? "bg-danger" : "bg-brand"}`} style={{ width: `${percent}%` }} />
              </div>
            ) : null}
            <p className="mt-2 text-sm text-muted">{t("storageUsed", { size: formatBytes(event.storageBytes) })}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">{t("noGallery")}</p>
        )}
        {event.purgeAt && event.status !== "ARCHIVED" ? <p className="mt-1 text-sm text-muted">{t("keptUntil", { date: formatEventDay(event.purgeAt, locale as Locale) })}</p> : null}
      </section>
    </div>
  );
}
