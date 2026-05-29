# Memo Capture

Memo Capture is a cross-platform desktop application for capturing voice and text memos, turning them into workflow-managed work items, enriching them with AI assistance, and exporting accepted ideas for downstream systems.

This repository is bootstrapped as a single npm workspace containing:

- `apps/desktop`: Tauri + React desktop shell.
- `apps/api`: TypeScript backend API.
- `apps/worker`: TypeScript background worker entrypoint.
- `packages/domain`: shared domain contracts and constants.
- `packages/config`: shared configuration helpers.
- `docs/design`: product and design decision records.

## Current Status

The project is scaffolded, not feature-complete. The initial source files establish runtime boundaries, contracts, placeholder screens, health endpoints, and setup documentation.

## Prerequisites

- Node.js 22.x
- npm 10.x
- Rust stable toolchain for Tauri desktop builds
- Postgres for backend persistence
- S3-compatible object storage for managed artifacts
- OIDC provider configuration for authenticated deployments

## Install

```bash
npm install
```

## Development

Run the desktop app:

```bash
npm run dev:desktop
```

Run the API:

```bash
npm run dev:api
```

Run the worker:

```bash
npm run dev:worker
```

## Verification

```bash
npm run verify
```

The root verification command runs typecheck, tests, and build across the workspace after dependencies are installed.

## Configuration

Copy `.env.example` to `.env` and fill in local values. Do not commit secrets.

The desktop app uses `VITE_MEMO_CAPTURE_API_URL` for API calls. The backend uses `DATABASE_URL`, OIDC configuration, and S3-compatible object storage variables.

## Design Context

Start with:

- `docs/design/memo-capture-concept.txt`
- `docs/design/memo-capture-design-learnings.md`
- `docs/architecture.md`

## Release Boundary

This is a Build Mode scaffold. It does not publish images, create releases, tag versions, or deploy infrastructure.
