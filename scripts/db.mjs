// Local PostgreSQL for development, no Docker or installer needed.
// Runs a real PostgreSQL server from the embedded-postgres package, with data in .data/postgres.
//
// Usage: npm run db:start     (keep it running; Ctrl+C stops the server)
// Settings come from DATABASE_URL in .env (user, password, port, database name).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(ROOT, ".data", "postgres");

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = join(ROOT, ".env");
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("DATABASE_URL="));
    if (line) return line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "");
  }
  return "postgresql://majlis:majlis@localhost:5433/majlis";
}

const url = new URL(databaseUrl());
const database = url.pathname.replace(/^\//, "") || "majlis";
const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: decodeURIComponent(url.username || "majlis"),
  password: decodeURIComponent(url.password || "majlis"),
  port: Number(url.port || 5433),
  persistent: true,
  // Without these, initdb on Windows uses the system code page (WIN1252), which rejects emoji in wishes.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

const fresh = !existsSync(join(DATA_DIR, "PG_VERSION"));
if (fresh) {
  console.log(`db: initialising a new cluster in ${DATA_DIR}`);
  await pg.initialise();
}
await pg.start();

// Create the database as UTF8 explicitly, so it is UTF8 even in a cluster made before the flags above.
const client = pg.getPgClient();
await client.connect();
const { rows } = await client.query("SELECT pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = $1", [database]);
if (rows.length === 0) {
  await client.query(
    `CREATE DATABASE ${client.escapeIdentifier(database)} ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`,
  );
  console.log(`db: created database "${database}" (UTF8)`);
} else if (rows[0].encoding !== "UTF8") {
  console.warn(
    `db: WARNING database "${database}" uses ${rows[0].encoding}; emoji and other non-Latin text will fail. ` +
      `Recreate it: stop this server, delete ${DATA_DIR}, then run db:start, prisma migrate dev and prisma db seed.`,
  );
}
await client.end();
console.log(`db: PostgreSQL running on port ${url.port || 5433} (database "${database}"). Ctrl+C to stop.`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log("\ndb: stopping");
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);