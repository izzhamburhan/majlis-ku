import { randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { apiError } from "@/server/http";
import { isIncomingKey } from "@/server/media/keys";
import { verifyStorageParams } from "@/server/media/signing";
import { localDriver, storageSecret } from "@/server/media/storage";

export const runtime = "nodejs";

/** Local driver only: receives the browser's PUT to a signed upload URL and writes it to disk. */
export async function PUT(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const store = localDriver();
  if (!store) return apiError("not_found", 404);
  const verified = verifyStorageParams("put", params, storageSecret());
  if (!verified.ok) return apiError(verified.code, 403);
  // A signed URL writes to the staging key only; completeUpload moves verified files to where they are served from.
  if (!isIncomingKey(verified.key)) return apiError("forbidden", 403);
  const maxBytes = verified.maxBytes ?? 0;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return apiError("too_large", 413);
  if (!request.body) return apiError("empty", 400);

  const target = store.pathFor(verified.key);
  const temp = `${target}.part-${process.pid}-${Date.now()}-${randomUUID()}`;
  await mkdir(dirname(target), { recursive: true });

  let received = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) callback(new Error("too_large"));
      else callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(request.body as WebReadableStream), limit, createWriteStream(temp));
    if (received === 0) throw new Error("empty");
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true });
    const code = error instanceof Error && error.message === "too_large" ? "too_large" : "upload_failed";
    return apiError(code, code === "too_large" ? 413 : 400);
  }
  return new Response(null, { status: 204 });
}