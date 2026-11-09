import { createWriteStream } from "node:fs";
import { mkdir, open, rename, rm, stat as statFile, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageDriver, UploadTarget } from "./storage-driver";

export type S3StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** The most keys one DeleteObjects request may carry. */
const DELETE_BATCH = 1000;

/** `attachment` header with an ASCII fallback and the UTF-8 name, so a Malay or emoji filename survives. */
function attachmentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  // encodeURIComponent leaves ' ( ) * ! as they are, but RFC 5987 does not allow them in an ext-value.
  const encoded = encodeURIComponent(filename).replace(/['()*!]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** The file in 1 MB pieces. Plain reads, so no whole-file buffer and no experimental Node API. */
async function* fileChunks(file: FileHandle): AsyncGenerator<Buffer> {
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  for (;;) {
    const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
    if (bytesRead === 0) return;
    yield Buffer.from(buffer.subarray(0, bytesRead));
  }
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

/**
 * StorageDriver for any S3-compatible store (Supabase Storage, Cloudflare R2, AWS S3, MinIO). Path-style
 * addressing, so the endpoint host does not need a wildcard certificate. Browsers PUT and GET through presigned
 * URLs; this server never proxies guest media.
 */
export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;

  /** `client` is for tests; production builds its own from the config. */
  constructor(config: S3StorageConfig, client?: S3Client) {
    this.bucket = config.bucket;
    this.client =
      client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: true,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        // Newer SDKs add CRC32 checksum headers to every request by default. A browser PUT to a presigned URL
        // cannot send them, and S3-compatible stores other than AWS may reject them, so only when required.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      });
  }

  async createUploadUrl(
    key: string,
    options: { contentType: string; maxBytes: number; expiresInSec: number; sizeBytes?: number },
  ): Promise<UploadTarget> {
    // maxBytes is not signed: the bucket cannot enforce a range. The signed Content-Length does that job, and
    // completeUpload compares the stored size with the declared one.
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: options.contentType,
      ...(options.sizeBytes === undefined ? {} : { ContentLength: options.sizeBytes }),
    });
    const signableHeaders = new Set(["content-type", ...(options.sizeBytes === undefined ? [] : ["content-length"])]);
    const url = await getSignedUrl(this.client, command, { expiresIn: options.expiresInSec, signableHeaders });
    // The browser sets Content-Type itself (the one signed here), so no header is handed to it.
    return { url, method: "PUT", headers: {} };
  }

  async getDownloadUrl(key: string, options: { expiresInSec: number; filename?: string }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options.filename ? { ResponseContentDisposition: attachmentDisposition(options.filename) } : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn: options.expiresInSec });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: head.ContentLength ?? 0 };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async readHead(key: string, bytes: number): Promise<Buffer> {
    if (bytes <= 0) return Buffer.alloc(0);
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    // A store that ignores the Range header sends the whole object; never hand back more than was asked for.
    return Buffer.from(await this.bodyOf(response.Body).transformToByteArray()).subarray(0, bytes);
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await this.bodyOf(response.Body).transformToByteArray());
  }

  async getObjectStream(key: string): Promise<Readable> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    // Duck-typed: instanceof Readable fails for a stream made by another copy of Node's stream module.
    const body = response.Body as { pipe?: unknown } | undefined;
    if (body && typeof body.pipe === "function") return body as Readable;
    throw new Error("S3 returned a body that is not a Node stream");
  }

  async downloadToFile(key: string, path: string): Promise<void> {
    const stream = await this.getObjectStream(key);
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.part-${process.pid}-${Date.now()}`;
    try {
      await pipeline(stream, createWriteStream(temp));
      await rename(temp, path);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  async putObjectFromFile(key: string, path: string, contentType: string): Promise<void> {
    const { size } = await statFile(path);
    const file = await open(path, "r");
    try {
      // A known length lets the SDK stream the file instead of buffering it. The SDK cannot hash a streamed
      // body, so it sends it with an unsigned payload, which it does only over https: S3_ENDPOINT must be an https URL.
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: Readable.from(fileChunks(file), { objectMode: false }),
          ContentType: contentType,
          ContentLength: size,
        }),
      );
    } finally {
      await file.close();
    }
  }

  async copyObject(from: string, to: string, options: { contentType?: string } = {}): Promise<void> {
    const source = from.split("/").map(encodeURIComponent).join("/");
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: to,
        CopySource: `${this.bucket}/${source}`,
        // REPLACE, not COPY: the guest PUT the incoming object, so its Content-Type, Content-Disposition, Cache-Control
        // and metadata are the guest's choice and must not reach the object that gets served.
        MetadataDirective: "REPLACE",
        ContentType: options.contentType ?? "application/octet-stream",
        ContentDisposition: "inline",
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string): Promise<void> {
    const folder = prefix.replace(/^\/+/, "").replace(/\/+$/, "");
    // An empty prefix would list the whole bucket.
    if (!folder) throw new RangeError("deletePrefix needs a folder");
    const Prefix = `${folder}/`;
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix, ...(token ? { ContinuationToken: token } : {}) }),
      );
      const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []));
      for (let i = 0; i < keys.length; i += DELETE_BATCH) {
        const result = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.slice(i, i + DELETE_BATCH).map((Key) => ({ Key })), Quiet: true },
          }),
        );
        // DeleteObjects answers 200 even when single keys fail.
        if (result.Errors?.length) {
          throw new Error(`Could not delete ${result.Errors.length} object(s): ${result.Errors[0]?.Code ?? "unknown error"}`);
        }
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  }

  private bodyOf(body: unknown): { transformToByteArray(): Promise<Uint8Array> } {
    if (body && typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
      return body as { transformToByteArray(): Promise<Uint8Array> };
    }
    throw new Error("S3 returned an empty body");
  }
}