import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { env } from "@/lib/env";
import { hashIp } from "./guests/identity";

/** The one error shape every API route returns. */
export function apiError(code: string, status: number, message = code, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message = code,
  ) {
    super(message);
  }
}

/** Parse a JSON body with a Zod schema; throws ApiError("validation") on bad input. */
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("validation", 400, "Body must be JSON");
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError("validation", 400, result.error.issues.map((i) => i.message).join("; "));
  return result.data;
}

/** Wrap a route handler so thrown ApiErrors become JSON errors and everything else a 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ApiError) return apiError(error.code, error.status, error.message);
      // Next.js uses thrown errors for redirect() and notFound(); let them through.
      if (error instanceof Error && "digest" in error) throw error;
      console.error(error);
      return apiError("server_error", 500, "Something went wrong");
    }
  };
}

/**
 * The caller's address from the proxy headers; never an empty string.
 * `hops` unset: the first x-forwarded-for entry (a client can forge it, so deployed mode requires `hops`).
 * `hops` set: the entry that many from the right (1 is the last, the address the nearest proxy saw), which a client
 * cannot forge as long as `hops` matches the real number of proxies. Too few entries falls back to x-real-ip, then "local".
 */
export function clientIp(headers: Pick<Headers, "get">, hops?: number): string {
  const forwarded = headers.get("x-forwarded-for");
  const chosen =
    hops === undefined
      ? forwarded?.split(",")[0]?.trim()
      : hops >= 1
        ? forwarded?.split(",").at(-hops)?.trim()
        : undefined;
  return chosen || headers.get("x-real-ip")?.trim() || "local";
}

/** Salted hash of the caller's IP, for rate limits. Never store or log the raw address. */
export async function clientIpHash(): Promise<string> {
  const { HASH_SALT, TRUSTED_PROXY_HOPS } = env();
  return hashIp(clientIp(await headers(), TRUSTED_PROXY_HOPS), HASH_SALT);
}