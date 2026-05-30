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

- `LLM_PROVIDER`: configured LLM provider, or `disabled`.
- `TRANSCRIPTION_PROVIDER`: configured transcription provider. Use `disabled` by default, or `local-dev` for deterministic local-development transcripts.
- `TRANSCRIPTION_MODEL`: model label recorded on transcription jobs. Defaults to `memo-capture-local-dev-transcriber-v1`.
