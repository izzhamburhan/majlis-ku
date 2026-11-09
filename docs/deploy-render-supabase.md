# Deploy Majlis Ku on Render with Supabase

For a developer who has created a free Supabase account and a free Render account. About one hour the first time. Nothing here needs a credit card unless a vendor asks for one; if a page asks, stop and check the vendor's current terms.

Spec: `docs/specs/deploy-render-supabase.md`. Files this guide uses: `Dockerfile`, `render.yaml`, `scripts/start.sh`, `.env.example`.

Anything marked **check on the vendor's page** is a fact about a third-party service that this repo cannot prove and that changes over time.

## 1. What you get, and the limits

You get the whole app on a public https address: guests upload from their phones straight into a private Supabase bucket, hosts sign in with Google, and the data survives restarts.

| Part | Service | Role |
| --- | --- | --- |
| App | Render free web service, Singapore, built from the `Dockerfile` | Runs Next.js, the video and voice processing, and the hourly purge |
| Database | Supabase PostgreSQL, Singapore | All records |
| Files | Supabase Storage (private bucket, S3 interface), Singapore | Photos, videos, voice messages |
| Host sign-in | Google OAuth | The only sign-in method when deployed |

Free-tier limits that matter, as the project understood them when the spec was written. **They come from third-party sources. Check on the vendors' pages (render.com pricing and docs, supabase.com pricing and storage docs) before relying on them.**

- Render free web service: sleeps after about 15 minutes without traffic and takes about a minute to wake; small memory and CPU (video processing may be slow or fail on it); a monthly allowance of free instance hours.
- Supabase free project: pauses after about 7 days without activity; small database and storage quotas; a 50 MB limit on each stored file.
- Google OAuth in "Testing" mode only lets listed test users sign in.

This is fine for a demo and for trying the app on your own phone. It is not for a real wedding.

## 2. Supabase

