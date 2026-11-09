import "server-only";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Upload } from "@prisma/client";
import { db } from "@/server/db";
import { uploadToItem, wishToItem } from "@/server/gallery/items";
import { makeVideoCopies, makeVoiceCopy } from "@/server/media/ffmpeg";
import { THUMB_WIDTH } from "@/server/media/images";
import { mediaQueue } from "@/server/media/job-queue";
import { uploadKey } from "@/server/media/keys";
import sharp from "@/server/media/sharp";
import { storage } from "@/server/media/storage";
import { MAX_VOICE_SECONDS } from "@/server/plans/limits";
import { bus } from "@/server/realtime/bus";

/** Tell live galleries and the slideshow about an upload's current state. */
export async function publishUpload(uploadId: string): Promise<void> {
  const upload = await db.upload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.status !== "READY") return;
  bus.publish(upload.eventId, { type: "item", item: await uploadToItem(upload, "host") });
}

export async function publishWish(wishId: string): Promise<void> {
  const wish = await db.wish.findUnique({ where: { id: wishId } });
  if (wish) bus.publish(wish.eventId, { type: "item", item: wishToItem(wish) });
}

/** Give the plan back its slot and delete the files when processing fails. */
async function markFailed(upload: Upload, reason: string): Promise<void> {
  console.warn(`[media] upload ${upload.id} failed: ${reason}`);
  await db.$transaction([
    db.upload.update({ where: { id: upload.id }, data: { status: "FAILED" } }),
    db.event.update({ where: { id: upload.eventId }, data: { uploadCount: { decrement: 1 }, storageBytes: { decrement: upload.sizeBytes } } }),
  ]);
  await storage().deletePrefix(`events/${upload.eventId}/${upload.id}`);
}

/** What processMedia runs ffmpeg through and where it keeps temporary files; tests replace them. */
export type MediaRunner = {
  makeVideoCopies: typeof makeVideoCopies;
  makeVoiceCopy: typeof makeVoiceCopy;
  tmpRoot: string;
};

/** Convert one video or voice upload. Everything it writes to disk lives in one temporary folder that is always removed. */
export async function processMedia(uploadId: string, runner: Partial<MediaRunner> = {}): Promise<void> {
  const { makeVideoCopies: makeVideo = makeVideoCopies, makeVoiceCopy: makeVoice = makeVoiceCopy, tmpRoot = tmpdir() } = runner;
  const upload = await db.upload.findUnique({ where: { id: uploadId }, include: { event: { include: { plan: true } } } });
  if (!upload || upload.status !== "PROCESSING") return;
  const store = storage();
  const work = await mkdtemp(join(tmpRoot, "majlis-media-"));
  try {
    const input = join(work, "input");
    await store.downloadToFile(upload.objectKey, input);
    if (upload.kind === "VIDEO") {
      const maxSeconds = upload.event.plan.maxVideoSeconds ?? 60;
      const copies = await makeVideo(input, work, { maxSeconds });
      if (copies.durationSec > maxSeconds + 1) return await markFailed(upload, "too_long");
      const poster = await readFile(copies.poster);
      const meta = await sharp(poster).metadata();
      const thumb = await sharp(poster).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
      const displayKey = uploadKey(upload.eventId, upload.id, "display.mp4");
      const thumbKey = uploadKey(upload.eventId, upload.id, "thumb.webp");
      await store.putObjectFromFile(displayKey, copies.video, "video/mp4");
      await store.putObject(thumbKey, thumb, "image/webp");
      await db.upload.update({
        where: { id: upload.id },
        data: {
          status: "READY",
          displayKey,
          thumbKey,
          durationSec: Math.round(copies.durationSec),
          width: meta.width ?? null,
          height: meta.height ?? null,
        },
      });
    } else if (upload.kind === "VOICE") {
      const copy = await makeVoice(input, work);
      if (copy.durationSec > MAX_VOICE_SECONDS + 1) return await markFailed(upload, "too_long");
      const displayKey = uploadKey(upload.eventId, upload.id, "display.m4a");
      await store.putObjectFromFile(displayKey, copy.audio, "audio/mp4");
      await db.upload.update({ where: { id: upload.id }, data: { status: "READY", displayKey, durationSec: Math.round(copy.durationSec) } });
    } else {
      return;
    }
    await publishUpload(upload.id);
  } catch (error) {
    await markFailed(upload, error instanceof Error ? error.message.slice(0, 200) : "unknown");
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Queue processing; video and voice have separate lanes so a long video never delays voice notes. */
export function enqueueProcessing(upload: Pick<Upload, "id" | "kind">): Promise<void> {
  return mediaQueue.enqueue(upload.kind === "VIDEO" ? "video" : "voice", () => processMedia(upload.id)).catch((error) => {
    console.error(`[media] job for ${upload.id} crashed`, error);
  });
}

/** At start-up: pick up uploads that were still processing when the server stopped. */
export async function resumeProcessing(): Promise<number> {
  const stuck = await db.upload.findMany({ where: { status: "PROCESSING" }, select: { id: true, kind: true } });
  for (const upload of stuck) void enqueueProcessing(upload);
  return stuck.length;
}
