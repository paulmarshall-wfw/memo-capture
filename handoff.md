# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-05-29T07:48:06Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: concept grilling was captured, the project was bootstrapped, and this handoff now records the current implementation starting point.

### Checkpoint Status

- Git HEAD: `391caa4`
- Working tree: dirty
- Dirty files intentionally in scope:
  - None
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `handoff.md`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `package.json`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/architecture.md`
  - `docs/development.md`
  - `docs/schema-baseline.md`
  - `apps/api/db/migrations/0001_initial.sql`
- Last verification:
  - command: `node scripts/doctor.mjs`
  - result: passed
  - timestamp UTC: 2026-05-29T07:48:06Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current code scaffold is committed at `391caa4`; the only intentional untracked file after this update is `handoff.md`.
- Next checkpoint action: run `npm install`, then `npm run verify`; commit `handoff.md` if the handoff should be part of the repo checkpoint.

## 2. Executive Summary

Memo Capture is currently a freshly bootstrapped TypeScript/Tauri workspace. The repo now has a committed baseline scaffold for a desktop app, API, worker, shared domain/config packages, docs, and an initial Postgres schema migration.

Complete now:

- Git repo initialized and committed at `391caa4 Bootstrap Memo Capture workspace scaffold`.
- Root project policy and workflow notes are in `AGENTS.md`.
- Concept decisions are captured in `docs/design/memo-capture-design-learnings.md`.
- Runtime architecture is captured in `docs/architecture.md`.
- npm workspace scaffold exists for desktop, API, worker, domain, and config packages.
- Dependency-free bootstrap doctor passes.

Incomplete now:

- Dependencies have not been installed in this workspace.
- Typecheck, tests, builds, and dev servers have not been run after bootstrap.
- API, worker, desktop UI, database migrations, auth, workflow runtime integration, object storage, and processing jobs are skeletal.

Safe to continue from this state, with the verification caveat above. Broader durable context is in `docs/design/memo-capture-design-learnings.md`; do not duplicate it into this handoff.

## 3. Current Objective

Immediate goal: turn the scaffold into a verified development baseline.

Intended finished state for the next workstream:

- dependencies installed with a committed lockfile
- `npm run verify` passing or failures triaged
- dev commands confirmed
- scaffold bugs fixed before feature implementation begins

Definition of done:

- root install, typecheck, tests, and build work from the documented commands
- any Tauri or TypeScript bootstrap issues are fixed
- docs updated if setup or command behavior changes

## 4. Current State

### Working

- `node scripts/doctor.mjs` passes.
- Git repo exists on branch `main`.
- Root scripts are defined in `package.json`.
- Shared domain constants define V1 workflow states, bucket roles, processing job kinds, active file types, and export schema.
- API has placeholder health, readiness, and version endpoints.
- Worker has a placeholder startup path and references V1 processing job kinds.
- Desktop has a placeholder React operational workspace UI and Tauri shell config.

### Partially Working

- Postgres schema baseline exists at `apps/api/db/migrations/0001_initial.sql`, but no migration runner is wired.
- Desktop UI is static seeded UI; it is not connected to the API.
- API and worker do not yet connect to Postgres, object storage, OIDC, State Workflow Runtime, LLM, or transcription services.
- `npm run verify` is defined but requires dependencies first.

### Not Working Yet

- Watched-folder ingestion.
- Artifact upload/playback/download.
- Workflow definition import/activation.
- State Workflow Runtime integration.
- Auth/OIDC sign-in and token validation.
- Processing job claiming/execution.
- AI expansion and structured output validation.
- Export batch generation.
- Real settings screens and persistence.

### Not Yet Verified

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run dev:api`
- `npm run dev:worker`
- `npm run dev:desktop`
- Tauri Rust build
- Browser/Chrome validation of the desktop web UI

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not use `latest`; use numbered dependency versions.
- Do not install dependencies, commit, tag, release, publish, deploy, or delete files unless explicitly asked.
- Apply `engineering-project-standard` for setup/maintenance/stack work.
- Apply `web-app-design-standard` for frontend UI work.
- Desktop clients must not connect directly to Postgres or object storage.
- Workflow actions, buckets, and reopen behavior must be definition-driven where possible.
- Store only the active workflow definition bundle in-app; rollback is by re-importing a known-good external bundle.
- V1 requires real OIDC auth, but all signed-in users are admins.
- AI output consumed by code must be structured JSON and validated before storage.
- CSV export is out of scope for V1.

## 6. Commands and Verification

Current known commands:

```bash
npm install
npm run doctor
npm run typecheck
npm test
npm run build
npm run verify
npm run dev:api
npm run dev:worker
npm run dev:desktop
```

Latest verified command:

```bash
node scripts/doctor.mjs
```

Result: passed.

Prerequisites:

- Node.js `>=22.14.0 <23`
- npm `>=10.9.0 <11`
- Rust stable toolchain for Tauri builds
- Postgres for full backend work
- S3-compatible object storage for artifact work
- OIDC provider details for auth work

Unverified areas: dependency install, TypeScript, tests, builds, Tauri, dev servers, browser validation, database runtime, and external services.

## 7. Files to Open First

- `AGENTS.md`: repo-local instructions and constraints.
- `docs/design/memo-capture-design-learnings.md`: accepted product and architecture decisions from the grilling session.
- `README.md`: current workspace overview and documented commands.
- `package.json`: root workspace scripts and dependency policy.
- `docs/architecture.md`: runtime boundaries and service ownership.
- `docs/schema-baseline.md`: schema entity map.
- `apps/api/db/migrations/0001_initial.sql`: initial database baseline.
- `packages/domain/src/index.ts`: shared constants that encode key V1 decisions.

## 8. Next Actions

Next:

- Run `npm install` if the user approves dependency installation.
- Run `npm run verify` after install.
- Fix any TypeScript, Vite, Tauri, or test failures from first verification.
- Commit `handoff.md` if the handoff should become part of the baseline checkpoint.

Blocked:

- Full verification is blocked until dependencies are installed.

Later:

- Wire a migration runner or ORM choice.
- Add real API routing and persistence boundaries.
- Add workflow runtime integration once a workflow bundle exists.
- Add desktop/API connection and local watched-folder settings.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source of current state. Then review `AGENTS.md`, `docs/design/memo-capture-design-learnings.md`, `README.md`, `package.json`, `docs/architecture.md`, and `packages/domain/src/index.ts`. Treat the committed scaffold at `391caa4` plus the current handoff as the starting point. Do not reopen accepted product constraints unless implementation evidence requires it. First get dependencies installed only if explicitly approved, then run `npm run verify`, fix bootstrap failures, and report exactly what was verified. Load broader design docs only if the task clearly requires them.
