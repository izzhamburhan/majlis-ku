// npx prisma db seed: plans, templates, and a demo host with one demo event. Safe to run twice.
// All people and events here are invented.

import { PrismaClient } from "@prisma/client";
import { seedReferenceData } from "./seed-reference";

const prisma = new PrismaClient();

async function main() {
  const { plans, templates } = await seedReferenceData(prisma); // shared with prisma/seed-production.ts

  const host = await prisma.user.upsert({
    where: { email: "demo.host@majlisku.test" },
    update: {},
    create: { email: "demo.host@majlisku.test", name: "Demo Host", emailVerified: new Date() },
  });
  await prisma.user.upsert({
    where: { email: "admin@majlisku.test" },
    update: { role: "ADMIN" },
    create: { email: "admin@majlisku.test", name: "Admin", role: "ADMIN", emailVerified: new Date() },
  });

  const premium = await prisma.plan.findUniqueOrThrow({ where: { code: "PREMIUM" } });
  const existing = await prisma.event.findUnique({ where: { slug: "demo-aisyah-daniel" } });
  if (!existing) {
    await prisma.event.create({
      data: {
        slug: "demo-aisyah-daniel",
        type: "WEDDING",
        status: "ACTIVE",
        title: "Walimatulurus Aisyah & Daniel",
        hostNames: "Aisyah & Daniel",
        startsAt: new Date("2026-12-12T03:00:00Z"),
        venueName: "Dewan Seri Demo",
        venueAddress: "Jalan Contoh 1, Kuala Lumpur",
        welcomeText: "Terima kasih kerana meraikan hari bahagia kami. Kongsikan gambar dan ucapan anda!",
        planId: premium.id,
        planActivatedAt: new Date(),
        members: { create: { userId: host.id, role: "OWNER" } },
      },
    });
  }
  console.log(`seed: ${plans} plans, ${templates} templates, demo host, admin, demo event`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
