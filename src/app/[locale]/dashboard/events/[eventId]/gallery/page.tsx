import { getTranslations, setRequestLocale } from "next-intl/server";
import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { galleryHref, GalleryToolbar, nextPageHref } from "@/components/gallery/gallery-toolbar";
import { LiveItems } from "@/components/gallery/live-items";
import { galleryLabels } from "@/components/host/labels";
import { ApproveAllButton, ModerationActions } from "@/components/host/moderation-actions";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireEventMember } from "@/server/events/access";
import { GALLERY_FILTERS, galleryQuerySchema, listGallery } from "@/server/gallery/service";
import { canModerate } from "@/server/moderation/rules";
import { pendingCount } from "@/server/moderation/service";

export default async function HostGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, eventId } = await params;
  setRequestLocale(locale);
  const { event } = await requireEventMember(locale as Locale, eventId);
  const query = galleryQuerySchema.parse(await searchParams);
  const [t, tm, tx, labels, page, waiting] = await Promise.all([
    getTranslations("gallery"),
    getTranslations("moderation"),
    getTranslations("export"),
    galleryLabels(),
    listGallery(event.id, query, "host"),
    pendingCount(event.id),
  ]);
  const base = `/dashboard/events/${event.id}/gallery`;
  const moderationLabels = { approve: tm("approve"), hide: tm("hide"), show: tm("show"), delete: tm("delete"), confirmDelete: tm("confirmDelete") };
  const statusLinks = [
    { status: "all" as const, label: tm("statusAll") },
    { status: "pending" as const, label: `${tm("statusPending")}${waiting ? ` (${waiting})` : ""}` },
    { status: "hidden" as const, label: tm("statusHidden") },
  ];
  const canMod = canModerate(event); // admins who are not members are read-only here (export included)
  const download = "inline-flex min-h-11 items-center rounded-full border border-ink/20 bg-surface px-4 text-sm font-medium";

  return (
    <div className="space-y-4">
      {canMod ? (
      <section className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3">
        <span className="text-sm font-medium">{tx("title")}:</span>
        <a href={`/api/events/${event.id}/export/media?locale=${locale}`} className={download} data-testid="export-zip" title={tx("zipHelp")}>
          {tx("zip")}
        </a>
        <a href={`/api/events/${event.id}/export/wishes?locale=${locale}`} className={download} data-testid="export-pdf">
          {tx("pdf")}
        </a>
      </section>
      ) : null}

      <GalleryToolbar
        base={base}
        formAction={getPathname({ href: base, locale: locale as Locale })}
        query={query}
        labels={labels}
        filters={GALLERY_FILTERS}
      />
      <div className="flex flex-wrap items-center gap-1">
        {statusLinks.map(({ status, label }) => (
          <Link
            key={status}
            href={galleryHref(base, query, { status })}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm ${query.status === status ? "bg-ink text-on-ink" : "bg-surface"}`}
          >
            {label}
          </Link>
        ))}
        {canMod && waiting > 0 ? <ApproveAllButton eventId={event.id} label={tm("approveAll", { count: waiting })} /> : null}
      </div>

      {!query.after && query.sort === "newest" && query.status === "all" ? (
        <LiveItems
          streamUrl={`/api/events/${event.id}/stream`}
          filter={query.filter}
          q={query.q}
          labels={labels}
          liveLabel={t("live")}
          newLabel={t("newWord")}
          showStatus
        />
      ) : null}
      <GalleryGrid
        items={page.items}
        labels={labels}
        showStatus
        actions={canMod ? (item) => <ModerationActions eventId={event.id} type={item.type} id={item.id} moderation={item.moderation} labels={moderationLabels} /> : undefined}
      />
      {page.nextCursor ? (
        <div className="text-center">
          <Link href={nextPageHref(base, query, page.nextCursor)} className="inline-flex min-h-11 items-center rounded-full bg-surface px-6 font-medium shadow-sm">
            {t("loadMore")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
