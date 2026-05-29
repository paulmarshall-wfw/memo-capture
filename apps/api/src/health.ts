import type { HealthPayload } from "@memo-capture/domain";
import type { ApiConfig } from "./config.js";

export function createHealthPayload(config: ApiConfig, service: string): HealthPayload {
  return {
    ok: true,
    service,
    version: config.appVersion,
    commitSha: config.commitSha,
    timestamp: new Date().toISOString()
  };
}
