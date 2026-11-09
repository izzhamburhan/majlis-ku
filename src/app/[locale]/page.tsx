/* eslint-disable @next/next/no-img-element -- static landing photos in public/landing, sized by hand; the rest of the repo uses plain img too */
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StoriRoot } from "@/components/stori-root";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { display, ui } from "@/lib/fonts";
import { listPublicPlans, planCard } from "@/server/plans/public";

// Seven stock photos, resized. Sources and the model-release note are in docs/landing-photos.md.
const PHOTOS = {
  joy: { src: "/landing/couple-joy.jpg", width: 1400, height: 933 },
  pink: { src: "/landing/couple-pink.jpg", width: 960, height: 640 },
  mono: { src: "/landing/couple-mono.jpg", width: 720, height: 1080 },
  outdoor: { src: "/landing/couple-outdoor.jpg", width: 720, height: 1080 },
  leaves: { src: "/landing/bride-leaves.jpg", width: 720, height: 1147 },
  henna: { src: "/landing/bride-henna.jpg", width: 720, height: 1080 },
  veil: { src: "/landing/bride-veil.jpg", width: 720, height: 1079 },
} as const;

type PhotoKey = keyof typeof PHOTOS;

/** Guest photo cards: the photo and where to centre the crop. The sample guest's first name is in the messages. */
const STRIP: { key: Exclude<PhotoKey, "joy">; position: string }[] = [
  { key: "pink", position: "44% 30%" },
  { key: "henna", position: "50% 30%" },
  { key: "outdoor", position: "50% 40%" },
  { key: "leaves", position: "50% 20%" },
  { key: "mono", position: "50% 50%" },
  { key: "veil", position: "50% 18%" },
];

