import { readNumberEnv, readRuntimeConfig, readStringEnv } from "@memo-capture/config";

export interface ApiConfig {
  host: string;
  port: number;
  appVersion: string;
  commitSha: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

export function readApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const runtime = readRuntimeConfig(env);

  return {
    host: readStringEnv(env, "MEMO_CAPTURE_API_HOST", "127.0.0.1"),
    port: readNumberEnv(env, "MEMO_CAPTURE_API_PORT", 4788),
    appVersion: runtime.appVersion,
    commitSha: runtime.commitSha,
    logLevel: runtime.logLevel
  };
}
