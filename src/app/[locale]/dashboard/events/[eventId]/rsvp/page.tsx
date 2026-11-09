import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { utcToKlLocal } from "@/lib/dates";
import { getCard } from "@/server/ecard/service";
import { requireEventMember } from "@/server/events/access";
import { canEditEvent } from "@/server/moderation/rules";
import { rsvpTotals } from "@/server/rsvp/rules";
import { listRsvps } from "@/server/rsvp/service";

export default async function RsvpPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { locale, eventId } = await params;
  setRequestLocale(locale);
  const { event } = await requireEventMember(locale as Locale, eventId);
  const { filter: rawFilter } = await searchParams;
  const filter = rawFilter === "yes" || rawFilter === "no" ? rawFilter : "all";
  const [t, all, rows, card] = await Promise.all([getTranslations("rsvp"), listRsvps(event.id), listRsvps(event.id, filter), getCard(event.id)]);
  const totals = rsvpTotals(all);
  const base = `/dashboard/events/${event.id}/rsvp`;
  const exportBase = `/api/events/${event.id}/rsvp/export?locale=${locale}`;
  const stat = "rounded-3xl bg-surface ring-1 ring-[var(--st-line)] p-4";

  return (
    <div className="space-y-4">
      <h2 className="font-serif text-3xl">{t("listTitle")}</h2>
      {!card?.published || !card.content.rsvpEnabled ? <p className="rounded-3xl bg-surface ring-1 ring-[var(--st-line)] p-4 text-sm text-muted">{t("noCard")}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="rsvp-totals">
        <div className={stat}>
          <p className="text-sm text-muted">{t("replies")}</p>
          <p className="text-3xl font-semibold" data-testid="total-replies">
            {totals.replies}
          </p>
        </div>
        <div className={stat}>
          <p className="text-sm text-muted">{t("attendingCount")}</p>
          <p className="text-3xl font-semibold">{totals.attending}</p>
        </div>
        <div className={stat}>
          <p className="text-sm text-muted">{t("paxTotal")}</p>
          <p className="text-3xl font-semibold" data-testid="total-pax">
            {totals.pax}
          </p>
        </div>
        <div className={stat}>
          <p className="text-sm text-muted">{t("declined")}</p>
          <p className="text-3xl font-semibold">{totals.declined}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["all", "yes", "no"] as const).map((f) => (
            <Link
              key={f}
              href={f === "all" ? base : `${base}?filter=${f}`}
              className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm ${filter === f ? "bg-ink text-on-ink" : "bg-surface"}`}
            >
              {t(f === "all" ? "filterAll" : f === "yes" ? "filterYes" : "filterNo")}
            </Link>
          ))}
        </div>
        {canEditEvent(event) ? (
        <div className="flex gap-2">
          <a href={`${exportBase}&format=csv`} className="inline-flex min-h-11 items-center rounded-full border border-[var(--st-line)] bg-surface px-4 text-sm font-medium">
            {t("csv")}
          </a>
          <a href={`${exportBase}&format=xlsx`} className="inline-flex min-h-11 items-center rounded-full border border-[var(--st-line)] bg-surface px-4 text-sm font-medium">
            {t("xlsx")}
          </a>
        </div>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-3xl bg-surface ring-1 ring-[var(--st-line)] p-6 text-center text-muted">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface ring-1 ring-[var(--st-line)]">
          <table className="w-full min-w-[640px] text-left text-sm" data-testid="rsvp-table">
            <thead className="border-b border-[var(--st-line)] text-muted">
              <tr>
                <th className="p-3 font-medium">{t("colName")}</th>
                <th className="p-3 font-medium">{t("colAttending")}</th>
                <th className="p-3 font-medium">{t("colPax")}</th>
                <th className="p-3 font-medium">{t("colPhone")}</th>
                <th className="p-3 font-medium">{t("colMessage")}</th>
                <th className="p-3 font-medium">{t("colTime")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--st-line)] last:border-0">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className="p-3">{r.attending ? t("yesShort") : t("noShort")}</td>
                  <td className="p-3 tabular-nums">{r.pax}</td>
                  <td className="p-3">{r.phone ?? "—"}</td>
                  <td className="max-w-xs p-3 whitespace-pre-line">{r.message ?? ""}</td>
                  <td className="p-3 whitespace-nowrap text-muted">{utcToKlLocal(r.updatedAt).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
