/* eslint-disable @next/next/no-img-element -- the QR image comes from an authenticated API route */
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CopyButton } from "@/components/host/copy-button";
import type { Locale } from "@/i18n/routing";
import { formatEventDay } from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { eventUrl, requireEventMember } from "@/server/events/access";

export default async function EventOverviewPage({ params }: { params: Promise<{ locale: string; eventId: string }> }) {
  const { locale, eventId } = await params;
  setRequestLocale(locale);
  const { event } = await requireEventMember(locale as Locale, eventId);
  const [t, tc] = await Promise.all([getTranslations("eventOverview"), getTranslations("common")]);
  const url = eventUrl(event.slug);
  const api = `/api/events/${event.id}`;
  const planName = locale === "ms" ? event.plan.nameMs : event.plan.nameEn;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(t("whatsappText", { names: event.hostNames, url }))}`;
  const limit = event.plan.uploadLimit;
  const percent = limit === null ? null : limit === 0 ? 100 : Math.min(100, Math.round((event.uploadCount / limit) * 100));
  const download = "inline-flex min-h-11 items-center rounded-full border border-ink/20 bg-surface px-4 text-sm font-medium";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl bg-surface p-5 shadow-sm">
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

      <section className="rounded-2xl bg-surface p-5 shadow-sm">
        <h2 className="font-serif text-2xl">{t("qrTitle")}</h2>
        <p className="text-sm text-ink/60">{t("qrHelp")}</p>
        <img src={`${api}/qr?format=svg`} alt={t("qrTitle")} width={200} height={200} className="mx-auto mt-3 size-48" />
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

      <section className="rounded-2xl bg-surface p-5 shadow-sm md:col-span-2">
        <h2 className="font-serif text-2xl">{t("usageTitle")}</h2>
        <p className="mt-2 text-sm">{t("plan", { plan: planName })}</p>
        {event.plan.includesGallery ? (
          <>
            <p className="mt-3 font-medium" data-testid="usage-items">
              {limit !== null ? t("itemsUsed", { used: event.uploadCount, limit }) : t("itemsUnlimited", { used: event.uploadCount })}
            </p>
            {percent !== null ? (
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full ${percent >= 90 ? "bg-danger" : "bg-brand"}`} style={{ width: `${percent}%` }} />
              </div>
            ) : null}
            <p className="mt-2 text-sm text-ink/70">{t("storageUsed", { size: formatBytes(event.storageBytes) })}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink/70">{t("noGallery")}</p>
        )}
        {event.purgeAt && event.status !== "ARCHIVED" ? <p className="mt-1 text-sm text-ink/70">{t("keptUntil", { date: formatEventDay(event.purgeAt, locale as Locale) })}</p> : null}
      </section>
    </div>
  );
}
