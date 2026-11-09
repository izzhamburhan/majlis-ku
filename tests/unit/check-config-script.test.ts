import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// The same script start.sh runs before it migrates the database.
function run(env: Record<string, string>) {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/check-config.ts"], {
    env: { ...process.env, DEPLOYED: undefined, HASH_SALT: undefined, AUTH_SECRET: undefined, ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("scripts/check-config.ts", () => {
  it("stops with the named problems when DEPLOYED=1 and the configuration is unsafe", () => {
    const { status, output } = run({ DEPLOYED: "1", HASH_SALT: "change-me", AUTH_SECRET: "short-secret-value-xyz" });
    expect(status).toBe(1);
    expect(output).toContain("HASH_SALT:");
    expect(output).toContain("STORAGE_DRIVER:");
    expect(output).not.toContain("short-secret-value-xyz"); // names and reasons only, never a value
  });

  it("does nothing when DEPLOYED is not set", () => {
    const { status, output } = run({ HASH_SALT: "change-me" });
    expect(status).toBe(0);
    expect(output).toBe("");
  });
});