# Completed Tasks

Append brief entries here when project work is completed. Keep this file concise and append-only.

## 2026-05-29

- Task: Add backend foundation
  Outcome: Added the V1 schema alignment migration, Postgres DB client and migration runner, repository/service boundaries, request IDs, protected route skeletons, local-dev auth, OIDC validation boundary, form memo creation, environment/docs updates, and focused backend foundation tests.
  Verification: `node scripts/doctor.mjs` passed; `git diff --check` passed; `npm run typecheck -w @memo-capture/api`, `npm test -w @memo-capture/api`, and `npm run verify` were blocked because dependencies are not installed (`tsc`/`tsx` unavailable) and the active Node version is outside the declared engine range.
  Traceability: branch `main`, HEAD `504d2da`; changed files include `package.json`, `apps/api/package.json`, `apps/api/db/migrations/0002_align_target_v1_schema.sql`, `apps/api/src/db/`, `apps/api/src/repositories/`, `apps/api/src/services/`, `apps/api/src/server.ts`, `apps/api/tests/backend-foundation.test.ts`, `docs/development.md`, `docs/env.md`, `docs/specs/settings-and-audit.md`, `.env.example`, and `packages/domain/src/index.ts`.

- Task: Implement basic capture APIs
  Outcome: Added the protected current-session alias, feature group and contributor update/deactivate APIs with audit events, partial feature-group patching, not-found handling for single-record routes, and focused route coverage for the capture API surface.
  Verification: `git diff --check` passed; `node scripts/doctor.mjs` passed bootstrap checks but reported dependencies must be installed before typecheck, tests, builds, or dev servers; `npm run typecheck -w @memo-capture/api` and `npm test -w @memo-capture/api` were blocked because `tsc` and `tsx` are unavailable without installed dependencies.
  Traceability: branch `main`, HEAD `12d957b`; changed files include `apps/api/src/repositories/catalog.ts`, `apps/api/src/server.ts`, `apps/api/src/services/catalog.ts`, `apps/api/tests/backend-foundation.test.ts`, and `docs/specs/auth-and-security.md`.
