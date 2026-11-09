import "server-only";
import { Readable } from "node:stream";
import archiver from "archiver";
import type { Event } from "@prisma/client";
import { formatEventDate, type AppLocale } from "@/lib/dates";
import { db } from "@/server/db";
import { storage } from "@/server/media/storage";
import { wishesPdf } from "./wishes-pdf";
import { wishesCsv, zipEntryName } from "./zip";

export async function eventWishesPdf(event: Event, locale: AppLocale): Promise<Buffer> {
  const wishes = await db.wish.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } });
  return wishesPdf({
    hostNames: event.hostNames,
    title: event.title,
    dateText: formatEventDate(event.startsAt, locale),
    themeColor: event.themeColor,
    locale,
    wishes,
  });
}

/**
 * A ZIP stream: every original upload in its folder, plus the wishes as PDF and CSV. Built on the fly, never stored.
 * Entries are added one at a time: an object is opened only after the previous entry is finished, so an export of
 * hundreds of files never holds hundreds of connections open or buffers a whole video.
 */
export async function eventZipStream(event: Event, locale: AppLocale): Promise<ReadableStream<Uint8Array>> {
  const [uploads, wishes, pdf] = await Promise.all([
    db.upload.findMany({ where: { eventId: event.id, status: "READY" }, orderBy: { createdAt: "asc" } }),
    db.wish.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" } }),
    eventWishesPdf(event, locale),
  ]);

  // Photos and videos are already compressed; storing them is faster and barely bigger.
  const archive = archiver("zip", { store: true });
  archive.on("warning", (error) => console.warn("[export] zip warning", error.message));
  archive.on("error", (error) => console.error("[export] zip error", error));

  /**
   * Add one entry and wait until the archive has taken all of it. False when the archive failed or was closed
   * meanwhile (a cancelled download destroys it without an `entry` or `error`); the source stream is then closed too.
   */
  const append = (source: Readable | Buffer | string, data: { name: string; date?: Date }) =>
    new Promise<boolean>((resolve) => {
      const onEntry = () => finish(true);
      const onStop = () => finish(false);
      const finish = (ok: boolean) => {
        archive.off("entry", onEntry);
        archive.off("error", onStop);
        archive.off("close", onStop);
        if (!ok && source instanceof Readable) source.destroy();
        resolve(ok);
      };
      archive.once("entry", onEntry);
      archive.once("error", onStop);
      archive.once("close", onStop);
      archive.append(source, data);
    });

  const store = storage();
  const used = new Set<string>();
  void (async () => {
    for (const upload of uploads) {
      if (archive.destroyed) return;
      if (!(await store.stat(upload.objectKey))) continue;
      let stream: Readable;
      try {
        stream = await store.getObjectStream(upload.objectKey);
      } catch (error) {
        // Gone between the check and the open (a purge, or a delete from the dashboard): skip it like any missing file.
        if (await store.stat(upload.objectKey)) throw error;
        console.warn(`[export] upload ${upload.id} vanished during the export; skipped`);
        continue;
      }
      if (archive.destroyed) return void stream.destroy(); // cancelled while the object was opening
      if (!(await append(stream, { name: zipEntryName(upload, used), date: upload.createdAt }))) return archive.destroy();
    }
    if (archive.destroyed) return;
    if (!(await append(pdf, { name: "ucapan.pdf" }))) return archive.destroy();
    if (!(await append(wishesCsv(wishes), { name: "ucapan.csv" }))) return archive.destroy();
    await archive.finalize();
  })().catch((error: unknown) => archive.destroy(error instanceof Error ? error : new Error("export failed")));
  return Readable.toWeb(archive) as ReadableStream<Uint8Array>;
}
