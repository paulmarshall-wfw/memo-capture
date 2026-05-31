# Development

## Database

Run pending API migrations against the configured Postgres database:

```bash
npm run db:migrate
```

The command uses `DATABASE_URL` and reads migrations from `apps/api/db/migrations`
unless `MEMO_CAPTURE_MIGRATIONS_DIR` is set.

## Local-Dev Auth

Local-dev auth is development-only and must be explicitly enabled:

```bash
MEMO_CAPTURE_AUTH_MODE=local-dev MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED=true npm run dev:api
```

Create or refresh the fixed local-dev session:

```bash
curl -X POST http://127.0.0.1:4788/api/dev-auth/session
```

Use the returned `accessToken` as a bearer token for protected `/api/*` routes.

## Install Dependencies

```bash
npm install
```

## Run Locally

In separate terminals:

```bash
npm run dev:api
npm run dev:worker
npm run dev:desktop
```

The API defaults to `http://127.0.0.1:4788`.

For the native Tauri shell, run:

```bash
npm run tauri:dev -w @memo-capture/desktop
```

Tauri dev uses the strict webview URL `http://127.0.0.1:5178` so it does not attach to another local app running on Vite's default port.

## Verify

```bash
npm run verify
```

This runs the bootstrap doctor, workspace typechecks, tests, and builds.

## Local Services

The scaffold expects Postgres and S3-compatible object storage for full backend behavior, but the initial health endpoint and placeholder UI do not require those services.

## Dependency Policy

Use numbered dependency versions. Do not use `latest`.

Do not install, publish, tag, release, or deploy unless explicitly requested.
