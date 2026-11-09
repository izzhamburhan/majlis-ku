import { z } from "zod";

// Every environment variable the app reads is declared here and documented in .env.example.

const optional = z.string().trim().min(1).optional();

const schema = z.object({
  DATABASE_URL: z.string().trim().min(1),
  AUTH_SECRET: z.string().trim().min(16),
  HASH_SALT: z.string().trim().min(8),
  NEXT_PUBLIC_APP_URL: z.url(),
  AUTH_GOOGLE_ID: optional,
  AUTH_GOOGLE_SECRET: optional,
  EMAIL_SERVER: optional,
  EMAIL_FROM: z.string().trim().min(1).default("Majlis Ku <no-reply@majlisku.test>"),
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_MEDIA_DIR: z.string().trim().min(1).default(".data/media"),
  S3_ENDPOINT: optional,
  S3_REGION: optional,
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  // Largest single file in bytes, below the plan's own cap; for a storage service with a per-file limit.
  S3_MAX_OBJECT_BYTES: z.coerce.number().int().positive().optional(),
  CRON_SECRET: z.string().trim().min(16).optional(),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings as unset so `KEY=` in .env behaves like a missing key.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ""));
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}. See .env.example.`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Validated env, read once. Server-only. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
