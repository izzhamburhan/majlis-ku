import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("deploy files", () => {
  it("package.json has prisma and tsx under dependencies", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.dependencies.prisma).toBeDefined();
    expect(pkg.dependencies.tsx).toBeDefined();
    expect(pkg.devDependencies.prisma).toBeUndefined();
    expect(pkg.devDependencies.tsx).toBeUndefined();
    expect(pkg.scripts["db:seed:prod"]).toBe("tsx prisma/seed-production.ts");
  });

  it("Dockerfile never copies .env, has no ARG or ENV for a secret and runs as non-root", () => {
    const docker = read("Dockerfile");
    const instructions = docker.split(/\r?\n/).filter((line) => /^\s*(ARG|ENV|COPY|ADD|USER|FROM|EXPOSE|CMD|ENTRYPOINT)\b/.test(line));
    for (const line of instructions.filter((l) => /^\s*(COPY|ADD)\b/.test(l))) expect(line).not.toMatch(/\.env/);
    for (const line of instructions.filter((l) => /^\s*(ARG|ENV)\b/.test(l))) {
      expect(line, line).not.toMatch(/SECRET|PASSWORD|TOKEN|SALT|DATABASE_URL|ACCESS_KEY|API_KEY|AUTH_/i);
    }
    const users = instructions.filter((l) => /^\s*USER\b/.test(l));
    expect(users.length).toBeGreaterThan(0);
    expect(users[users.length - 1]).toMatch(/^\s*USER\s+(?!root\b|0\b)\S+/);
    expect(docker).toMatch(/^FROM node:22-bookworm-slim/m);
    expect(docker).toMatch(/openssl/);
    expect(docker).toMatch(/ca-certificates/);
    expect(docker).toMatch(/^EXPOSE 3000\s*$/m);
    expect(docker).toMatch(/scripts\/start\.sh/);
    expect(docker).not.toMatch(/--ignore-scripts/);
    // Placeholder values exist only inline on the build command, for the four variables the build loads.
    const build = docker.split(/\r?\n/).find((l) => /npm run build/.test(l)) ?? "";
    for (const name of ["DATABASE_URL", "AUTH_SECRET", "HASH_SALT", "NEXT_PUBLIC_APP_URL"]) expect(build).toContain(`${name}=`);
  });

  it("the run stage sets DEPLOYED=1 and the build stage does not", () => {
    const docker = read("Dockerfile");
    const [beforeRun, run] = docker.split(/^FROM base AS run$/m);
    expect(run).toMatch(/^ENV .*DEPLOYED=1/m);
    expect(beforeRun).not.toMatch(/DEPLOYED/); // `next build` must not run the live-deployment checks
  });

  it("the image carries the config check and the one file it imports", () => {
    const docker = read("Dockerfile");
    expect(docker).toContain("scripts/check-config.ts");
    expect(docker).toContain("/app/src/lib/deployed.ts");
    expect(docker).toContain("scripts/start.sh");
  });

  it("the Next.js config is a plain .mjs file and the image copies it, so no TypeScript is needed to start", () => {
    expect(existsSync("next.config.mjs")).toBe(true);
    expect(existsSync("next.config.ts")).toBe(false);
    const docker = read("Dockerfile");
    expect(docker).toContain("/app/next.config.mjs");
    expect(docker).not.toContain("next.config.ts");
  });

  it(".dockerignore excludes .env and node_modules", () => {
    const ignore = read(".dockerignore")
      .split(/\r?\n/)
      .map((l) => l.trim());
    for (const entry of [".env*", "node_modules", ".next", ".data", ".git", ".worktrees"]) expect(ignore, entry).toContain(entry);
  });

  it("ci.yml has a docker build job and keeps the checks job", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toMatch(/^ {2}checks:/m);
    const job = ci.split(/^ {2}docker-build:/m)[1] ?? "";
    expect(job).toMatch(/docker build /);
    expect(job).not.toMatch(/docker push|push: true/);
    expect(job).toMatch(/uses: actions\/checkout@v\d+/);
  });

  it("start.sh runs the config check, then migrate, then seed, then next start", () => {
    const script = read("scripts/start.sh");
    expect(script).not.toContain("\r");
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(script).toMatch(/^set -e$/m);
    // A bad configuration must stop the container before any migration is applied to the database.
    const check = script.indexOf("scripts/check-config.ts");
    expect(check).toBeGreaterThan(-1);
    expect(script.indexOf("prisma migrate deploy")).toBeGreaterThan(check);
    const migrate = script.indexOf("prisma migrate deploy");
    const seed = script.indexOf("db:seed:prod");
    const start = script.indexOf("exec ");
    expect(migrate).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(migrate);
    expect(start).toBeGreaterThan(seed);
    expect(script.slice(start)).toMatch(/next start .*-H 0\.0\.0\.0.*\$\{PORT:-3000\}/);
  });
});
