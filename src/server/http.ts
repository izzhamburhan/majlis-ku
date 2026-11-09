import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { isDeployed } from "@/lib/deployed";
import { env } from "@/lib/env";
import { hashIp } from "./guests/identity";
import { createProxyHopsLogger } from "./security/proxy-hops";

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
 * `deployed`: only the x-forwarded-for entry counted from the right is ever used. x-real-ip is never read (a client may
 * send it) and a header with too few entries gives the one constant bucket "unknown" instead of a forgeable address.
 */
export function clientIp(headers: Pick<Headers, "get">, hops?: number, deployed = false): string {
  const forwarded = headers.get("x-forwarded-for");
  if (deployed) {
    const entry = hops !== undefined && hops >= 1 ? forwarded?.split(",").at(-hops)?.trim() : undefined;
    return entry || "unknown";
  }
  const chosen =
    hops === undefined
      ? forwarded?.split(",")[0]?.trim()
      : hops >= 1
        ? forwarded?.split(",").at(-hops)?.trim()
        : undefined;
  return chosen || headers.get("x-real-ip")?.trim() || "local";
}

/** Expand an IPv6 address to its eight 16-bit groups, or null when it is not a plain IPv6 address. */
function ipv6Groups(address: string): number[] | null {
  let text = address.split("%")[0]?.toLowerCase() ?? "";
  const dotted = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted) {
    const [, head = "", a = "0", b = "0", c = "0", d = "0"] = dotted;
    text = `${head}${((Number(a) << 8) | Number(b)).toString(16)}:${((Number(c) << 8) | Number(d)).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): string[] => (part === "" ? [] : part.split(":"));
  const head = parse(halves[0] ?? "");
  const tail = halves.length === 2 ? parse(halves[1] ?? "") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const numbers = all.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : Number.NaN));
  return numbers.some(Number.isNaN) ? null : numbers;
}

/**
 * The rate-limit grouping of an address: an IPv6 address becomes its /64 (a home or phone network hands out a whole /64,
 * so a client could otherwise rotate through addresses to dodge a limit). IPv4, IPv4-mapped IPv6 and anything that
 * is not an IPv6 address come back unchanged.
 */
export function ipGroup(address: string): string {
  if (!address.includes(":") || /^::ffff:\d{1,3}(\.\d{1,3}){3}$/i.test(address.split("%")[0] ?? "")) return address;
  const groups = ipv6Groups(address);
  return groups ? `${groups.slice(0, 4).map((group) => group.toString(16)).join(":")}::/64` : address;
}

let logProxyHops: ReturnType<typeof createProxyHopsLogger> | undefined;

/** Salted hash of the caller's IP (IPv6 grouped by /64), for rate limits. Never store or log the raw address. */
export async function clientIpHash(): Promise<string> {
  const { HASH_SALT, TRUSTED_PROXY_HOPS } = env();
  const requestHeaders = await headers();
  // Deployed-only diagnostic: counts the x-forwarded-for entries of the first 20 guest requests, never an address.
  logProxyHops ??= createProxyHopsLogger({ enabled: isDeployed() && env().LOG_PROXY_HOPS === "1", limit: 20 });
  logProxyHops(requestHeaders);
  return hashIp(ipGroup(clientIp(requestHeaders, TRUSTED_PROXY_HOPS, isDeployed())), HASH_SALT);
}
