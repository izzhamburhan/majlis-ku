// Object keys: events/<eventId>/<uploadId>/<variant>. Only these characters are ever accepted.
const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i;

export function assertSafeKey(key: string): string {
  if (!KEY_PATTERN.test(key) || key.includes("..") || key.length > 300) {
    throw new RangeError(`Unsafe storage key: ${key}`);
  }
  return key;
}

export type MediaVariant = "incoming" | "original" | "display.jpg" | "thumb.webp" | "display.m4a" | "display.mp4" | "poster.jpg";

export function uploadKey(eventId: string, uploadId: string, variant: MediaVariant): string {
  return assertSafeKey(`events/${eventId}/${uploadId}/${variant}`);
}

/** Where a guest's browser PUTs the file. completeUpload verifies it and copies it to `original`; nothing is served from here. */
export function incomingKey(eventId: string, uploadId: string): string {
  return uploadKey(eventId, uploadId, "incoming");
}

const INCOMING_PATTERN = /^events\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*\/incoming$/i;

/** True only for keys made by incomingKey. The local upload route accepts nothing else. */
export function isIncomingKey(key: string): boolean {
  return INCOMING_PATTERN.test(key);
}

export function coverKey(eventId: string, version: string): string {
  return assertSafeKey(`events/${eventId}/cover/${version}.jpg`);
}

export function eventPrefix(eventId: string): string {
  return `${assertSafeKey(`events/${eventId}`)}/`;
}
