# AGENTS.md

## Core Skill Policy

For any repo setup, maintenance, versioning, or stack-selection work, apply the engineering-project-standard skill from `~/.codex/skills/engineering-project-standard`.

For any frontend UI design, scaffolding, review, or refinement work, apply the web-app-design-standard skill from `~/.codex/skills/web-app-design-standard`.

For any Docker, container, image build, image publishing, registry push, or container release work, apply the docker-build-and-publish skill from `~/.codex/skills/docker-build-and-publish`.

For browser automation, use Chrome for all browser automation unless the user explicitly asks for a different browser or Chrome is unavailable.

## Broad Project Policy

Prefer explicit user intent over convenience defaults. Defaults may suggest values or preselect options, but they are not permission to mutate state, activate features, publish, overwrite files, commit, tag, release, install, delete, send, or navigate/change app or browser state unless the user explicitly chooses or requests that action.

- Default to Build Mode unless the user explicitly asks for release behaviour.
- Never use `latest`.
- Always use numbered versions.
- When the project is in Git, prefer Git-derived traceability by default.
- When the user explicitly asks for distribution beyond local or dev use, require publishable images to support both `linux/amd64` and `linux/arm64`.
- Do not let container distribution work overwrite or weaken existing Codex instructions in this file.

## Repo Workflow Notes

Verified from the current workspace scaffold.

- Install command: `npm install`
- Development command: `npm run dev:desktop`, `npm run dev:api`, and `npm run dev:worker`
- Test command: `npm test`
- Real Postgres integration test command: `npm run test:postgres`
- Lint or typecheck command: `npm run typecheck`
- Build command: `npm run build`
- Full verification command: `npm run verify`

Dependencies may not be installed yet in a fresh checkout. Run `npm install` before executing npm scripts.

## Runtime Notes

- Product shape: Tauri desktop app with a web UI, backed by a TypeScript API and worker.
- Browser-only desktop dev URL: Vite default `http://localhost:5173` unless Vite prints another port.
- AppLauncher local web URL: `http://127.0.0.1:5177`, reserved in `/Users/paulmarshall/Software Development/All Standards/local-port-registry.md`.
- Tauri desktop dev URL: strict `http://127.0.0.1:5178` from `apps/desktop/src-tauri/tauri.conf.json`.
- API port: `MEMO_CAPTURE_API_PORT`, default `4788`.
- API base URL for desktop: `VITE_MEMO_CAPTURE_API_URL`.
- Data store: Postgres via `DATABASE_URL`.
- Artifact storage: S3-compatible object storage via `OBJECT_STORAGE_*` environment variables.
- Auth: OIDC-compatible provider via issuer, audience, client ID, and JWKS config.
- Background work: API and worker are separate commands; worker claims Postgres-backed processing jobs.

## Verification Notes

- Prefer `npm run verify` from the repo root after dependencies are installed.
- Use `npm run test:postgres` for database-sensitive automated checks. This command resets and migrates the isolated `memo_capture_test` database in the local `memo-capture-postgres-16-8` container, then runs Postgres-backed integration tests.
- Keep `FakeDatabase` tests for fast service-level behavior, but do not treat them as proof of real SQL, migrations, constraints, transactions, indexes, or Postgres locking semantics.
- Do not point resettable automated test lanes at the shared `memo_capture` development database. Manual smoke testing may use `memo_capture` when the goal is to inspect the current local dev state.
- Use Chrome for browser validation unless the user asks for another browser.
- Browser automation is not required for backend-only changes.
- Report any script that cannot run because dependencies, Rust/Tauri tooling, Postgres, or object storage are unavailable.

## Documentation And State

- Read `docs/design/memo-capture-design-learnings.md` before architecture, schema, workflow, ingestion, AI, or export work.
- Keep product decisions in `docs/design/`.
- Update docs when changing user-facing behavior, workflows, setup, deployment, or verification.

## Project-Specific Constraints

- V1 uses a cross-platform Tauri desktop app, TypeScript backend API, TypeScript worker, Postgres, and S3-compatible object storage.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings are canonical; watched-folder and archive paths are desktop-local settings.
- Workflow actions, buckets, and reopen behavior must be driven by the active workflow definition wherever possible.
- The app stores only the active workflow definition bundle; rollback requires re-importing a known-good external bundle.
- V1 blocks workflow activations that require app-code migrations.
- All signed-in users are admins in V1, but authentication is still required.
- AI output consumed by code must be structured JSON and validated before storage.
- CSV export is out of scope for V1.

## Agent Notes

- Inspect relevant files before editing.
- Preserve explicit user requirements and stronger project-local instructions.
- Keep changes scoped to the requested work.
- Do not commit, tag, release, publish, install dependencies, or delete files unless the user explicitly asks.
- Report verification performed and any verification that could not be run.
## Port Registry

Before adding or changing local ports, check and update
`/Users/paulmarshall/Software Development/All Standards/local-port-registry.md`; record project ports in this file's Runtime Notes. After updating, run:

```bash
python3 "/Users/paulmarshall/Software Development/All Standards/scripts/check-local-port-registry.py"
```
