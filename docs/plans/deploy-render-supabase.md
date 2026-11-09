# Deploy to Render with Supabase: TDD plan

Spec: `docs/specs/deploy-render-supabase.md`, approved 2026-11-09. The developer waived the separate plan approval stop.
Workspace: `.worktrees/feat/infra-render-supabase`, branch `feat/infra-render-supabase`.

Global constraints: the server owns every limit; Zod at every boundary; every user-facing string in both `messages/ms.json` and `messages/en.json`; guest routes stay under 150 KB first-load JS (baseline: guest page 128, gallery 123, TV 130); existing tests are not weakened; `.env.example` and `src/lib/env.ts` change together; no secret in the repo, `render.yaml` or build arguments.

Must not change: `prisma/schema.prisma` and migrations, `src/components/**` visuals, `src/app/[locale]/**` pages other than the sign-in page and `/privacy`, `src/components/slideshow/photobook.ts`.

Run e2e with `npx playwright test --workers=1`, after `npm run build`, and clear `guestJoin:` rate-limit rows first if a run happened in the last 10 minutes (browser-test sign-in links are single-use).

## Slice 1: local-driver refactor and upload safety (no S3 yet)

Files: `src/server/media/storage-driver.ts`, `local-storage.ts`, `storage.ts`, `keys.ts`, `src/server/uploads/service.ts`, `processing.ts`, `src/server/export/event-export.ts`, `src/app/api/storage/*`, `src/server/retention/*`, `src/app/api/cron/purge/route.ts`; tests under `tests/unit/media/`, `tests/unit/uploads/`, `tests/e2e/guestbook.spec.ts` stays as is.

Interfaces produced: `StorageDriver.getObjectStream(key): Promise<Readable>`, `downloadToFile(key, path): Promise<void>`, `putObjectFromFile(key, path, contentType): Promise<void>`, `copyObject(from, to): Promise<void>`; `storage()` returns `StorageDriver`; `keys.ts` adds `incomingKey(eventId, uploadId)`; `sweepStalePending(now): Promise<number>`.

Red first (name, file, expected failure):
- "shared driver suite: stream, file download, upload from file and copy round trip" in `tests/unit/media/storage-driver.contract.test.ts`, failing because the methods do not exist.
- "deletePrefix events/a does not touch events/ab/" in the same suite, and "deletePrefix with and without a trailing slash".
- "completeUpload copies incoming to original and deletes incoming" and "a replaced incoming object cannot change original after complete" in `tests/unit/uploads/complete.test.ts`.
- "rejects when actual size differs from declared", "rejects above min(kind limit, plan.maxUploadBytes)", "rejects when it would pass storageLimitBytes", "rejects above S3_MAX_OBJECT_BYTES", each deleting the object.
- "sweepStalePending deletes the prefix and marks FAILED after one hour, keeps newer" in `tests/unit/uploads/sweep.test.ts`.
- "event export streams entries one at a time" in `tests/unit/export/event-export.test.ts`.
- "processing leaves no temporary files when ffmpeg fails" in `tests/unit/uploads/processing.test.ts` (ffmpeg runner injected).

Green: the minimal change. The signed local upload route accepts only `incoming` keys; `startUpload` issues the URL for `incoming`; `completeUpload` verifies, copies, deletes `incoming`; the sweep runs in the retention schedule and in `/api/cron/purge`; processing and export use the new methods; no remaining use of `pathFor` or `createReadStream` (a test greps `src`).

Validate: `npx vitest run`, typecheck, lint, then build and `npx playwright test --workers=1 tests/e2e/guestbook.spec.ts tests/e2e/media.spec.ts tests/e2e/moderation.spec.ts tests/e2e/slideshow.spec.ts`. Review checkpoint: reviewer on the commit.

## Slice 2: S3 driver

Files: create `src/server/media/s3-storage.ts`, `tests/unit/media/s3-storage.test.ts`; modify `storage.ts`, `src/lib/env.ts`, `.env.example`, `package.json`.

Interfaces: `new S3StorageDriver(config, client?)`, with the client injectable; `S3_MAX_OBJECT_BYTES` optional positive integer in `env.ts`; `createUploadUrl` returns `{ url, method: "PUT", headers: {} }` with `Content-Type` and `Content-Length` signed.

