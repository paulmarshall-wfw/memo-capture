# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-05-29T12:22:26Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: refreshed the design learnings after the second grill-me pass and updated this handoff for a clean next-session start before build work.

### Checkpoint Status

- Git HEAD: `391caa4`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `docs/design/memo-capture-design-learnings.md`
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
  - `docs/development.md`
  - `docs/schema-baseline.md`
  - `apps/api/db/migrations/0001_initial.sql`
- Last verification:
  - command: `node scripts/doctor.mjs`
  - result: passed
  - timestamp UTC: 2026-05-29T07:48:06Z
- Documentation sanity check:
  - command: `git diff --check`
  - result: passed
  - command: `node scripts/doctor.mjs`
  - result: passed
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current code scaffold remains committed at `391caa4`; this session changed documentation only.
- Next checkpoint action: review the docs diff, then commit `docs/design/memo-capture-design-learnings.md` and `handoff.md` if this continuity state should become the next repo checkpoint.

## 2. Executive Summary

Memo Capture is a freshly bootstrapped TypeScript/Tauri workspace with the major V1 product and architecture decisions now consolidated in `docs/design/memo-capture-design-learnings.md`.

Complete now:

- Git repo initialized and committed at `391caa4 Bootstrap Memo Capture workspace scaffold`.
- Root project policy and workflow notes are in `AGENTS.md`.
- Runtime architecture is captured in `docs/architecture.md`.
- npm workspace scaffold exists for desktop, API, worker, domain, and config packages.
- Initial Postgres schema baseline exists at `apps/api/db/migrations/0001_initial.sql`.
- Dependency-free bootstrap doctor passed earlier in this checkpoint.
- The design learnings doc now resolves the major grill-me topics:
  - deletion/retention
  - security/privacy
  - project, feature group, and contributor governance
  - settings/audit
  - workflow import/activation
  - processing diagnostics
  - ingestion edge cases
  - desktop local cache
  - provider configuration
  - API/desktop boundaries
  - UI structure
  - auth/session behavior
  - export semantics
  - schema edge cases
  - MVP boundary and implementation sequence
  - versioning/compatibility
  - testing/verification
  - failure recovery/operator responsibilities
  - first specification artifact shape

Incomplete now:

- Dependencies have not been installed in this workspace.
- Typecheck, tests, builds, and dev servers have not been run after bootstrap.
- API, worker, desktop UI, database migrations, auth, workflow runtime integration, object storage, and processing jobs are skeletal.
- The focused technical product specs have not been created yet.
- No build implementation has started.

Safe to continue from this state, with the verification caveat above. The next workstream should turn the refreshed design record into focused technical product specs before feature implementation begins.

## 3. Current Objective

Immediate goal: create the technical product specification set from the refreshed design learnings, then commit the documentation checkpoint when explicitly requested.

Intended finished state for the next workstream:

- focused spec set created under `docs/specs/`
- implementation-relevant decisions copied from `docs/design/memo-capture-design-learnings.md`
- database table and API route contracts drafted immediately
- low-fidelity screen inventory and interaction rules included
- vertical-slice acceptance tests defined
- unresolved implementation decisions tracked in `docs/specs/decision-log.md`
- documentation sanity check performed
- docs checkpoint committed only if explicitly requested

Definition of done for the spec work:

- `docs/specs/index.md` links the focused specs
- all initial spec files exist and are internally consistent
- accepted V1 decisions are not left only in chat
- no build work starts until the user approves moving from specification into implementation

## 4. Current State

### Working

- `node scripts/doctor.mjs` passed earlier in the checkpoint.
- Git repo exists on branch `main`.
- Root scripts are defined in `package.json`.
- Shared domain constants define V1 workflow states, bucket roles, processing job kinds, active file types, and export schema.
- API has placeholder health, readiness, and version endpoints.
- Worker has a placeholder startup path and references V1 processing job kinds.
- Desktop has a placeholder React operational workspace UI and Tauri shell config.
- `docs/design/memo-capture-design-learnings.md` is now the current design decision source for V1.

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
- Technical product specs under `docs/specs/`.

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
- Browser/Chrome validation of the desktop web UI

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not use `latest`; use numbered dependency versions.
- Do not install dependencies, commit, tag, release, publish, deploy, delete files, or create additional artifacts unless explicitly asked.
- Warn before starting build work, editing files, creating docs/artifacts, installing dependencies, or committing.
- Apply `engineering-project-standard` for setup/maintenance/stack work.
- Apply `web-app-design-standard` for frontend UI work.
- Desktop clients must not connect directly to Postgres or object storage.
- Workflow actions, buckets, and reopen behavior must be definition-driven where possible.
- Store only the active workflow definition bundle in-app; rollback is by re-importing a known-good external bundle.
- V1 requires real OIDC auth, but all signed-in users are admins.
- AI output consumed by code must be structured JSON and validated before storage.
- CSV export is out of scope for V1.
- V1 has no user delete or privacy purge behavior.
- No manual file import outside watched folders in MVP.

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

Result: passed earlier in the checkpoint.

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
- `handoff.md`: hot-context continuity source.
- `docs/design/memo-capture-design-learnings.md`: current V1 design decision record.
- `README.md`: current workspace overview and documented commands.
- `package.json`: root workspace scripts and dependency policy.
- `docs/architecture.md`: runtime boundaries and service ownership.
- `docs/schema-baseline.md`: schema entity map.
- `apps/api/db/migrations/0001_initial.sql`: initial database baseline.
- `packages/domain/src/index.ts`: shared constants that encode key V1 decisions.

## 8. Next Actions

Next:

- Review the docs diff.
- If the user asks for the docs checkpoint, commit `docs/design/memo-capture-design-learnings.md` and `handoff.md`.
- When explicitly instructed, create the technical product spec set:
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

Blocked:

- Full verification is blocked until dependencies are installed.
- Implementation should wait until the technical product specs are created and reviewed.

Later:

- Run `npm install` if explicitly approved.
- Run `npm run verify` after install.
- Fix any TypeScript, Vite, Tauri, or test failures from first verification.
- Wire a migration runner or ORM choice.
- Add real API routing and persistence boundaries.
- Add workflow runtime integration after the spec and workflow bundle contract are established.
- Add desktop/API connection and local watched-folder settings.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source of current state. Then review `AGENTS.md`, `docs/design/memo-capture-design-learnings.md`, `README.md`, `package.json`, `docs/architecture.md`, `docs/schema-baseline.md`, `apps/api/db/migrations/0001_initial.sql`, and `packages/domain/src/index.ts`. Treat the committed scaffold at `391caa4` plus the current documentation changes as the starting point. Do not reopen accepted product constraints unless implementation evidence requires it. The next planned work is to generate the focused technical product specs under `docs/specs/`; do not start build implementation until the specs exist and the user approves moving forward. Do not install dependencies, commit, tag, release, publish, or delete files unless explicitly requested.
