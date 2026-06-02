# Development

## Database

Run pending API migrations against the configured Postgres database:

```bash
npm run db:migrate
```

The command uses `DATABASE_URL` and reads migrations from `apps/api/db/migrations`
unless `MEMO_CAPTURE_MIGRATIONS_DIR` is set.

The normal local development database is the Docker Desktop Postgres container
`memo-capture-postgres-16-8`, with `DATABASE_URL` pointing at
`postgres://memo_capture:memo_capture@localhost:5432/memo_capture`.

Resettable automated tests must not use the development database. Tests that
need real Postgres should use the isolated `memo_capture_test` database through
`npm run test:postgres`. Manual smoke testing may use `memo_capture` when the
goal is to inspect the current local development state.

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

For database-sensitive behavior, run the real Postgres integration lane:

```bash
npm run test:postgres
```

This command starts the existing local Postgres container if needed, drops and
recreates only `memo_capture_test`, applies migrations to that isolated test
database, and runs the Postgres-backed API integration tests. This convention
was added as a project testing policy so database-sensitive automated checks
can be destructive without touching the normal `memo_capture` local development
database. Keep the default `npm test` suite fast and deterministic; use
`npm run test:postgres` for migrations, repository SQL, constraints,
transactions, indexes, and worker locking behavior.

## Local Services

The scaffold expects Postgres and S3-compatible object storage for full backend
behavior. Local development should use the Docker Postgres container, while
automated Postgres tests should use the separate `memo_capture_test` database.

## Dependency Policy

Use numbered dependency versions. Do not use `latest`.

Do not install, publish, tag, release, or deploy unless explicitly requested.