1. In the Supabase dashboard, create a new project. Pick the **Singapore** region. Save the database password somewhere safe (a password manager); you cannot read it again.
2. Open **Connect** (top of the project page) and choose the **Session pooler** connection string. It looks like `postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres`. Copy the exact string from the dashboard; do not retype it. Replace `[YOUR-PASSWORD]` with your database password. If the password has characters such as `@`, `#` or `/`, replace each with its percent code (for example `@` becomes `%40`), or reset the password to letters and digits only.
3. Add `?connection_limit=5&sslmode=require` to the end. The result is your `DATABASE_URL`. Use this one address for both migrations and the running app. Keep it secret.
4. Open **Storage**, **New bucket**, name it exactly `majlisku-media`, and leave **Public bucket** off. The bucket must stay private: the app hands out short-lived signed links.
5. In Storage settings (the bucket's settings or **Storage > Settings**, depending on the dashboard version), set the **file size limit** to 50 MB. This is the second layer behind the app's own `S3_MAX_OBJECT_BYTES=52428800`.
6. Open **Storage > S3 connection** (the name may differ slightly: check on the vendor's page). Turn the S3 protocol **on**. Copy the **endpoint** (it looks like `https://<project-ref>.storage.supabase.co/storage/v1/s3`) and the **region** shown there (for example `ap-southeast-1`). Choose **New access key**, copy the **access key ID** and the **secret access key** at once; the secret is shown only one time.

You now hold five storage values and one database address:

| Render variable | From |
| --- | --- |
| `DATABASE_URL` | step 3 |
| `S3_ENDPOINT` | the endpoint in step 6 |
| `S3_REGION` | the region in step 6 |
| `S3_BUCKET` | `majlisku-media` |
| `S3_ACCESS_KEY_ID` | the access key ID in step 6 |
| `S3_SECRET_ACCESS_KEY` | the secret access key in step 6 |

## 3. Render: create the service first

You need the service's public address for Google, and Google's keys for Render, so start with Render and fix the address afterwards.

1. Push this branch (or `main`, once merged) to GitHub. `render.yaml` must be in the repository root of the branch you deploy.
2. In Render: **New > Blueprint**, connect your GitHub account, pick this repository and branch. Render reads `render.yaml` and shows one web service named `majlis-ku` and the variables to fill in (section 5).
3. Fill what you already have (the Supabase values) and put a guess for the address (see `AUTH_URL` below). You can change any value later; each change redeploys.
4. Apply. The first build takes several minutes: it installs packages, downloads the ffmpeg binary and builds Next.js.
5. When the service exists, copy its real address from the dashboard (like `https://majlis-ku.onrender.com`; Render adds letters if the name was taken). If it differs from your guess, correct `AUTH_URL` and `NEXT_PUBLIC_APP_URL` (section 5).

## 4. Google sign-in

1. Open the Google Cloud console (console.cloud.google.com), create a project (or pick one).
2. **APIs & Services > OAuth consent screen** (Google may call this "Google Auth Platform"). Choose **External**, fill the app name and your email. Leave publishing status **Testing** and add your own Google address under **Test users**. Only listed addresses can sign in while it is in Testing.
3. **Credentials > Create credentials > OAuth client ID**, type **Web application**.
4. Under **Authorized redirect URIs** add exactly `https://<your-render-address>/api/auth/callback/google` (for example `https://majlis-ku.onrender.com/api/auth/callback/google`). No trailing slash.
5. Create. Copy the **Client ID** (`AUTH_GOOGLE_ID`) and **Client secret** (`AUTH_GOOGLE_SECRET`).

The app accepts a Google sign-in only when Google reports the email as verified.

## 5. Render: the variables

Fixed in `render.yaml`, do not touch: `DEPLOYED=1`, `STORAGE_DRIVER=s3`, `S3_MAX_OBJECT_BYTES=52428800`. `NODE_ENV` comes from the image.

Generate the three random values on your own computer (needs only Node.js), one command each, and paste the printed text into Render. Never paste them into a chat, an issue or a file in the repo.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"      # HASH_SALT
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"      # CRON_SECRET
```

| Variable | Meaning and format |
| --- | --- |
| `DATABASE_URL` | Section 2, step 3. |
| `AUTH_SECRET` | Random, 32 or more characters (the command above gives 44). Signs login sessions. |
| `HASH_SALT` | Random, 16 or more characters. Salts the hashes of guest devices and IP addresses. Do not change it after real guests have joined: their device hashes would no longer match. |
| `AUTH_URL` | The public address, `https://` and no trailing slash, for example `https://majlis-ku.onrender.com`. |
| `NEXT_PUBLIC_APP_URL` | The same address as `AUTH_URL`. Used in QR codes, share links and previews. Read when the server starts, so changing it only needs a redeploy. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Section 4. |
| `ADMIN_EMAILS` | Comma-separated Google addresses that become admins when they sign in, for example `you@gmail.com`. Checked on every request, so removing an address removes the access. Required. |
| `TRUSTED_PROXY_HOPS` | How many proxies sit between the internet and the app. The app takes the visitor's address from the `x-forwarded-for` header counting that many entries from the right. Start with `1` (the one Render proxy in front). See the check below. |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Section 2. |
| `CRON_SECRET` | Random, 16 or more characters. Lets a scheduler call `POST /api/cron/purge` with the header `Authorization: Bearer <CRON_SECRET>`. Without it that route answers 404. |

If a value is missing or unsafe, the app refuses to start and prints one line per problem in the Render **Logs** (names only, never values), for example `TRUSTED_PROXY_HOPS: must be a whole number of 0 or more`. Fix the named variable and save.

### Checking `TRUSTED_PROXY_HOPS`

This number decides which address counts as "the visitor" for the per-IP limits. Too low and every guest shares one address, so a few wrong PIN attempts lock everyone out. Too high and a visitor can invent their own address and dodge the limits. The repo has no safe way to print the header length without logging addresses, so check it by behaviour with two phones on different networks (one on Wi-Fi, one on mobile data):

1. Sign in, create an event, and give it a PIN in the event settings.
2. Open the guest page on **phone A**. Enter wrong PINs. Each device is allowed 5 wrong PINs per 10 minutes, so after 5 clear the site data for the page (or use a private tab) and repeat until 20 wrong PINs were entered from phone A's network. The next attempt shows the locked message.
3. On **phone B** (other network) open the same guest page and enter the **correct** PIN. It must work.

If phone B is locked too, the app sees the same address for both: raise `TRUSTED_PROXY_HOPS` only if Render documents more than one proxy in front of your service (**check on the vendor's page**), otherwise report it. If phone B works, `1` is right. The lock lasts 10 minutes. Do not add temporary logging of `x-forwarded-for`: it contains real IP addresses, and the project's rule is not to store or log them.

## 6. First deploy: what to expect

- Every start runs, in order: `prisma migrate deploy` (creates the tables), `npm run db:seed:prod` (plans and e-card templates only; no demo data and no users), then the server. You never run these by hand.
- Render waits for `/api/health` to answer 200 before it sends traffic. It answers 503 when the database cannot be reached.
- After 15 minutes without traffic the service sleeps. The next request wakes it; expect about a minute of waiting, and the first guest scan after a quiet period will be slow.
- Open `https://<your-render-address>/signin`. Only the Google button should show.

## 7. Verification checklist

Do these on a laptop and on a phone, and write down what you see. Tick each only after you saw it.

1. Sign in with Google (the address you put in `ADMIN_EMAILS` also reaches `/admin`).
2. Create an event.
3. On a phone, open the event's guest page (scan the QR code from the event page) and upload one photo and one video. **Time the video upload** from tapping upload to seeing it in the gallery, and write the number down.
4. While uploading, open the browser's developer tools **Network** tab (on a laptop upload, or by remote debugging) and look at the upload request: its host must be the Supabase storage host (`<project-ref>.storage.supabase.co`), not the `onrender.com` address. Note any red CORS error in the console. Supabase has no setting for bucket CORS, so if the browser blocks the upload request, **stop here and report it**; the fix is a code change that is not part of this guide.
5. Both items show in the host gallery and the guest gallery.
6. Download the ZIP of the event. Open it: the files and names should be right. Download a single photo from the host gallery: the file name should be the original name. If it is a random name, report it (the spec lists this as a known thing to check).
7. Open the TV slideshow link on a laptop.
8. Open the live address on a phone on mobile data (not your Wi-Fi) and check the guest page loads.
9. Delete the event and confirm its files disappear from the Supabase bucket (Storage > `majlisku-media`).

## 8. Pause and wake

- **Render** sleeps after about 15 minutes idle (section 6). The hourly purge of expired events and the cleanup of stuck uploads run inside the server, so they only run while it is awake. A purge date that passes while it sleeps is acted on at the first hourly run after it wakes, so an expired event can stay for longer than its plan says.
- **Supabase** pauses a free project after about 7 days without activity (**check on the vendor's page**). Then `/api/health` returns 503 and Render keeps restarting the service. In the Supabase dashboard press **Restore project**, wait until it is running, and Render recovers on its own.
- Keeping the service awake with a pinger is not part of this setup: it uses up the free hours.

## 9. Privacy

When you run this, personal data is processed by:

- **Render** (hosting, Singapore region as set in `render.yaml`);
- **Supabase** (database and file storage, Singapore region, as chosen in section 2);
- **Google** (host sign-in only; guests never use Google).

`/privacy` already names all three and says the data is stored in Singapore, outside Malaysia, in both languages. Before real guests use the site, the placeholders in `src/lib/legal.ts` (`[NAMA SYARIKAT]`, `[EMEL]`, `[ALAMAT]`) must be filled with the real company name, contact email and address, and a lawyer must review `/privacy` and `/terms`. Also read each vendor's data-processing terms (**check on the vendor's page**). Seed and test data in this repo are invented; do not put real guests' data into a demo.

## 10. Moving to Railway later

The code has no Render or Supabase specific parts outside the S3 storage settings and the deploy files, so the move is mostly settings:

- Create a Railway service from this repository; it can build the same `Dockerfile` (**check on the vendor's page** for how it picks a Dockerfile). `render.yaml` is then not used.
- Set the same environment variables there. Railway gives its own `PORT`; `scripts/start.sh` already uses it.
- Keep PostgreSQL and S3 standard: `DATABASE_URL` can point at Supabase, at Railway's own PostgreSQL, or at any PostgreSQL. The S3 variables can keep pointing at Supabase Storage or at any S3-compatible bucket (Cloudflare R2, AWS S3, a Railway bucket). To move existing data, copy the database with `pg_dump` and `psql`, and the bucket with any S3 copy tool.
- Update `AUTH_URL`, `NEXT_PUBLIC_APP_URL` and the Google **redirect URI** to the new address.
- Redo the `TRUSTED_PROXY_HOPS` check from section 5: the number of proxies in front of the app can be different.
