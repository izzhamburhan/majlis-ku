import { requireEventMemberApi } from "@/server/events/access";
import { streamQuerySchema } from "@/lib/schemas/slideshow";
import { ApiError, handle } from "@/server/http";
import { toHostMessage, toSlideshowMessage } from "@/server/realtime/bus";
import { sseResponse } from "@/server/realtime/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live updates: the host gallery gets every item; `?view=slideshow` gets only what a guest may see. */
export const GET = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { event } = await requireEventMemberApi(id);
  const query = streamQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) throw new ApiError("validation", 400, query.error.issues.map((i) => i.message).join("; "));
  return sseResponse(request, event.id, query.data.view === "slideshow" ? toSlideshowMessage : toHostMessage);
});
