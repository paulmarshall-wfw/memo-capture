# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-05-29T19:48:06Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: refreshed the handoff after the focused implementation specs were added and committed.

### Checkpoint Status

- Git HEAD: `cbafa95`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `package.json`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/architecture.md`
  - `docs/schema-baseline.md`
  - `docs/specs/index.md`
  - `docs/specs/domain-model-and-schema.md`
  - `docs/specs/workflow-runtime-integration.md`
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/specs/processing-jobs-and-diagnostics.md`
  - `docs/specs/settings-and-audit.md`
  - `docs/specs/auth-and-security.md`
  - `docs/specs/exports.md`
  - `docs/specs/mvp-implementation-plan.md`
  - `docs/specs/decision-log.md`
  - `apps/api/db/migrations/0001_initial.sql`
  - `packages/domain/src/index.ts`
- Last verification:
  - command: `node scripts/doctor.mjs`
  - result: passed
  - timestamp UTC: 2026-05-29T19:48:06Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current implementation specs are committed at `cbafa95`; this update changes only `handoff.md` to describe that checkpoint.
- Next checkpoint action: review and commit `handoff.md` if this updated continuity state should become the next repo checkpoint.

## 2. Executive Summary

Memo Capture is a scaffolded TypeScript/Tauri workspace with the V1 technical specification set now created and committed.

Complete now:

- Git HEAD is `cbafa95 Add Memo Capture implementation specs`.
- Runtime scaffold exists for desktop, API, worker, domain, and config packages.
- The focused spec set exists under `docs/specs/`.
- `docs/specs/index.md` is the entrypoint for the target V1 implementation contract.
- `docs/specs/decision-log.md` tracks target schema adjustments from the bootstrap migration and the remaining open implementation decisions.
- `node scripts/doctor.mjs` passes.

Incomplete now:

- Dependencies are not installed in this workspace.
- Typecheck, tests, builds, and dev servers have not been run after the spec checkpoint.
- The app remains scaffold-only: API, worker, desktop UI, database migrations, auth, workflow runtime integration, object storage, processing jobs, exports, and providers are not implemented beyond placeholders.
- Milestone 0 schema/spec alignment work has not started.

Safe to continue from this state. The next session should start from the committed spec set and avoid reopening accepted V1 constraints unless implementation evidence requires it.

## 3. Current Objective

Immediate goal: start Milestone 0 from `docs/specs/mvp-implementation-plan.md`.

Intended finished state for the next workstream:

- compare `apps/api/db/migrations/0001_initial.sql` against the target schema in `docs/specs/domain-model-and-schema.md`
- decide the concrete migration path from the bootstrap schema to the target V1 schema
- add or adjust shared domain constants/types needed for implementation
- document any new open decisions in `docs/specs/decision-log.md`
- run available verification and report blockers exactly

Definition of done:

- target schema gaps are converted into implementable migration tasks
- any changed spec decisions remain reflected in `docs/specs/`
- no implementation work jumps ahead of the schema/API contract baseline

## 4. Current State

### Working

- Git repo is on `main` at `cbafa95`.
- Root scripts are defined in `package.json`.
- `node scripts/doctor.mjs` passes and confirms required bootstrap files.
- API exposes placeholder health, readiness, and version endpoints.
- Worker has a placeholder startup path.
- Desktop has a placeholder React/Tauri operational workspace UI.
- Shared domain constants define V1 workflow states, bucket roles, file types, job kinds, job statuses, and export schema.

### Partially Working

- Postgres bootstrap migration exists, but it is not the final target schema and no migration runner is wired.
- `docs/specs/` defines target V1 behavior, but implementation has not caught up.
- Desktop UI is static and not API-backed.
- `npm run verify` is defined but requires dependencies first.

### Not Working Yet

