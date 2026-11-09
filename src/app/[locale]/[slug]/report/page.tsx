import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { LocaleToggle } from "@/components/locale-toggle";
import { StoriRoot } from "@/components/stori-root";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { display, ui } from "@/lib/fonts";
import { REPORT_REASONS } from "@/lib/schemas/report";
import { findGuestEvent } from "@/server/guests/context";
import { submitReportAction } from "@/server/reports/actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const ERRORS = ["validation", "rate_limited"] as const;

/** Anyone can report an event: not PIN-gated, no name, email or phone. A plain form that works without JavaScript. */
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const event = await findGuestEvent(slug);
  if (!event) notFound();
  const { sent, error } = await searchParams;
  const failure = ERRORS.find((code) => code === error);
  const [t, tc] = await Promise.all([getTranslations("report"), getTranslations("common")]);

  return (
    <StoriRoot className={`${display.variable} ${ui.variable}`}>
      <main className="mx-auto max-w-md px-4 pb-12">
        <div className="flex items-center justify-between py-3">
          <Link href={`/${slug}`} className="inline-flex min-h-11 items-center text-sm text-muted underline">
            ← {tc("back")}
          </Link>
          <LocaleToggle locale={locale as Locale} label={tc("switchTo")} />
        </div>
        <h1 className="font-serif text-3xl">{t("title")}</h1>
        <p className="mt-1 text-muted">{event.title}</p>
        {sent === "1" ? (
          <div role="status" className="mt-6 rounded-2xl bg-surface p-6 shadow-sm">
            <h2 className="font-serif text-2xl">{t("thanksTitle")}</h2>
            <p className="mt-2">{t("thanksBody")}</p>
          </div>
        ) : (
          <form action={submitReportAction.bind(null, locale as Locale, slug)} className="mt-6 space-y-5">
            <p>{t("intro")}</p>
            {failure ? (
              <p role="alert" className="rounded-xl bg-surface p-3 text-danger">
                {t(`errors.${failure}`)}
              </p>
            ) : null}
            <fieldset className="space-y-2">
              <legend className="mb-2 font-medium">{t("reasonLegend")}</legend>
              {REPORT_REASONS.map((reason) => (
                <label key={reason} className="flex min-h-11 items-center gap-3 rounded-xl bg-surface px-4 py-2 shadow-sm">
                  <input type="radio" name="reason" value={reason} required className="size-5 shrink-0" />
                  <span>{t(`reasons.${reason}`)}</span>
                </label>
              ))}
            </fieldset>
            <div>
              <label htmlFor="details" className="block font-medium">
                {t("detailsLabel")}
              </label>
              <p id="details-hint" className="text-sm text-muted">
                {t("detailsHint")}
              </p>
              <textarea
                id="details"
                name="details"
                rows={4}
                maxLength={1000}
                aria-describedby="details-hint"
                className="mt-2 w-full rounded-xl border border-ink/15 bg-surface p-3"
              />
            </div>
            <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand px-6 font-medium text-on-brand">
              {t("submit")}
            </button>
          </form>
        )}
      </main>
      <SiteFooter />
    </StoriRoot>
  );
}
