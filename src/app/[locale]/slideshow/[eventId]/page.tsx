import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Slideshow } from "@/components/slideshow/slideshow";
import { formatEventDay } from "@/lib/dates";
import { display, pen, ui } from "@/lib/fonts";
import { songketVars } from "@/lib/songket";
import type { Locale } from "@/i18n/routing";
import { slideshowOptionsSchema } from "@/lib/schemas/slideshow";
import { eventUrl, requireEventMember } from "@/server/events/access";
import { slideshowItems } from "@/server/slideshow/service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Full-screen venue display. Hosts open it on the laptop connected to the TV or projector. */
export default async function SlideshowPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, eventId } = await params;
  setRequestLocale(locale);
  const { event } = await requireEventMember(locale as Locale, eventId);
  const [t, items, query] = await Promise.all([
    getTranslations("slideshow"),
    slideshowItems(event.id),
    searchParams,
  ]);
  const options = slideshowOptionsSchema.parse(query);
  return (
    <div
      className={`${display.variable} ${ui.variable} ${pen.variable}`}
      style={songketVars(event.themeColor)}
    >
      <Slideshow
        eventId={event.id}
        hostNames={event.hostNames}
        themeColor={event.themeColor}
        dateLabel={formatEventDay(event.startsAt, locale as Locale)}
        initialItems={items}
        options={options}
        qrSrc={`/api/events/${event.id}/qr?format=svg`}
        shareUrl={eventUrl(event.slug)}
        labels={{
          scan: t("scan"),
          empty: t("empty"),
          fullscreen: t("fullscreen"),
          by: t("by", { name: "{name}" }),
          settings: t("settings"),
          close: t("close"),
          layout: t("layout"),
          layoutSingle: t("layoutSingle"),
          layoutCollage: t("layoutCollage"),
          layoutFilm: t("layoutFilm"),
          layoutMosaic: t("layoutMosaic"),
          layoutPhotobook: t("layoutPhotobook"),
          photobookFrom: t("photobookFrom", { name: "{name}" }),
        photobookFromAnon: t("photobookFromAnon"),
          frame: t("frame"),
          names: t("names"),
          rail: t("rail"),
          wishes: t("wishes"),
          railEmpty: t("railEmpty"),
          emptyMedia: t("emptyMedia"),
          qrAlt: t("qrAlt"),
        }}
      />
    </div>
  );
}
