// npm run db:seed:prod: the plans and e-card templates, and nothing else. Safe to run on every start.
// It creates no user, no admin and no event; ADMIN_EMAILS makes an admin when that person signs in.

import { PrismaClient } from "@prisma/client";
import { seedReferenceData } from "./seed-reference";

const prisma = new PrismaClient();

async function main() {
  const { plans, templates } = await seedReferenceData(prisma);
  console.log(`seed: ${plans} plans, ${templates} templates`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());