- Auth/OIDC sign-in and token validation.
- Database client, repositories, services, and migration runner.
- Workflow definition import, staging, activation, and runtime actions.
- Watched-folder ingestion and archive handling.
- Artifact upload, playback, download, and object storage integration.
- Processing job claiming, retries, cancellation, and diagnostics.
- AI expansion and transcription providers.
- Accepted snapshots and export batch generation.
- Real settings, operations, export, and diagnostics screens.

### Not Yet Verified

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify`
- `npm run dev:api`
- `npm run dev:worker`
- `npm run dev:desktop`
- Tauri Rust build
- Chrome validation of the desktop UI

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not use unnumbered floating versions.
- Do not install dependencies, commit, tag, release, publish, deploy, delete files, or weaken project instructions unless explicitly asked.
- Apply `engineering-project-standard` for setup, maintenance, versioning, and stack work.
- Apply `web-app-design-standard` for frontend UI work.
- Use Chrome for browser automation unless the user explicitly asks for another browser or Chrome is unavailable.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings are canonical; watched-folder and archive paths are desktop-local settings.
- Workflow actions, buckets, and reopen behavior must be driven by the active workflow definition wherever possible.
- V1 stores only the active workflow definition bundle; rollback requires re-importing a known-good external bundle.
- V1 requires authentication, but all signed-in users are admins.
- AI output consumed by code must be structured JSON and validated before storage.
- CSV export is out of scope for V1.
- V1 has no delete or privacy purge behavior.

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

Most recent verified command:

```bash
node scripts/doctor.mjs
```

Result: passed at 2026-05-29T19:48:06Z.

Current blocker:

- `node_modules` is absent. Install dependencies before typecheck, tests, builds, or dev servers.

Prerequisites:

- Node.js `>=22.14.0 <23`
- npm `>=10.9.0 <11`
- Rust stable toolchain for Tauri builds
- Postgres for backend persistence work
- S3-compatible object storage for artifact/export work
- OIDC provider details or local-dev auth mode for auth work

## 7. Files to Open First

- `AGENTS.md`: repo-local instructions and constraints.
- `handoff.md`: hot-context continuity source.
- `docs/specs/index.md`: entrypoint and reading order for the V1 spec set.
- `docs/specs/mvp-implementation-plan.md`: next milestone sequence.
- `docs/specs/domain-model-and-schema.md`: target schema and API contracts.
- `docs/specs/decision-log.md`: schema adjustments and open implementation decisions.
- `apps/api/db/migrations/0001_initial.sql`: bootstrap schema to compare against target schema.
- `packages/domain/src/index.ts`: current shared constants and types.
- `package.json`: root scripts, workspace shape, and numbered dependency versions.

## 8. Next Actions

Next:

- Review this handoff diff.
- Commit `handoff.md` if the updated continuity state should be preserved.
- Begin Milestone 0: compare the bootstrap migration with `docs/specs/domain-model-and-schema.md`.
- Update `docs/specs/decision-log.md` if schema alignment reveals new open decisions.

Blocked:

- Full verification is blocked until dependencies are installed.
- Feature implementation should wait until schema/API contract alignment is complete.

Later:

- Run `npm install` only when explicitly approved.
- Run `npm run verify` after dependencies are installed.
- Implement backend foundation after Milestone 0 is resolved.
- Use Chrome verification for future UI behavior/layout changes.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source of current state. Then review `AGENTS.md`, `docs/specs/index.md`, `docs/specs/mvp-implementation-plan.md`, `docs/specs/domain-model-and-schema.md`, `docs/specs/decision-log.md`, `apps/api/db/migrations/0001_initial.sql`, `packages/domain/src/index.ts`, and `package.json`. Treat `cbafa95 Add Memo Capture implementation specs` as the current committed checkpoint, with only `handoff.md` intentionally dirty if it has not been committed yet. Start with Milestone 0 schema/spec alignment. Do not install dependencies, commit, tag, release, publish, deploy, delete files, or start feature implementation unless explicitly requested.
