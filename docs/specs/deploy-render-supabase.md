# Deploy to Render with Supabase (phase 8b, first step)

Status: draft for developer approval, 2026-11-09. Revised after the final reviewer's spec review.
Branch: `feat/infra-render-supabase`, from `feat/guest-flow-v2` at `98d3bff` (includes Stori).
Developer decisions: stack change approved (Render free web service plus Supabase for PostgreSQL and storage); Google sign-in for hosts; the whole storage layer moves to Supabase, not only photos; later move to Railway. Phase 8b in `docs/specs/phase-8-hardening.md` was waiting for a hosting choice; this is it.

## 1. Goal and non-goals

Make the app run on Render's free web service with Supabase, so the developer can open it on a laptop and a phone, with nothing lost on restart. Moving later to Railway must be mostly a settings change: standard PostgreSQL, standard S3 calls, and no Render or Supabase specific code outside the storage driver and the deploy files.

Non-goals: payments (phase 6), a shared realtime bus (one instance only), a persistent job queue, e2e in CI, CSP nonces, a custom domain, email sending, the guest-page look, an app-proxied upload fallback.

Accepted limits of the free tiers, from third-party sources that must be re-checked on the vendors' pages: the Render instance sleeps after 15 minutes without traffic and takes about a minute to wake, and the hourly retention purge only runs while it is awake; Supabase pauses a free project after 7 days without activity (the health check then returns 503 and Render keeps restarting the service until the project is restored); the free plan caps each stored file at 50 MB (Supabase's own file-limits page) and caps the database and storage at small sizes. Fine for demos, not for a real wedding.

The code runs in "deployed mode" when `DEPLOYED=1`. It is set in `render.yaml`. Production-only checks key on this flag, not on `NODE_ENV`, because e2e and CI build and run with `NODE_ENV=production` over plain http.

## 2. Acceptance criteria

Storage driver

1. `STORAGE_DRIVER=s3` selects `S3StorageDriver`, built on `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, configured by `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, with path-style addressing. Missing any of them while `s3` is selected stops start-up with a clear message.
2. `StorageDriver` gains `getObjectStream(key)`, `downloadToFile(key, path)`, `putObjectFromFile(key, path, contentType)` and `copyObject(from, to)`. `LocalStorageDriver` implements all of them. No caller uses `pathFor` or `createReadStream`, and `storage()` returns the interface.
3. `deletePrefix` on S3 appends a trailing `/`, pages through `ListObjectsV2` and deletes in batches of up to 1000. A test proves that deleting `events/a` does not delete `events/ab/`.
4. `/api/storage/upload` and `/api/storage/file` return 404 under the S3 driver.

Upload safety (applies to both drivers)

5. The signed upload URL is for `events/<event>/<upload>/incoming`, never for `original`. `completeUpload` verifies `incoming`, copies it to `original`, then deletes `incoming`. After that, the signed URL can no longer change what the host or the ZIP serves. This closes the window where a guest could swap a verified file.
6. The upload URL signs the declared `Content-Length` and `Content-Type`; the driver returns `headers: {}` so the client's own `Content-Type` is the only one sent. On complete, an actual size that differs from the declared size is rejected.
7. `completeUpload` enforces on the actual size: more than 0, at most the smaller of the kind's limit and `plan.maxUploadBytes`, and within the plan's `storageLimitBytes`. A failing object is deleted. A bucket size limit is the second layer. An optional env `S3_MAX_OBJECT_BYTES` caps the per-file size below the plan (set to 50 MB on the Supabase free plan, so a larger video is refused with a clear message before upload, not with a raw error).
8. An hourly sweep deletes the prefix of uploads that stayed PENDING for over an hour and marks them FAILED. It runs with the retention schedule and from `/api/cron/purge`.
9. Video and voice processing downloads the original to a temporary file, runs ffmpeg with one thread, uploads outputs from files through the driver, and removes temporary files even when a job fails. The ZIP export opens each object stream only when the archive reaches it, so it never holds many connections or a whole video in memory. `sharp` runs with concurrency 1 and no cache.
10. Presigned download URLs force a filename through `ResponseContentDisposition`. Supabase's documentation does not mention that parameter; if the first deploy shows it ignored, the driver sets `ContentDisposition` when copying `incoming` to `original` instead.
11. One shared driver test suite runs against `LocalStorageDriver` always and against `S3StorageDriver` when `S3_TEST_*` variables are set. Presigned URL tests run offline: key, expiry, signed headers, and path-style host.

Sign-in and deployed-mode safety