const gutter = "px-[clamp(1rem,4vw,3.5rem)]";
const section = "py-[clamp(4rem,8vw,7rem)]";
const heading = "font-serif text-[clamp(2.1rem,3.8vw,3.4rem)] leading-[1.08] text-balance";
const cta = "inline-flex min-h-14 items-center rounded-full bg-brand px-8 text-lg font-semibold text-on-brand hover:bg-brand-dark";
const phoneFrame = "relative mx-auto h-[31rem] w-[15.6rem] overflow-hidden rounded-[2.6rem] border-8 border-[var(--st-surface-lift)] shadow-2xl";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, plans] = await Promise.all([getTranslations("home"), listPublicPlans()]);
  const cards = plans.map((plan) => planCard(plan, locale as Locale));
  const alt = (key: PhotoKey) => t(`photos.${key}`);
  // The strip and the venue section show stock photos with invented guest names: say so where a sighted visitor looks.
  const badge = (
    <span data-testid="sample-badge" className="mb-4 inline-flex rounded-full border border-[var(--st-line)] px-3 py-1 text-sm font-semibold text-muted">
      {t("strip.badge")}
    </span>
  );

  return (
    <StoriRoot className={`${display.variable} ${ui.variable} overflow-x-clip`}>
      <SiteHeader />
      <main>
        <section className="relative isolate flex min-h-[clamp(46rem,62vw,52rem)] flex-col overflow-hidden">
          <img
            src={PHOTOS.joy.src}
            width={PHOTOS.joy.width}
            height={PHOTOS.joy.height}
            alt={alt("joy")}
            fetchPriority="high"
            decoding="async"
            className="st-hero absolute inset-0 -z-10 h-full w-full object-cover object-[62%_28%]"
          />
          {/* The scrim is at least 90% dusk wherever text sits (below the top fade, left of the side fade), so it holds 4.5:1 over any photo. */}
          <div className={`st-herocopy mt-auto pt-24 pb-12 sm:pb-16 lg:w-[62rem] ${gutter}`}>
            <div className="relative lg:max-w-[38rem]">
              <h1 className="max-w-[16ch] font-serif lg:max-w-none text-[clamp(2.4rem,5.6vw,5rem)] leading-[1.08] text-balance">{t("heroTitle")}</h1>
              <p className="mt-5 max-w-[32em] text-[clamp(1.1rem,1.6vw,1.35rem)] text-muted">{t("heroBody")}</p>
              <Link href="/dashboard" className={`${cta} mt-8`}>
                {t("cta")}
              </Link>
            </div>
          </div>
        </section>

        <section className={section}>
          <div className={gutter}>{badge}</div>
          <h2 className={`${heading} mb-10 max-w-[22em] ${gutter}`}>{t("strip.title")}</h2>
          <div role="region" tabIndex={0} aria-label={t("strip.label")} className={`st-strip flex gap-3.5 overflow-x-auto pt-3 pb-12 ${gutter}`}>
            {STRIP.map(({ key, position }) => (
              <figure key={key} className="st-card relative m-0 h-[30rem] w-[17rem] flex-none overflow-hidden rounded-[1.6rem]">
                <img
                  src={PHOTOS[key].src}
                  width={PHOTOS[key].width}
                  height={PHOTOS[key].height}
                  alt={alt(key)}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: position }}
                />
                <figcaption className="st-glass absolute bottom-3 left-3 rounded-full px-4 py-2 text-[0.95rem] font-semibold">{t(`strip.names.${key}`)}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className={`${gutter} pb-[clamp(4rem,8vw,7rem)]`}>
          <h2 className="sr-only">{t("steps.title")}</h2>
          <ol className="grid list-none gap-12 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
            {(
              [
                { id: "one", photo: "mono" },
                { id: "two", photo: "leaves" },
                { id: "three", photo: "outdoor" },
              ] as const
            ).map(({ id, photo }) => (
              <li key={id}>
                <div className={phoneFrame}>
                  <img
                    src={PHOTOS[photo].src}
                    width={PHOTOS[photo].width}
                    height={PHOTOS[photo].height}
                    alt={alt(photo)}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                  {id === "two" ? <span aria-hidden className="absolute bottom-5 left-1/2 size-16 -translate-x-1/2 rounded-full border-4 border-ink bg-brand" /> : null}
                </div>
                <h3 className="mx-auto mt-6 mb-1.5 max-w-[16ch] text-center font-serif text-[1.9rem] leading-tight text-balance">{t(`steps.${id}.title`)}</h3>
                <p className="mx-auto max-w-[22em] text-center text-muted">{t(`steps.${id}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={`bg-[var(--st-ground-deep)] ${section} ${gutter}`}>
          <div>
            {badge}
            <h2 className={heading}>{t("venue.title")}</h2>
            <p className="mt-3 mb-9 max-w-[30em] text-xl text-muted">{t("venue.body")}</p>
            <div className="flex flex-wrap overflow-hidden rounded-[1.6rem] border-[10px] border-surface bg-cream">
              <img
                src={PHOTOS.pink.src}
                width={PHOTOS.pink.width}
                height={PHOTOS.pink.height}
                alt={alt("pink")}
                loading="lazy"
                decoding="async"
                className="h-[clamp(18rem,40vw,35rem)] w-full min-w-0 flex-[2_1_26rem] object-cover"
              />
              <ul aria-label={t("venue.sample")} className="m-0 flex min-w-0 flex-[1_1_20rem] list-none flex-col justify-center gap-6 p-8">
                {(
                  [
                    ["wishOne", "wishOneBy"],
                    ["wishTwo", "wishTwoBy"],
                  ] as const
                ).map(([wish, by]) => (
                  <li key={wish} className="font-serif text-[1.6rem] leading-snug">
                    {t(`venue.${wish}`)}
                    <span className="mt-2 block font-sans text-base font-semibold text-brand">{t(`venue.${by}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={`${section} ${gutter}`}>
          <div className="flex flex-wrap gap-x-[clamp(2rem,6vw,6rem)] gap-y-8">
            <h2 className={`${heading} min-w-0 flex-[1_1_21rem]`}>{t("privacy.title")}</h2>
            <div className="min-w-0 flex-[1.2_1_25rem] space-y-3.5 text-xl text-muted">
              <p>{t("privacy.one")}</p>
              <p>{t("privacy.two")}</p>
              <p>{t("privacy.three")}</p>
            </div>
          </div>
        </section>

        {cards.length > 0 ? (
        <section className={`${gutter} pb-[clamp(4rem,8vw,7rem)]`}>
          <div>
            <h2 className={`${heading} mb-8`}>{t("pricing.title")}</h2>
            <div className="flex flex-col gap-3">
              {cards.map((card) => (
                <article
                  key={card.code}
                  data-testid="plan-card"
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-[2rem] bg-surface px-6 py-6 sm:px-9"
                >
                  <div className="min-w-0">
                    <h3 className="text-2xl font-semibold">{card.name}</h3>
                    <ul className="mt-1 flex list-none flex-wrap gap-x-4 gap-y-0.5 p-0 text-muted">
                      {card.includesGallery ? (
                        <>
                          <li>{card.unlimited ? t("pricing.unlimited") : t("pricing.uploads", { count: card.uploadLimit ?? 0 })}</li>
                          <li>{t("pricing.gallery")}</li>
                        </>
                      ) : null}
                      {card.includesEcard ? <li>{t("ecardTitle")}</li> : null}
                      <li>{t("pricing.retention", { days: card.retentionDays })}</li>
                    </ul>
                  </div>
                  <p data-testid="plan-price" className="font-serif text-[clamp(2.2rem,5vw,3.2rem)] leading-tight tabular-nums">
                    {card.price}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
        ) : null}

        <section className="relative isolate flex min-h-[28rem] flex-col items-center justify-center overflow-hidden px-4 py-16 text-center">
          <img
            src={PHOTOS.joy.src}
            width={PHOTOS.joy.width}
            height={PHOTOS.joy.height}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
          <div aria-hidden className="st-scrim absolute inset-0 -z-10" />
          <h2 className="mb-7 font-serif text-[clamp(2.6rem,6vw,5.2rem)] leading-[1.05] text-balance">{t("closing.title")}</h2>
          <Link href="/dashboard" className={cta}>
            {t("cta")}
          </Link>
        </section>
      </main>
      <SiteFooter />
    </StoriRoot>
  );
}
