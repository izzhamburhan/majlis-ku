import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalDocument } from "@/components/legal-document";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { db } from "@/server/db";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  return { title: t("title") };
}

const SECTIONS = ["controller", "collected", "purpose", "access", "processors", "retention", "deletion", "cookies", "contact"] as const;

// Read per request so a plan edit by an admin shows at once.
export const dynamic = "force-dynamic";

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, plans] = await Promise.all([
    getTranslations("legal.privacy.retention"),
    db.plan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const retention = (
    <>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/85">
        {plans.map((plan) => (
          <li key={plan.id}>{t("plan", { name: locale === "ms" ? plan.nameMs : plan.nameEn, days: plan.retentionDays })}</li>
        ))}
      </ul>
      <p className="mt-2 text-ink/85">{t("after")}</p>
    </>
  );
  return (
    <>
      <SiteHeader />
      <LegalDocument ns="privacy" sections={SECTIONS} extra={{ retention }} />
      <SiteFooter />
    </>
  );
}
