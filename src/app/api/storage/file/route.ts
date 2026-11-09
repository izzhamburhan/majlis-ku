import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { apiError } from "@/server/http";
import { verifyStorageParams } from "@/server/media/signing";
import { localDriver, storageSecret } from "@/server/media/storage";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  zip: "application/zip",
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function contentType(key: string, filename?: string): string {
  const ext = (filename ?? key).split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? "application/octet-stream";
}

/** Local driver only: serves a private file to the holder of a signed, expiring URL. Supports Range for video and audio. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const verified = verifyStorageParams("get", params, storageSecret());
  if (!verified.ok) return apiError(verified.code, 403);

  const store = localDriver();
  if (!store) return apiError("not_found", 404);
  const path = store.pathFor(verified.key);
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return apiError("not_found", 404);
  }

  const headers = new Headers({
    "Content-Type": contentType(verified.key, verified.filename),
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  });
  if (verified.filename) {
    headers.set("Content-Disposition", `attachment; filename="${verified.filename.replace(/[^\w.\- ]/g, "_")}"`);
  }

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const body = Readable.toWeb(store.createReadStream(verified.key, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  return new Response(Readable.toWeb(store.createReadStream(verified.key)) as ReadableStream, { status: 200, headers });
}