import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { CardBuilder } from "@/components/host/card-builder";
import { CopyButton } from "@/components/host/copy-button";
import type { Locale } from "@/i18n/routing";
import { env } from "@/lib/env";
import { DEFAULT_CARD } from "@/lib/schemas/card";
import { getCard, listTemplates, signedCardMedia } from "@/server/ecard/service";
import { requireEventMember } from "@/server/events/access";
import { canModerate } from "@/server/moderation/rules";

export default async function CardBuilderPage({ params }: { params: Promise<{ locale: string; eventId: string }> }) {
  const { locale, eventId } = await params;
  setRequestLocale(locale);
  const { event } = await requireEventMember(locale as Locale, eventId);
  const [t, tc, tn, messages] = await Promise.all([getTranslations("ecard"), getTranslations("common"), getTranslations("eventNav"), getMessages()]);

  if (!event.plan.includesEcard) {
    return <p className="rounded-2xl bg-surface p-6 text-ink/70">{t("locked")}</p>;
  }

  // An admin who is not a member only sees the note, so skip loading templates, card and signed media.
  const editable = canModerate(event);
  const [templates, card] = editable ? await Promise.all([listTemplates(), getCard(event.id)]) : [[], null];
  // A deactivated template the card still uses stays visible as the selected tile.
  if (card && !templates.some((tpl) => tpl.id === card.templateId)) templates.push({ ...card.template, style: card.style });
  const content = card?.content ?? { ...DEFAULT_CARD, names: event.hostNames, headline: event.title };
  const media = card ? await signedCardMedia(card) : { photos: [], music: null };
  const url = `${env().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/i/${event.slug}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(t("whatsappText", { names: content.names || event.hostNames, url }))}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div>
        <h2 className="mb-4 font-serif text-3xl">{t("title")}</h2>
        {editable ? (
        <NextIntlClientProvider messages={{ ecard: messages.ecard }}>
          <CardBuilder
            eventId={event.id}
            templates={templates.map((tpl) => ({ id: tpl.id, name: locale === "ms" ? tpl.nameMs : tpl.nameEn, style: tpl.style }))}
            initial={{ ...content, templateId: card?.templateId ?? templates[0]!.id, published: card?.published ?? false }}
            photos={content.photoKeys.map((key, i) => ({ key, url: media.photos[i] ?? "" }))}
            musicUrl={media.music}
          />
        </NextIntlClientProvider>
        ) : (
          <p className="rounded-2xl bg-surface p-6 text-ink/70">{tn("adminReadOnly")}</p>
        )}
      </div>
      <aside className="h-fit space-y-3 rounded-2xl bg-surface p-5 shadow-sm lg:sticky lg:top-4">
        <p className="text-sm font-medium">{t("shareLink")}</p>
        <p className="rounded-xl bg-cream p-3 font-mono text-sm break-all" data-testid="card-url">
          {url}
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={url} label={tc("copy")} copiedLabel={tc("copied")} />
          <a href={`/${locale === "ms" ? "" : "en/"}i/${event.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-ink/20 px-4 text-sm font-medium">
            {t("open")} ↗
          </a>
          <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full bg-[#25d366] px-4 text-sm font-medium text-white" /* stori-keep: WhatsApp green */>
            {t("whatsapp")}
          </a>
        </div>
      </aside>
    </div>
  );
}
