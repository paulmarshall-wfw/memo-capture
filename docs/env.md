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

- `LLM_PROVIDER`: compatibility fallback LLM runtime provider. Supported values are `disabled`, `local-dev`, and `openai-compatible`.
- `LLM_MODEL`: compatibility fallback model label. Defaults to `memo-capture-local-dev-expander-v1`.
- `LLM_ENDPOINT`: compatibility fallback endpoint for OpenAI-compatible providers.
- `MEMO_EXPANSION_PROVIDER`, `MEMO_EXPANSION_MODEL`, `MEMO_EXPANSION_ENDPOINT`: AppLauncher runtime option outputs for memo expansion.
- `SUGGEST_NEW_MEMOS_PROVIDER`, `SUGGEST_NEW_MEMOS_MODEL`, `SUGGEST_NEW_MEMOS_ENDPOINT`: AppLauncher runtime option outputs for suggested new memo generation.
- `SUGGEST_SELECTED_TAGS_PROVIDER`, `SUGGEST_SELECTED_TAGS_MODEL`, `SUGGEST_SELECTED_TAGS_ENDPOINT`: AppLauncher runtime option outputs for selected-tag suggestion.
- `OCR_PROVIDER`, `OCR_MODEL`, `OCR_ENDPOINT`: AppLauncher runtime option outputs for OCR. OCR remains no-op until an OCR handler is implemented.
- `OPENAI_COMPATIBLE_API_KEY`: AppLauncher secret/env value for the OpenAI-compatible adapter. Do not put API keys in manifest `runtimeOptions`.
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
