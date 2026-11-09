// "Deployed mode" is switched on by DEPLOYED=1 (set in render.yaml) and never by NODE_ENV: e2e and CI build and run
// with NODE_ENV=production over plain http. Nothing here reads process.env at import time, so `next build` is safe.

type EnvSource = Record<string, string | undefined>;

/** True only when DEPLOYED is exactly "1". */
export function isDeployed(source: EnvSource = process.env): boolean {
  return source.DEPLOYED === "1";
}

const blank = (value: string | undefined): boolean => value === undefined || value.trim() === "";

/**
 * Every unsafe or missing setting for a live deployment, as "NAME: reason" lines. The messages never contain a
 * value, so they are safe to print. An empty list when DEPLOYED is not "1".
 */
export function assertDeployedConfig(source: EnvSource): string[] {
  if (!isDeployed(source)) return [];
  const problems: string[] = [];
  const value = (name: string): string => (source[name] ?? "").trim();

  const salt = value("HASH_SALT");
  if (salt === "change-me" || salt.length < 16) problems.push("HASH_SALT: must be set to a random value of at least 16 characters, not the example value");
  if (value("AUTH_SECRET").length < 32) problems.push("AUTH_SECRET: must be at least 32 characters (generate one with: npx auth secret)");
  for (const name of ["AUTH_URL", "NEXT_PUBLIC_APP_URL"]) {
    if (!value(name).startsWith("https://")) problems.push(`${name}: must start with https://`);
  }
  for (const name of ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]) {
    if (blank(source[name])) problems.push(`${name}: must be set (Google is the only sign-in option unless EMAIL_SERVER is configured)`);
  }
  if (value("ADMIN_EMAILS").split(",").every((email) => email.trim() === "")) problems.push("ADMIN_EMAILS: must list at least one admin email");
  if (!/^\d+$/.test(value("TRUSTED_PROXY_HOPS")) || Number(value("TRUSTED_PROXY_HOPS")) < 1) {
    problems.push("TRUSTED_PROXY_HOPS: must be a whole number of 1 or more (how many proxies sit in front of the app; 0 would trust a header any visitor can forge)");
  }

  const driver = value("STORAGE_DRIVER") || "local";
  if (driver !== "s3") {
    problems.push("STORAGE_DRIVER: must be s3 when deployed (local disk is lost on every deploy)");
  } else {
    for (const name of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
      if (blank(source[name])) problems.push(`${name}: must be set when STORAGE_DRIVER=s3`);
    }
  }
  return problems;
}

/** At server start: print each problem on its own line to stderr and exit non-zero. Does nothing when there are none. */
export function enforceDeployedConfig(
  source: EnvSource,
  io: { write: (text: string) => void; exit: (code: number) => void } = {
    write: (text) => void process.stderr.write(text),
    exit: (code) => process.exit(code),
  },
): void {
  const problems = assertDeployedConfig(source);
  if (problems.length === 0) return;
  io.write("[config] DEPLOYED=1 but the configuration is not safe to start with:\n");
  for (const problem of problems) io.write(`[config] ${problem}\n`);
  io.exit(1);
}