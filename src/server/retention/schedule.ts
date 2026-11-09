import "server-only";
import { sweepStalePending } from "@/server/uploads/sweep";
import { purgeExpiredEvents } from "./purge";

const FIRST_RUN_MS = 60_000;
const EVERY_MS = 60 * 60_000;

export type PurgeRun = Awaited<ReturnType<typeof purgeExpiredEvents>> & { swept: number };

// On globalThis because the instrumentation and the route handler may be bundled as separate module copies.
const globalForPurge = globalThis as unknown as {
  __purgeSchedule?: boolean;
  __purgeRunning?: Promise<PurgeRun>;
};

/** The hourly job: remove files of abandoned uploads, then archive events whose retention ended. */
async function purgeAndSweep(): Promise<PurgeRun> {
  let swept = 0;
  try {
    swept = await sweepStalePending(new Date());
  } catch (error) {
    console.warn(`[purge] pending sweep failed: ${error instanceof Error ? error.name : "Error"}`);
  }
  return { ...(await purgeExpiredEvents()), swept };
}

/** One purge at a time per process: the timer and the cron route share the running promise. */
export function runPurgeOnce(): Promise<PurgeRun> {
  globalForPurge.__purgeRunning ??= purgeAndSweep().finally(() => {
    globalForPurge.__purgeRunning = undefined;
  });
  return globalForPurge.__purgeRunning;
}

function tick() {
  runPurgeOnce()
    .then(({ archived, failed, swept }) => {
      if (archived > 0 || failed > 0 || swept > 0) console.log(`[purge] archived ${archived} event(s), ${failed} failed, swept ${swept} abandoned upload(s)`);
    })
    .catch((error: unknown) => console.warn(`[purge] run failed: ${error instanceof Error ? error.name : "Error"}`));
}

/** Hourly purge from the Node server; skipped during `next build` and after a dev reload. */
export function startPurgeSchedule() {
  if (process.env.NEXT_PHASE === "phase-production-build" || globalForPurge.__purgeSchedule) return;
  globalForPurge.__purgeSchedule = true;
  setTimeout(() => {
    tick();
    setInterval(tick, EVERY_MS).unref();
  }, FIRST_RUN_MS).unref();
}
