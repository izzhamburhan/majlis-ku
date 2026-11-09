import "server-only";
import type { Plan } from "@prisma/client";
import type { Locale } from "@/i18n/routing";
import { formatSen } from "@/lib/money";
import { db } from "@/server/db";

/** The plan columns the landing page may show. Nothing else leaves the server. */
export type PublicPlan = Pick<
  Plan,
  "code" | "nameMs" | "nameEn" | "priceSen" | "uploadLimit" | "retentionDays" | "includesGallery" | "includesEcard"
>;

export type PlanCard = {
  code: PublicPlan["code"];
  name: string;
  /** `RM 40.00`, formatted from integer sen. */
  price: string;
  /** The stored limit; `null` means unlimited (fair use). */
  uploadLimit: number | null;
  unlimited: boolean;
  retentionDays: number;
  includesGallery: boolean;
  includesEcard: boolean;
};

/** Active plans in display order (sortOrder, then code so ties stay stable), read from the database (admins edit them). Called from Server Components only. */
export function listPublicPlans(): Promise<PublicPlan[]> {
  return db.plan.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: {
      code: true,
      nameMs: true,
      nameEn: true,
      priceSen: true,
      uploadLimit: true,
      retentionDays: true,
      includesGallery: true,
      includesEcard: true,
    },
  });
}

/** Pure: one plan row as the landing page shows it, in the visitor's language. */
export function planCard(plan: PublicPlan, locale: Locale): PlanCard {
  return {
    code: plan.code,
    name: locale === "en" ? plan.nameEn : plan.nameMs,
    price: formatSen(plan.priceSen),
    uploadLimit: plan.uploadLimit,
    unlimited: plan.uploadLimit === null,
    retentionDays: plan.retentionDays,
    includesGallery: plan.includesGallery,
    includesEcard: plan.includesEcard,
  };
}