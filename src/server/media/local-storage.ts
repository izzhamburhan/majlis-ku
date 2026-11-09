import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { assertSafeKey } from "./keys";
import { signStorageUrl } from "./signing";
import type { StorageDriver, UploadTarget } from "./storage-driver";

/** Files on the local disk; URLs are signed by the app and served by /api/storage/*. */
export class LocalStorageDriver implements StorageDriver {
  readonly root: string;

  constructor(
    root: string,
    private readonly secret: string,
  ) {
    this.root = resolve(root);
  }

  /** Absolute path for a key, refusing anything that would land outside the root. Local driver and its routes only. */
  pathFor(key: string): string {
    assertSafeKey(key);
    const path = resolve(join(this.root, ...key.split("/")));
    if (!path.startsWith(this.root + sep)) throw new RangeError(`Key escapes storage root: ${key}`);
    return path;
  }

  async createUploadUrl(
    key: string,
    { maxBytes, expiresInSec }: { contentType: string; maxBytes: number; expiresInSec: number; sizeBytes?: number },
  ): Promise<UploadTarget> {
    this.pathFor(key);
    return {
      url: signStorageUrl({ action: "put", key, expiresInSec, maxBytes, secret: this.secret }),
      method: "PUT",
      headers: {},
    };
  }

  async getDownloadUrl(key: string, { expiresInSec, filename }: { expiresInSec: number; filename?: string }): Promise<string> {
    this.pathFor(key);
    return signStorageUrl({ action: "get", key, expiresInSec, secret: this.secret, ...(filename ? { filename } : {}) });
  }

  // The content type only matters for S3; local files are typed by their extension when served.
  async putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const info = await stat(this.pathFor(key));
      return info.isFile() ? { size: info.size } : null;
    } catch {
      return null;
    }
  }

  async readHead(key: string, bytes: number): Promise<Buffer> {
    const handle = await open(this.pathFor(key), "r");
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async getObjectStream(key: string): Promise<Readable> {
    // Open now so a missing object rejects here; the handle closes when the stream ends or is destroyed.
    const handle = await open(this.pathFor(key), "r");
    return handle.createReadStream();
  }

  async downloadToFile(key: string, path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await copyFile(this.pathFor(key), path);
  }

  async putObjectFromFile(key: string, path: string, _contentType: string): Promise<void> {
    await this.copyInto(path, this.pathFor(key));
  }

  async copyObject(from: string, to: string): Promise<void> {
    await this.copyInto(this.pathFor(from), this.pathFor(to));
  }

  /** Copy to a temporary name and rename, so a reader never sees a half-written object. */
  private async copyInto(source: string, target: string): Promise<void> {
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.part-${process.pid}-${Date.now()}-${randomUUID()}`;
    try {
      await copyFile(source, temp);
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
  }

  /** Range reads for the /api/storage/file route. Everything else reads through getObjectStream. */
  createReadStream(key: string, range?: { start: number; end: number }): Readable {
    return createReadStream(this.pathFor(key), range);
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    const path = this.pathFor(prefix.replace(/\/+$/, ""));
    // The prefix is a folder: a file that happens to share its name is not part of it (same as S3 with a trailing slash).
    // Only "nothing there" means nothing to delete; a permission or disk error must not look like a finished delete.
    const info = await stat(path).catch((error: unknown) => {
      const code = (error as { code?: string } | null)?.code;
      if (code === "ENOENT" || code === "ENOTDIR") return null;
      throw error;
    });
    if (!info?.isDirectory()) return;
    await rm(path, { recursive: true, force: true });
  }
}
