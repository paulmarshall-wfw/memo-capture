# Memo Capture Architecture

Status: Bootstrap baseline

## Runtime Shape

Memo Capture is split into three runtime surfaces:

- Desktop app: Tauri + React UI for local watched folders, upload staging, archive moves, and review workspace interaction.
- API service: authenticated backend authority for canonical records, workflow runtime integration, settings, artifact access, and export creation.
- Worker process: background processor for transcription, extraction, keyword generation, AI expansion, and export generation.

The desktop app never connects directly to Postgres or object storage. All canonical mutations go through the backend API.

## Workspace Layout

```text
apps/
  api/
  desktop/
  worker/
packages/
  config/
  domain/
docs/
  design/
```

## State Ownership

The backend owns durable business state. Workflow transitions must be executed through State Workflow Runtime APIs. The frontend renders allowed actions returned by the backend/runtime rather than hardcoding action availability.

The desktop owns local-only state such as watched-folder paths, archive folders, upload queue visibility, and local staging/cache behavior.

## Data Storage

Postgres stores canonical domain records, settings, processing jobs, workflow active definition data, activation history metadata, and export batch metadata.

S3-compatible object storage stores original audio/text artifacts, derived transcripts, export bundles, and other large managed artifacts.

## Authentication

Authentication is OIDC-compatible. V1 treats every signed-in app user as an admin, but signed-in identity is still required for audit and backend access.

## Background Work

Processing jobs are stored in Postgres and claimed by the worker using locking/lease semantics. Redis or an external queue is intentionally out of scope for V1.

## Deployment Profiles

The same backend code supports:

- cloud profile: managed Postgres and managed S3-compatible object storage
- NAS/self-hosted profile: Postgres and MinIO or equivalent S3-compatible storage

NAS support must be configuration-only, not a code fork.
