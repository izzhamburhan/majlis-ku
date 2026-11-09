import { enforceDeployedConfig } from "./lib/deployed";
import { enforceStorageConfig } from "./server/media/storage";
import { startPurgeSchedule } from "./server/retention/schedule";
import { resumeProcessing } from "./server/uploads/processing";

// With DEPLOYED=1, refuse to start on an unsafe configuration (names and reasons only, never values). Runs at server
// start, not at build, and does nothing unless DEPLOYED=1.
enforceDeployedConfig(process.env);
// Outside deployed mode a half-set STORAGE_DRIVER=s3 would otherwise only fail on the first upload.
enforceStorageConfig();

// Pick up uploads that were still processing when the server last stopped.
try {
  const resumed = await resumeProcessing();
  if (resumed > 0) console.log(`[media] resumed ${resumed} upload(s) left processing`);
} catch (error) {
  // The database may not be up yet (for example during `next build`); uploads resume on the next start.
  console.warn("[media] could not resume processing:", error instanceof Error ? error.message : error);
}

// Archive events whose retention ended (spec 8a): first run after a minute, then hourly.
startPurgeSchedule();
