// The one place that writes the reference data every database needs: plans and e-card templates.
// Both seeds call it (prisma/seed.ts for local development, prisma/seed-production.ts for a deployed database),
// so the two cannot drift. It only creates missing rows and never overwrites one an admin has edited.

import type { PlanCode } from "@prisma/client";
import { PLANS, TEMPLATES, type SeedPlan, type SeedTemplate } from "./seed-data";

// The two tables this seed may touch, and nothing else: no user, event or account can be created through it.
export type ReferenceDb = {
  plan: { upsert(args: { where: { code: PlanCode }; update: Record<string, never>; create: SeedPlan }): Promise<unknown> };
  template: { upsert(args: { where: { code: string }; update: Record<string, never>; create: SeedTemplate }): Promise<unknown> };
};

export async function seedReferenceData(db: ReferenceDb): Promise<{ plans: number; templates: number }> {
  for (const plan of PLANS) {
    await db.plan.upsert({ where: { code: plan.code }, update: {}, create: plan });
  }
  for (const template of TEMPLATES) {
    await db.template.upsert({ where: { code: template.code }, update: {}, create: template });
  }
  return { plans: PLANS.length, templates: TEMPLATES.length };
}
