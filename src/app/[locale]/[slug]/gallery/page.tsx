import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GalleryGrid } from "@/components/gallery/gallery-grid";
import { GalleryToolbar, nextPageHref } from "@/components/gallery/gallery-toolbar";
import { LiveItems } from "@/components/gallery/live-items";
import { galleryLabels } from "@/components/host/labels";
import { LocaleToggle } from "@/components/locale-toggle";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { readGuestContext } from "@/server/guests/context";
import { GALLERY_FILTERS, galleryQuerySchema, listGallery } from "@/server/gallery/service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The guest view of the gallery: only when the host made it public, and the PIN (if any) was entered. */
export default async function GuestGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const context = await readGuestContext(slug);
  if (!context || context.event.galleryVisibility !== "GUESTS" || !context.pinOk) notFound();
  const { event } = context;
  const query = galleryQuerySchema.parse(await searchParams);
  const [t, tg, tc, tr, labels, page] = await Promise.all([
    getTranslations("guest"),
    getTranslations("gallery"),
    getTranslations("common"),
    getTranslations("report"),
    galleryLabels(),
    listGallery(event.id, query, "guest"),
  ]);
  const base = `/${slug}/gallery`;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12">
      <div className="flex items-center justify-between py-3">
        <Link href={`/${slug}`} className="inline-flex min-h-11 items-center text-sm text-muted underline">
          ← {t("back")}
        </Link>
        <LocaleToggle locale={locale as Locale} label={tc("switchTo")} />
      </div>
      <h1 className="mb-4 font-serif text-3xl">{t("galleryTitle", { names: event.hostNames })}</h1>
      <div className="space-y-4">
        <GalleryToolbar
          base={base}
          formAction={getPathname({ href: base, locale: locale as Locale })}
          query={query}
          labels={labels}
          filters={GALLERY_FILTERS}
        />
        {!query.after && query.sort === "newest" ? (
          <LiveItems
            streamUrl={`/api/e/${slug}/stream`}
            filter={query.filter}
            q={query.q}
            labels={labels}
            liveLabel={tg("live")}
            newLabel={tg("newWord")}
            showStatus={false}
          />
        ) : null}
        <GalleryGrid items={page.items} labels={labels} showStatus={false} />
        {page.nextCursor ? (
          <div className="text-center">
            <Link href={nextPageHref(base, query, page.nextCursor)} className="inline-flex min-h-11 items-center rounded-full bg-surface px-6 font-medium shadow-sm">
              {tg("loadMore")}
            </Link>
          </div>
        ) : null}
      </div>
      <p className="mt-8 text-center">
        <Link href={`/${slug}/report`} className="inline-flex min-h-11 items-center text-sm text-muted underline">
          {tr("link")}
        </Link>
      </p>
    </main>
  );
}
