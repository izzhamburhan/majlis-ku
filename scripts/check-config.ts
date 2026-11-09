// Run by scripts/start.sh BEFORE `prisma migrate deploy`: with DEPLOYED=1 an unsafe or incomplete configuration stops
// the container here, so a bad config never applies migrations or seeds data. Prints names and reasons, never values.
// With DEPLOYED unset it does nothing. The server runs the same check again at start-up (src/instrumentation-node.ts).
import { enforceDeployedConfig } from "../src/lib/deployed";

enforceDeployedConfig(process.env);