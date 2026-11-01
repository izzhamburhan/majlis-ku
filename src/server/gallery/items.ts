import type { ModerationState, Upload, UploadKind, Wish } from "@prisma/client";
import { env } from "@/lib/env";
import { MEDIA_URL_TTL_SEC, storage } from "@/server/media/storage";
import { guestKeyFor } from "./guest-key";

/** What the gallery, the live stream and the slideshow render. Dates become strings over SSE. */
export type GalleryItem =
  | {
      type: "upload";
      id: string;
      kind: UploadKind;
      guestName: string;
      /** Groups a guest's items (Photobook); absent on items built before it existed. */
      guestKey?: string | null;
      createdAt: Date | string;
      moderation: ModerationState;
      width: number | null;
      height: number | null;
      durationSec: number | null;
      thumbUrl: string | null;
      displayUrl: string | null;
      originalUrl: string | null;
    }
  | {
      type: "wish";
      id: string;
      guestName: string;
      guestKey?: string | null;
      createdAt: Date | string;
      moderation: ModerationState;
      message: string;
    };

export type Audience = "host" | "guest";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
};

export function originalFilename(upload: Pick<Upload, "id" | "guestName" | "mimeType">): string {
  const ext = EXTENSIONS[upload.mimeType.split(";")[0]!.trim()] ?? "bin";
  const name = upload.guestName.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 30) || "tetamu";
  return `${name}-${upload.id}.${ext}`;
}

/** Signed URLs are made here, after the caller has checked access. Guests never get the original. */
export async function uploadToItem(upload: Upload, audience: Audience): Promise<GalleryItem> {
  const store = storage();
  const sign = (key: string | null, filename?: string) =>
    key ? store.getDownloadUrl(key, { expiresInSec: MEDIA_URL_TTL_SEC, ...(filename ? { filename } : {}) }) : Promise.resolve(null);
  const [thumbUrl, displayUrl, originalUrl] = await Promise.all([
    sign(upload.thumbKey),
    sign(upload.displayKey),
    audience === "host" ? sign(upload.objectKey, originalFilename(upload)) : Promise.resolve(null),
  ]);
  return {
    type: "upload",
    id: upload.id,
    kind: upload.kind,
    guestName: upload.guestName,
    guestKey: guestKeyFor(upload.guestId, env().HASH_SALT),
    createdAt: upload.createdAt,
    moderation: upload.moderation,
    width: upload.width,
    height: upload.height,
    durationSec: upload.durationSec,
    thumbUrl,
    displayUrl,
    originalUrl,
  };
}

export function wishToItem(wish: Wish): GalleryItem {
  return {
    type: "wish",
    id: wish.id,
    guestName: wish.guestName,
    guestKey: guestKeyFor(wish.guestId, env().HASH_SALT),
    createdAt: wish.createdAt,
    moderation: wish.moderation,
    message: wish.message,
  };
}