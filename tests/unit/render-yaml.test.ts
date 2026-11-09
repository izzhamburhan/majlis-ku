import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// render.yaml is small and regular (one service, two-space indent), so a line reader is enough and adds no dependency.
const text = readFileSync("render.yaml", "utf8");
const lines = text.split(/\r?\n/);
const unquote = (value: string) => value.replace(/^"(.*)"$/, "$1");

function serviceKeys(): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of lines) {
    const match = /^ {4}([A-Za-z]+): ?(.*?)\s*$/.exec(line); // keys under "  - type: web"
    if (match?.[1]) map.set(match[1], unquote(match[2] ?? ""));
  }
  return map;
}

type EnvVar = { key: string; value?: string; sync?: string };

function envVars(): EnvVar[] {
  const vars: EnvVar[] = [];
  for (const line of lines) {
    const start = /^ {6}- key: (\S+)\s*$/.exec(line);
    if (start?.[1]) {
      vars.push({ key: start[1] });
      continue;
    }
    const field = /^ {8}(value|sync): ?(.*?)\s*$/.exec(line);
    const last = vars[vars.length - 1];
    if (field?.[1] && last) last[field[1] as "value" | "sync"] = unquote(field[2] ?? "");
  }
  return vars;
}

describe("render.yaml", () => {
  it("render.yaml is Docker, free, Singapore, health check /api/health, DEPLOYED=1, secrets not synced", () => {
    const top = serviceKeys();
    expect(text).toMatch(/^services:\s*$/m);
    expect(text).toMatch(/^ {2}- type: web\s*$/m);
    expect(top.get("runtime")).toBe("docker");
    expect(top.get("plan")).toBe("free");
    expect(top.get("region")).toBe("singapore");
    expect(top.get("healthCheckPath")).toBe("/api/health");
    expect(top.get("autoDeploy")).toBe("true");

    const vars = new Map(envVars().map((v) => [v.key, v]));
    expect(vars.get("DEPLOYED")?.value).toBe("1");
    expect(vars.get("STORAGE_DRIVER")?.value).toBe("s3");
    expect(vars.get("S3_MAX_OBJECT_BYTES")?.value).toBe("52428800");
    expect(vars.has("NODE_ENV")).toBe(false); // left to the image

    const synced = [
      "DATABASE_URL",
      "AUTH_SECRET",
      "HASH_SALT",
      "AUTH_URL",
      "NEXT_PUBLIC_APP_URL",
      "AUTH_GOOGLE_ID",
      "AUTH_GOOGLE_SECRET",
      "ADMIN_EMAILS",
      "TRUSTED_PROXY_HOPS",
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "CRON_SECRET",
    ];
    for (const name of synced) {
      const entry = vars.get(name);
      expect(entry, name).toBeDefined();
      expect(entry?.sync, name).toBe("false");
      expect(entry?.value, name).toBeUndefined();
    }
  });

  it("holds no value except the three fixed, non-secret settings", () => {
    const withValue = envVars().filter((v) => v.value !== undefined);
    expect(withValue.map((v) => `${v.key}=${v.value}`).sort()).toEqual(["DEPLOYED=1", "S3_MAX_OBJECT_BYTES=52428800", "STORAGE_DRIVER=s3"]);
    expect(text).not.toMatch(/postgres(ql)?:\/\//i);
    expect(text).not.toMatch(/[A-Za-z0-9+/_-]{32,}/);
  });
});