12. When `DEPLOYED=1` and `EMAIL_SERVER` is empty, the email provider is not registered, the email form is hidden, and Google sign-in is the only option. A magic link is never written to logs or files while deployed. A unit test proves the dev-login action refuses when `NODE_ENV=production`.
13. A Google sign-in is accepted only when Google reports `email_verified` as true. Admin promotion, account linking and co-host invites trust the email, so an unverified email is refused with the existing sign-in error.
14. At server start (not at build), when `DEPLOYED=1`, the app stops with a clear message if: `HASH_SALT` is `change-me` or shorter than 16; `AUTH_SECRET` is shorter than 32; `AUTH_URL` or `NEXT_PUBLIC_APP_URL` is not `https://`; `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` or `ADMIN_EMAILS` is empty; `TRUSTED_PROXY_HOPS` is unset; or the storage driver is `local`. `AUTH_URL` is added to `env.ts`.
15. `TRUSTED_PROXY_HOPS` (integer) selects the client IP from `x-forwarded-for`, counting from the right. Unset means today's behaviour outside deployed mode. In deployed mode it is required. Setting it too low makes all guests share the proxy's address, and too high lets a client choose its own; the deploy guide gives a check that logs only how many entries the header has, never the address.
16. The PIN limiter adds a per-IP key (event + IP): 20 attempts per 10 minutes, on top of the existing per-device limit, with a test. The threshold leaves room for venue Wi-Fi and carrier NAT.
17. All production responses carry `Strict-Transport-Security: max-age=31536000` (no `preload`); browsers ignore it over http.
18. New sign-in strings exist in both `messages/ms.json` and `messages/en.json`.

Database and deploy

19. `prisma` and `tsx` move to `dependencies`, so `npm ci --omit=dev` and the start command can run `prisma generate`, `migrate deploy` and the seed.
20. The image is built on Node 22, Debian slim with `openssl` and `ca-certificates`, so `sharp`, `ffmpeg-static` and the Prisma engines run. Build-time env uses placeholder values only; no secret is a build argument. Start runs `prisma migrate deploy`, then the production seed, then `next start` on `$PORT`.
21. The production seed creates plans and templates only, idempotently. No demo host, no admin, no demo event. `ADMIN_EMAILS` makes the developer's Google account an admin on sign-in.
22. `DATABASE_URL` is Supabase's session pooler address, used for migrations and runtime, with `connection_limit=5&sslmode=require`; no `directUrl` and no schema change.
23. `render.yaml` describes the service: Docker, free plan, Singapore region, `/api/health` as the health check, `DEPLOYED=1`, secrets marked `sync: false`.
24. A CI job runs `docker build`, so image problems (including Linux packages for `sharp`, since the lockfile is made on Windows) show up before Render.
25. `docs/deploy-render-supabase.md` gives step-by-step setup: Supabase project, private bucket, S3 keys, bucket size limit, Google OAuth client and redirect URL, Render service and environment, the proxy-hops check, first deploy, the checklist, pause and wake behaviour, and moving to Railway.
26. `/privacy` names Render, Supabase and Google as processors and Singapore as the data location, and the guide states that the `src/lib/legal.ts` placeholders must be filled and reviewed before real guests use the site.

Quality

27. All existing tests pass; none is weakened. Lint, typecheck, unit tests and build pass. Guest routes stay under 150 KB first-load JS.
28. E2E keeps running against the local driver, with `NODE_ENV=production` and http, unchanged.
29. The developer verifies the first deploy with the guide's checklist: sign in with Google, create an event, upload a photo and a video, see them in the gallery, download the ZIP, open the TV, open the live URL on a phone, and time the video upload.

## 3. Data model

None. No migration.

## 4. API contract

No new routes or Zod bodies. Changes in behaviour: `POST /api/e/[slug]/uploads` returns a presigned bucket URL for `incoming` under S3 (same response shape); `POST /api/e/[slug]/uploads/[id]/complete` performs the stricter checks and the copy; `/api/storage/*` is local-driver only; `/api/cron/purge` also runs the pending sweep; `GET /api/health` is unchanged.

## 5. Plans and money

No plan changes. Plan caps (`maxUploadBytes`, `storageLimitBytes`) are now enforced on the actual stored size (criterion 7).

## 6. Privacy

Media moves to a private Supabase bucket, never public, reached only by short-lived presigned URLs issued after the existing checks. Retention purge and event deletion delete bucket prefixes. No raw IPs are stored. Data moves from the developer's disk to Supabase's Singapore region, and the sign-in provider is Google; criterion 26 covers the notice.

## 7. Guest experience

No new client code. Uploads go to a different origin. Supabase has no setting for bucket CORS, so the first deploy checks that its default allows a browser `PUT`. If it is blocked, the deployment stops there and the developer is told; an app-proxied upload is out of scope for this change.

## 8. Env and services

New: `DEPLOYED`, `TRUSTED_PROXY_HOPS`, `AUTH_URL` (declared), `S3_MAX_OBJECT_BYTES` (optional). `S3_*` become used. New dependencies: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. New services on free tiers: Render, Supabase, Google Cloud OAuth. `.env.example`, `src/lib/env.ts` and the guide are updated together.

## 9. Alternatives considered

- Keep media on Render's disk: rejected, the free disk is erased on restart.
- Supabase's own storage SDK: rejected, it locks the code to Supabase; plain S3 also covers R2, S3 and Railway buckets.
- Proxy all uploads through the app: out of scope, it costs memory and time on a free instance.
- A pinger to keep Render awake: rejected for now, it uses the monthly free hours and hides the sleep behaviour.
- Keying checks on `NODE_ENV`: rejected, it breaks e2e and CI.

## 10. Rollout

After merging: create the Supabase project and bucket, the Google client and the Render service from `render.yaml`, then set environment values by hand. Local development is unchanged: `STORAGE_DRIVER=local` stays the default and `DEPLOYED` stays unset.
