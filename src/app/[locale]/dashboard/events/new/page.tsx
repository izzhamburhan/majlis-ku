import { getTranslations, setRequestLocale } from "next-intl/server";
import { EventForm } from "@/components/host/event-form";
import { eventFormLabels } from "@/components/host/labels";
import { SiteHeader } from "@/components/site-header";
import { StoriRoot } from "@/components/stori-root";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { BRAND_COLOR } from "@/lib/brand";
import { utcToKlLocal } from "@/lib/dates";
import { display, ui } from "@/lib/fonts";
import { requireUser } from "@/server/auth/session";
import { createEventAction } from "@/server/events/actions";

export default async function NewEventPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale as Locale);
  const [t, tc, labels] = await Promise.all([getTranslations("eventForm"), getTranslations("common"), eventFormLabels("create")]);
  // Default: four weeks from now at 11:00 Malaysia time.
  const inFourWeeks = utcToKlLocal(new Date(Date.now() + 28 * 24 * 60 * 60 * 1000)).slice(0, 10);
  return (
    <StoriRoot className={`${display.variable} ${ui.variable}`}>
      <SiteHeader />
      <main className="mx-auto max-w-xl px-4 py-6">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm text-muted underline">
          ← {tc("back")}
        </Link>
        <h1 className="mt-2 mb-6 font-serif text-3xl">{t("newTitle")}</h1>
        <EventForm
          action={createEventAction.bind(null, locale as Locale)}
          labels={labels}
          defaults={{
            type: "WEDDING",
            title: "",
            hostNames: "",
            startsAtLocal: `${inFourWeeks}T11:00`,
            venueName: "",
            venueAddress: "",
            googleMapsUrl: "",
            wazeUrl: "",
            welcomeText: "",
            themeColor: BRAND_COLOR,
          }}
        />
      </main>
    </StoriRoot>
  );
}
