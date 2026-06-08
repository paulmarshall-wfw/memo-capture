export type LogLevel = "debug" | "info" | "warn" | "error";

export interface RuntimeConfig {
  appVersion: string;
  commitSha: string;
  logLevel: LogLevel;
}

export function readStringEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: string
): string {
  const value = env[key];
  return value === undefined || value.trim() === "" ? fallback : value;
}

export function readNumberEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number
): number {
  const value = env[key];
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${key} must be a number.`);
  }

  return parsed;
}

export function readLogLevel(env: NodeJS.ProcessEnv): LogLevel {
  const value = readStringEnv(env, "MEMO_CAPTURE_LOG_LEVEL", "info");
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }

  throw new Error("MEMO_CAPTURE_LOG_LEVEL must be debug, info, warn, or error.");
}

export function readRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  return {
    appVersion: readStringEnv(env, "MEMO_CAPTURE_APP_VERSION", "1.0.0"),
    commitSha: readStringEnv(env, "MEMO_CAPTURE_COMMIT_SHA", "dev"),
    logLevel: readLogLevel(env)
  };
}
