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

## Authentication

- `OIDC_ISSUER_URL`: OIDC issuer URL.
- `OIDC_AUDIENCE`: API audience.
- `OIDC_CLIENT_ID`: desktop client ID.
- `OIDC_JWKS_URL`: JWKS URL for token verification.

## Object Storage

- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`

## AI And Transcription

- `LLM_PROVIDER`: configured LLM provider, or `disabled`.
- `TRANSCRIPTION_PROVIDER`: configured transcription provider, or `disabled`.
