import { cookies } from "next/headers";
import { z } from "zod";
import { ensureDeviceHash, findGuestEvent } from "@/server/guests/context";
import { pinCookieName, signPinPass, verifyPin } from "@/server/guests/pin";
import { ApiError, clientIpHash, handle, readJson } from "@/server/http";
import { storageSecret } from "@/server/media/storage";
import { limiters } from "@/server/security/rate-limit";

const bodySchema = z.object({ pin: z.string().trim().regex(/^\d{4,8}$/) });

export const POST = handle(async (request: Request, { params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params;
  const { pin } = await readJson(request, bodySchema);
  const event = await findGuestEvent(slug);
  if (!event) throw new ApiError("not_found", 404);
  const deviceHash = await ensureDeviceHash();
  if (!event.pinHash) return new Response(null, { status: 204 });

  const key = `${event.id}:${deviceHash}`;
  if (!(await limiters.pinAttempt.hit(key)).ok) throw new ApiError("locked", 429);
  // Also per IP, so clearing cookies does not give a fresh set of guesses. Only wrong PINs count: check first, add on a wrong one,
  // so guests sharing one address are not locked out by correct entries. Never reset: one guest's success must not clear it for everyone.
  const ipKey = `${event.id}:${await clientIpHash()}`;
  if (!(await limiters.pinIp.peek(ipKey)).ok) throw new ApiError("locked", 429);
  if (!(await verifyPin(pin, event.pinHash))) {
    await limiters.pinIp.hit(ipKey);
    throw new ApiError("invalid_pin", 403);
  }

  await limiters.pinAttempt.reset(key);
  (await cookies()).set(pinCookieName(event.id), signPinPass(event.id, deviceHash, storageSecret()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return new Response(null, { status: 204 });
});