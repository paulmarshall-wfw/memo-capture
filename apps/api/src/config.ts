import { readNumberEnv, readRuntimeConfig, readStringEnv } from "@memo-capture/config";
import path from "node:path";

export type AuthMode = "oidc" | "local-dev";

export interface OidcConfig {
  issuerUrl: string;
  audience: string;
  clientId: string;
  jwksUrl: string;
}

export interface LocalDevAuthConfig {
  enabled: boolean;
  issuer: string;
  subject: string;
  email: string;
  displayName: string;
}

export interface ApiConfig {
  host: string;
  port: number;
  appVersion: string;
  commitSha: string;
  logLevel: "debug" | "info" | "warn" | "error";
  databaseUrl: string;
  migrationsDirectory: string | null;
  objectStorage: ObjectStorageConfig;
  authMode: AuthMode;
  oidc: OidcConfig;
  localDevAuth: LocalDevAuthConfig;
}

export interface ObjectStorageConfig {
  bucket: string;
  localRoot: string;
}

export function readApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const runtime = readRuntimeConfig(env);
  const authMode = readAuthMode(env);

  return {
    host: readStringEnv(env, "MEMO_CAPTURE_API_HOST", "127.0.0.1"),
    port: readNumberEnv(env, "MEMO_CAPTURE_API_PORT", 4788),
    appVersion: runtime.appVersion,
    commitSha: runtime.commitSha,
    logLevel: runtime.logLevel,
    databaseUrl: readStringEnv(
      env,
      "DATABASE_URL",
      "postgres://memo_capture:memo_capture@localhost:5432/memo_capture"
    ),
    migrationsDirectory: readNullableStringEnv(env, "MEMO_CAPTURE_MIGRATIONS_DIR"),
    objectStorage: {
      bucket: readStringEnv(env, "OBJECT_STORAGE_BUCKET", "memo-capture"),
      localRoot: resolveLocalRoot(readStringEnv(env, "OBJECT_STORAGE_LOCAL_ROOT", ".memo-capture/object-storage"))
    },
    authMode,
    oidc: {
      issuerUrl: readStringEnv(env, "OIDC_ISSUER_URL", ""),
      audience: readStringEnv(env, "OIDC_AUDIENCE", ""),
      clientId: readStringEnv(env, "OIDC_CLIENT_ID", ""),
      jwksUrl: readStringEnv(env, "OIDC_JWKS_URL", "")
    },
    localDevAuth: {
      enabled:
        authMode === "local-dev" ||
        readStringEnv(env, "MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED", "false") === "true",
      issuer: readStringEnv(env, "MEMO_CAPTURE_LOCAL_DEV_AUTH_ISSUER", "memo-capture-local-dev"),
      subject: readStringEnv(env, "MEMO_CAPTURE_LOCAL_DEV_AUTH_SUBJECT", "local-dev-user"),
      email: readStringEnv(env, "MEMO_CAPTURE_LOCAL_DEV_AUTH_EMAIL", "local-dev@example.invalid"),
      displayName: readStringEnv(env, "MEMO_CAPTURE_LOCAL_DEV_AUTH_DISPLAY_NAME", "Local Dev User")
    }
  };
}

function resolveLocalRoot(value: string): string {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(process.env.INIT_CWD ?? process.cwd(), value);
}

function readAuthMode(env: NodeJS.ProcessEnv): AuthMode {
  const value = readStringEnv(env, "MEMO_CAPTURE_AUTH_MODE", "oidc");
  if (value === "oidc" || value === "local-dev") {
    return value;
  }

  throw new Error("MEMO_CAPTURE_AUTH_MODE must be oidc or local-dev.");
}

function readNullableStringEnv(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key];
  return value === undefined || value.trim() === "" ? null : value;
}
