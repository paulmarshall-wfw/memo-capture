# Development

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