Red first:
- "presigned PUT signs content type, length and the incoming key, path style host, 900 s expiry" and "presigned GET expires in 3600 s and sets response-content-disposition with the filename" in `s3-storage.test.ts`, failing because the module does not exist.
- "stat, readHead, getObject, deleteObject, copyObject and putObjectFromFile call the client with the right input" with a fake client.
- "deletePrefix pages ListObjectsV2 and deletes in batches of 1000".
- "storage() throws a clear message when an S3 variable is missing" and "/api/storage routes return 404 when the driver is s3" in `tests/unit/media/storage-select.test.ts`.
- The shared contract suite also runs against the S3 driver when `S3_TEST_*` is set (skipped otherwise, reported as skipped).

Green: the driver; add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`. Validate: unit, typecheck, lint, build. Review checkpoint.

## Slice 3: deployed-mode safety

Files: `src/lib/env.ts`, `src/lib/deployed.ts` (new), `src/instrumentation-node.ts`, `src/auth.ts`, `src/server/auth/email.ts`, `src/server/auth/dev-login.ts`, `src/app/[locale]/signin/page.tsx`, `src/server/http.ts`, `src/server/security/rate-limit.ts`, the PIN route and service, `next.config.ts`, `messages/*.json`, `.env.example`; tests under `tests/unit/security/`, `tests/unit/auth/`, `tests/unit/env.test.ts`.

Interfaces: `isDeployed(): boolean`; `assertDeployedConfig(env): string[]` returning the list of problems; `clientIp(headers, hops?)`; `acceptGoogleProfile(profile)`; per-IP PIN limiter key `pinIp:<event>:<hash>`.

Red first:
- "assertDeployedConfig lists every unsafe value" (default salt, short secrets, http URLs, empty Google or admin values, unset hops, local driver) and "returns nothing when DEPLOYED is unset" in `tests/unit/deployed.test.ts`.
- "clientIp counts from the right by hops, falls back to today's behaviour when unset, and never returns an empty string".
- "email provider is not registered when deployed without EMAIL_SERVER" and "magic link is not logged when deployed".
- "dev login refuses when NODE_ENV is production".
- "Google profile without email_verified true is refused; admin promotion needs a verified email".
- "pinIp limiter allows 20 per 10 minutes per event and IP, and a different event has its own bucket".
- "next.config sends Strict-Transport-Security without preload".
- A messages parity test already exists and must pass with the new keys.

Green: minimal changes. The start-up check runs in `instrumentation-node.ts`, not at build. Validate: unit, typecheck, lint, build, and `npx playwright test --workers=1 tests/e2e/hardening.spec.ts tests/e2e/smoke.spec.ts tests/e2e/admin.spec.ts` (sign-in still works locally, `DEPLOYED` unset). Review checkpoint.

## Slice 4: Docker, seed, Render, CI, docs

Files: create `Dockerfile`, `.dockerignore`, `render.yaml`, `prisma/seed-production.ts`, `docs/deploy-render-supabase.md`, `tests/unit/seed-production.test.ts`, `tests/unit/render-yaml.test.ts`; modify `package.json` (prisma and tsx to `dependencies`; script `db:seed:prod`), `prisma/seed.ts` (share the plan and template upserts), `.github/workflows/ci.yml` (docker build job), `src/lib/legal.ts` text and `/privacy` strings, `CLAUDE.md`, `AGENTS.md`, `.env.example`, `docs/specs/phase-8-hardening.md` status.

Red first:
- "production seed creates plans and templates and no user, event or admin, and is idempotent" in `tests/unit/seed-production.test.ts` (against the local database), failing because the script does not exist.
- "render.yaml is Docker, free, Singapore, health check /api/health, DEPLOYED=1, secrets not synced" (parses the file).
- "package.json has prisma and tsx under dependencies" and "Dockerfile never copies .env and has no ARG for a secret" (reads the files).
- "/privacy names Render, Supabase, Google and Singapore in both languages" in the messages test.

Green: the files. If Docker is installed locally, run `docker build`; otherwise it is the CI job's evidence, and this is reported plainly. Validate: all unit tests, lint, typecheck, build, whole e2e with one worker, `node scripts/skills.mjs check`. Review checkpoint: final reviewer on the whole branch.

## Final verification (orchestrator)

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (first-load JS against baseline), `npx playwright test --workers=1`, `node scripts/skills.mjs check`.