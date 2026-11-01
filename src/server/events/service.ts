import "server-only";
import { Prisma, type EventMemberRole, type UserRole } from "@prisma/client";
import { env } from "@/lib/env";
import type { EventFormInput, EventSettingsInput } from "@/lib/schemas/event";
import { canAccessAdmin } from "@/server/auth/roles";
import { db } from "@/server/db";
import { hashPin } from "@/server/guests/pin";
import { computePurgeAt, nextPurgeAt } from "./retention";
import { isReservedSlug, makeSlug } from "./slug";

/** New events start on the Free plan. An admin can change the plan (payments are deferred). */
export async function createEvent(userId: string, input: EventFormInput) {
  const plan = await db.plan.findUniqueOrThrow({ where: { code: "FREE" } });
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = makeSlug(input.hostNames);
    if (isReservedSlug(slug)) continue;
    try {
      return await db.event.create({
        data: {
          ...input,
          slug,
          status: "ACTIVE",
          planId: plan.id,
          planActivatedAt: new Date(),
          purgeAt: computePurgeAt({ startsAt: input.startsAt, retentionDays: plan.retentionDays }),
          members: { create: { userId, role: "OWNER" } },
        },
      });
    } catch (error) {
      // Slug collision: try another suffix.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Could not find a free slug");
}

export async function updateEvent(eventId: string, input: EventFormInput) {
  const event = await db.event.findUniqueOrThrow({ where: { id: eventId }, include: { plan: true } });
  // The status guard stops an edit that lands after the purge's claim; count 0 means nothing was written.
  return db.event.updateMany({
    where: { id: eventId, status: { not: "ARCHIVED" } },
    data: { ...input, purgeAt: nextPurgeAt(event, input.startsAt, event.plan.retentionDays) },
  });
}

export async function updateEventSettings(eventId: string, settings: EventSettingsInput & { clearPin?: boolean }) {
  const data: Prisma.EventUpdateManyMutationInput = {
    galleryVisibility: settings.galleryVisibility,
    requireApproval: settings.requireApproval,
    shotsPerGuest: settings.shotsPerGuest,
  };
  if (settings.pin) data.pinHash = await hashPin(settings.pin);
  else if (settings.clearPin) data.pinHash = null;
  return db.event.updateMany({ where: { id: eventId, status: { not: "ARCHIVED" } }, data });
}

export async function listEventsForUser(userId: string) {
  return db.event.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "desc" },
    include: { plan: true, members: { where: { userId }, select: { role: true } } },
  });
}

export type MemberEvent = NonNullable<Awaited<ReturnType<typeof getEventForMember>>>;

/**
 * The event if `userId` is its owner or co-host (admins see every event), else null.
 * Callers turn null into a 404 so outsiders cannot tell whether an event exists.
 */
export async function getEventForMember(eventId: string, user: { id: string; role: UserRole; email?: string | null }) {
  const event = await db.event.findUnique({
    where: { id: eventId },
    include: { plan: true, members: { where: { userId: user.id }, select: { role: true } } },
  });
  if (!event) return null;
  const role: EventMemberRole | "ADMIN" | undefined = event.members[0]?.role ?? (canAccessAdmin(user, env().ADMIN_EMAILS) ? "ADMIN" : undefined);
  if (!role) return null;
  return { ...event, memberRole: role };
}

/** Upload URLs issued in the last hour and not yet confirmed count against the item limit. */
export async function pendingUploadCount(eventId: string) {
  return db.upload.count({
    where: { eventId, status: "PENDING", createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
  });
}