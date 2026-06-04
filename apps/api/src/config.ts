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
  llm: LlmProviderConfig;
  llmTasks: Record<string, LlmTaskRuntimeConfig>;
  transcription: TranscriptionProviderConfig;
  whisperCpp: WhisperCppConfig;
  authMode: AuthMode;
  oidc: OidcConfig;
  localDevAuth: LocalDevAuthConfig;
}

export interface ObjectStorageConfig {
  bucket: string;
  localRoot: string;
}

export type TranscriptionProviderMode = "disabled" | "local-dev" | "whisper-cpp";
export type WhisperCppMode = "cli" | "server";

export type LlmProviderMode = "disabled" | "local-dev" | "openai-compatible";

export interface LlmProviderConfig {
  provider: LlmProviderMode;
  modelName: string;
  endpoint: string;
  openAiCompatibleApiKey: string;
}

export interface LlmTaskRuntimeConfig {
  provider: LlmProviderMode;
  modelName: string;
  endpoint: string;
}

export interface TranscriptionProviderConfig {
  provider: TranscriptionProviderMode;
  modelName: string;
}

export interface WhisperCppConfig {
  mode: WhisperCppMode;
  binaryPath: string;
  modelPath: string;
  ffmpegPath: string;
  language: string;
  threads: number;
  timeoutMs: number;
  serverUrl: string;
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
    llm: {
      provider: readLlmProvider(env),
      modelName: readStringEnv(env, "LLM_MODEL", "memo-capture-local-dev-expander-v1"),
      endpoint: readStringEnv(env, "LLM_ENDPOINT", ""),
      openAiCompatibleApiKey: readStringEnv(env, "OPENAI_COMPATIBLE_API_KEY", "")
    },
    llmTasks: readLlmTaskRuntimeConfig(env),
    transcription: {
      provider: readTranscriptionProvider(env),
      modelName: readStringEnv(env, "TRANSCRIPTION_MODEL", "memo-capture-local-dev-transcriber-v1")
    },
    whisperCpp: {
      mode: readWhisperCppMode(env),
      binaryPath: readStringEnv(env, "WHISPER_CPP_BINARY", "whisper-cli"),
      modelPath: readStringEnv(env, "WHISPER_CPP_MODEL_PATH", ""),
      ffmpegPath: readStringEnv(env, "WHISPER_CPP_FFMPEG_BINARY", "ffmpeg"),
      language: readStringEnv(env, "WHISPER_CPP_LANGUAGE", "en"),
      threads: readNumberEnv(env, "WHISPER_CPP_THREADS", 4),
      timeoutMs: readNumberEnv(env, "WHISPER_CPP_TIMEOUT_MS", 300000),
      serverUrl: readStringEnv(env, "WHISPER_CPP_SERVER_URL", "")
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

function readLlmProvider(env: NodeJS.ProcessEnv): LlmProviderMode {
  const value = readStringEnv(env, "LLM_PROVIDER", "disabled");
  if (value === "disabled" || value === "local-dev" || value === "openai-compatible") {
    return value;
  }

  throw new Error("LLM_PROVIDER must be disabled, local-dev, or openai-compatible.");
}

function readLlmProviderValue(value: string, field: string): LlmProviderMode {
  if (value === "disabled" || value === "local-dev" || value === "openai-compatible") {
    return value;
  }
  throw new Error(`${field} must be disabled, local-dev, or openai-compatible.`);
}

function readLlmTaskRuntimeConfig(env: NodeJS.ProcessEnv): Record<string, LlmTaskRuntimeConfig> {
  const fallbackProvider = readLlmProvider(env);
  const fallbackModel = readStringEnv(env, "LLM_MODEL", "memo-capture-local-dev-expander-v1");
  const fallbackEndpoint = readStringEnv(env, "LLM_ENDPOINT", "");
  const tasks = [
    ["memo-expansion", "MEMO_EXPANSION"],
    ["suggest-new-memos", "SUGGEST_NEW_MEMOS"],
    ["suggest-tags", "SUGGEST_TAGS"],
    ["ocr", "OCR"]
  ] as const;

  return Object.fromEntries(
    tasks.map(([taskKey, envPrefix]) => {
      const providerValue = readStringEnv(env, `${envPrefix}_PROVIDER`, taskKey === "memo-expansion" ? fallbackProvider : "disabled");
      return [
        taskKey,
        {
          provider: readLlmProviderValue(providerValue, `${envPrefix}_PROVIDER`),
          modelName: readStringEnv(env, `${envPrefix}_MODEL`, fallbackModel),
          endpoint: readStringEnv(env, `${envPrefix}_ENDPOINT`, fallbackEndpoint)
        }
      ];
    })
  );
}

function readTranscriptionProvider(env: NodeJS.ProcessEnv): TranscriptionProviderMode {
  const value = readStringEnv(env, "TRANSCRIPTION_PROVIDER", "disabled");
  if (value === "disabled" || value === "local-dev" || value === "whisper-cpp") {
    return value;
  }

  throw new Error("TRANSCRIPTION_PROVIDER must be disabled, local-dev, or whisper-cpp.");
}

function readWhisperCppMode(env: NodeJS.ProcessEnv): WhisperCppMode {
  const value = readStringEnv(env, "WHISPER_CPP_MODE", "cli");
  if (value === "cli" || value === "server") {
    return value;
  }

  throw new Error("WHISPER_CPP_MODE must be cli or server.");
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
