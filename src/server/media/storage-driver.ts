// The storage boundary. `local` (disk) and `s3` (S3-compatible: Supabase, R2, S3) implement the same interface.
import type { Readable } from "node:stream";

export type UploadTarget = { url: string; method: "PUT"; headers: Record<string, string> };

export interface StorageDriver {
  /**
   * A short-lived URL the browser PUTs the file to. `sizeBytes` is the size the guest declared; a driver that can
   * (S3) signs it as the Content-Length, so a different size is refused by the bucket itself.
   */
  createUploadUrl(
    key: string,
    options: { contentType: string; maxBytes: number; expiresInSec: number; sizeBytes?: number },
  ): Promise<UploadTarget>;
  /** A short-lived URL for reading a private object. Create it only after an access check. */
  getDownloadUrl(key: string, options: { expiresInSec: number; filename?: string }): Promise<string>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  stat(key: string): Promise<{ size: number } | null>;
  readHead(key: string, bytes: number): Promise<Buffer>;
  getObject(key: string): Promise<Buffer>;
  /** The object as a stream, opened when called. Rejects when the object does not exist. */
  getObjectStream(key: string): Promise<Readable>;
  /** Copy the object to a local file (created or replaced). Rejects when the object does not exist. */
  downloadToFile(key: string, path: string): Promise<void>;
  /** Store a local file as an object without loading it into memory. */
  putObjectFromFile(key: string, path: string, contentType: string): Promise<void>;
  /**
   * Copy inside the store; the source stays. Rejects when the source does not exist. The copy never inherits the
   * source's headers or metadata (a guest chose those): a store that keeps them sets `contentType` and an inline
   * disposition instead. The local driver has no headers and ignores `contentType`.
   */
  copyObject(from: string, to: string, options?: { contentType?: string }): Promise<void>;
  deleteObject(key: string): Promise<void>;
  /** Delete everything in the folder `prefix`. `events/a` and `events/a/` both mean the folder, never `events/ab/`. */
  deletePrefix(prefix: string): Promise<void>;
}
