import { PROCESSING_JOB_KINDS } from "@memo-capture/domain";
import { readRuntimeConfig } from "@memo-capture/config";

const config = readRuntimeConfig(process.env);

console.log(JSON.stringify({
  level: "info",
  message: "worker_started",
  timestamp: new Date().toISOString(),
  version: config.appVersion,
  commitSha: config.commitSha,
  supportedJobKinds: PROCESSING_JOB_KINDS
}));

console.log(JSON.stringify({
  level: "info",
  message: "worker_bootstrap_placeholder",
  timestamp: new Date().toISOString(),
  note: "Postgres job claiming will be implemented after schema and database client setup."
}));
