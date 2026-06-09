# Environment Variables

See `.env.example` for the current non-secret template.

## Desktop

- `VITE_MEMO_CAPTURE_API_URL`: backend API URL used by the desktop webview.

## API

- `MEMO_CAPTURE_API_HOST`: HTTP bind host.
- `MEMO_CAPTURE_API_PORT`: HTTP port.
- `MEMO_CAPTURE_LOG_LEVEL`: logging threshold.
- `MEMO_CAPTURE_APP_VERSION`: runtime version shown in diagnostics.
- `MEMO_CAPTURE_COMMIT_SHA`: commit identity shown in diagnostics.
- `INVOKE_PROVIDERS_REGISTRY_URL`: non-secret URL for the separate local invoke-providers registry service. Defaults to `http://127.0.0.1:5181`.
- `INVOKE_PROVIDERS_PROFILE`: non-secret bootstrap registry profile key used before a profile is saved in Memo Capture Settings. Defaults to `local-dev`, matching the local registry seed in `invoke-providers-for-tasks`.
- `INVOKE_PROVIDERS_COMMIT_SHA`: shared provider runtime/library commit identity recorded on invoke task-run history. Defaults to `MEMO_CAPTURE_COMMIT_SHA`.

Memo Capture does not fall back to its legacy local provider rows when the shared registry is unavailable or the selected profile is missing. The Providers page lets the user save an app-owned registry profile selection; that saved profile overrides `INVOKE_PROVIDERS_PROFILE`. Clearing the saved selection returns to the bootstrap env profile. If a saved profile is later deleted from the registry, Memo Capture keeps the saved key visible and provider-backed task readiness remains blocked until the user saves a registered profile.

## Database

- `DATABASE_URL`: Postgres connection string.
- `MEMO_CAPTURE_MIGRATIONS_DIR`: optional override for the API SQL migrations directory.

## Authentication

- `MEMO_CAPTURE_AUTH_MODE`: `oidc` or `local-dev`; default is `oidc`.
- `MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED`: enables the development-only local auth route when set to `true`.
- `MEMO_CAPTURE_LOCAL_DEV_AUTH_ISSUER`: fixed local-dev issuer stored in `app_users`.
- `MEMO_CAPTURE_LOCAL_DEV_AUTH_SUBJECT`: fixed local-dev subject stored in `app_users`.
- `MEMO_CAPTURE_LOCAL_DEV_AUTH_EMAIL`: fixed local-dev email.
- `MEMO_CAPTURE_LOCAL_DEV_AUTH_DISPLAY_NAME`: fixed local-dev display name.
- `OIDC_ISSUER_URL`: OIDC issuer URL.
- `OIDC_AUDIENCE`: API audience.
- `OIDC_CLIENT_ID`: desktop client ID.
- `OIDC_JWKS_URL`: JWKS URL for token verification.

## Object Storage

- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_LOCAL_ROOT`: local development object-storage root used by the current backend storage adapter. Relative paths resolve from the original npm invocation directory when available.
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`

## AI And Transcription

- `LLM_PROVIDER`: legacy Memo Capture LLM runtime fallback. Supported values are `disabled`, `local-dev`, and `openai-compatible`.
- `LLM_MODEL`: Memo Capture runtime fallback model label. Defaults to `memo-capture-local-dev-expander-v1`.
- `LLM_ENDPOINT`: Memo Capture runtime fallback endpoint for OpenAI-compatible providers.
- Local LM Studio uses a shared-registry OpenAI-compatible provider with endpoint `http://127.0.0.1:1234/v1` and a chat model ID reported by `GET /v1/models`. For localhost endpoints, Memo Capture can use a dummy bearer value when `OPENAI_COMPATIBLE_API_KEY` or `LOCAL_OPENAI_COMPATIBLE_API_KEY` is not configured. The adapter requests task-specific `json_schema` structured output for Memo Capture LLM tasks.
- AppLauncher manifests launch Memo Capture only. They do not declare provider slots, provider registry settings, runtime options, LLM runtime selectors, provider secrets, or model selectors.
- Codex CLI task providers use the shared `codex-cli` adapter with registry provider key `codex-cli-local`. Configure `INVOKE_PROVIDERS_CODEX_CLI_BINARY` or `CODEX_CLI_EXECUTABLE` to the executable path or command, such as `codex`. The adapter invokes `codex exec` with a read-only sandbox by default and may send data externally depending on the host Codex CLI configuration.
- Memo expansion, revision, suggestion, tag, and OCR task routing is configured inside Memo Capture Settings. AppLauncher does not emit task-specific LLM env names.
- `OPENAI_COMPATIBLE_API_KEY`: process environment value for the OpenAI-compatible adapter. Do not put API keys in docs, manifests, database rows, or task-run records.
- `TRANSCRIPTION_PROVIDER`: configured transcription provider. Supported values are `disabled`, `local-dev`, and `whisper-cpp`. Use `whisper-cpp` for local V1 transcription once the binary and model are configured.
- `TRANSCRIPTION_MODEL`: model label recorded on transcription jobs, such as `base.en`.
- `WHISPER_CPP_MODE`: `cli` for the current implementation. `server` is reserved for a future `whisper-server` adapter.
- `WHISPER_CPP_BINARY`: path or command name for the Whisper.cpp CLI binary, such as `/opt/homebrew/bin/whisper-cpp`.
- `WHISPER_CPP_MODEL_PATH`: path to the numbered/explicit Whisper model file, for example `ggml-base.en.bin`.
- `WHISPER_CPP_FFMPEG_BINARY`: path or command name for `ffmpeg`, used to normalize audio before transcription.
- `WHISPER_CPP_LANGUAGE`: language passed to the Whisper.cpp CLI, defaulting to `en`.
- `WHISPER_CPP_THREADS`: thread count passed to the Whisper.cpp CLI.
- `WHISPER_CPP_TIMEOUT_MS`: timeout for audio normalization and transcription subprocesses.
- `WHISPER_CPP_SERVER_URL`: reserved for future server mode.
