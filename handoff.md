# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-04T10:51:44Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: local development database migration repair and continuity refresh.

### Checkpoint Status

- Git HEAD: `9d1a29e`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `docs/completed-tasks.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `apps/api/db/migrations/0021_llm_task_routing_and_runtime_options.sql`
  - `apps/api/db/migrations/0024_simplify_provider_task_settings.sql`
  - `apps/api/db/migrations/0025_remove_seeded_ai_tasks.sql`
  - `scripts/applauncher-native-dev.mjs`
  - `scripts/applauncher-native-dev.sh`
- Last verification:
  - command: `npm run db:migrate`; repeat `npm run db:migrate`; Postgres `schema_migrations`/`ai_task_definitions` checks; `curl -sS http://127.0.0.1:4788/health`; native process check
  - result: passed
  - timestamp UTC: 2026-06-04T10:51:16Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD` is recorded, only this handoff and the completed-task ledger are dirty, local Postgres is migrated through `0025`, the migration lane is idempotent, and the normal native helper restarted the app successfully.
- Next checkpoint action: review and commit the two documentation updates only if explicitly requested.

## 2. Executive Summary

The repo is now at `main` `9d1a29e` after the AI task unseeding and prompt-save cleanup. The immediate operational issue was the local development database: the normal native helper could not start because previously applied migrations `0021` and `0024` had checksum drift relative to the current checked-in files.

Complete now:

- Local `schema_migrations` checksums for `0021` and `0024` match the current repo files.
- `0025_remove_seeded_ai_tasks` is applied to local database `memo_capture`.
- A second migration pass applied nothing and skipped `0001` through `0025`.
- `ai_task_definitions` is empty, matching the current Settings behavior where users create tasks themselves.
- Normal native launch via `scripts/applauncher-native-dev.sh` now runs migrations, starts API/worker, and opens `Memo Capture.app`.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: leave Memo Capture safe for the next implementation or testing session after the local migration repair.

Intended finished state:

- The local dev DB no longer blocks normal native startup.
- The current handoff describes `HEAD` `9d1a29e`, not the older dirty settings slice.
- Completed work is recorded in `docs/completed-tasks.md`.

Definition of done: met, except the documentation edits are intentionally uncommitted.

## 4. Current State

### Working

- Local Postgres container `memo-capture-postgres-16-8` is reachable on `127.0.0.1:5432`.
- Local database `memo_capture` has migrations `0001` through `0025` recorded.
- `0025_remove_seeded_ai_tasks` deleted the earlier built-in task definition rows.
- API health returns `ok: true` on `http://127.0.0.1:4788/health`.
- Native `memo-capture-desktop` is running after restart through the normal helper.
- Active workflow remains `0.2.5` according to the native launch log.

### Partially Working

- `schema_migrations` checksum reconciliation was done only on the local development database. This was an operational repair, not a repo schema change.
- The latest code already includes `0025`; the current dirty tree is documentation-only.

### Not Working Yet

- Handoff helper scripts referenced by the handoff skill are absent in this repo (`scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` do not exist), so freshness was verified manually from Git state and file existence.

### Not Yet Verified

- Full `npm run verify` was not rerun after this docs-only handoff/ledger update.
- No fresh browser click-through was run after the migration repair; the native app opened and issued API requests in the launch log.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Use `npm run test:postgres` for database-sensitive automated checks; it resets only isolated `memo_capture_test`, not shared dev database `memo_capture`.
- Do not point resettable automated lanes at the shared development database.
- For native-testable changes, rebuild or launch the runnable `.app`; do not create a DMG unless explicitly requested.
- Applied migration files should not be edited in place. If local checksum drift appears again, inspect whether the live schema effect already exists before any local ledger repair.

## 6. Commands and Verification

Passed for the migration repair:

```bash
DATABASE_URL=postgres://memo_capture:memo_capture@127.0.0.1:5432/memo_capture npm run db:migrate
DATABASE_URL=postgres://memo_capture:memo_capture@127.0.0.1:5432/memo_capture npm run db:migrate
docker exec memo-capture-postgres-16-8 psql -U memo_capture -d memo_capture -c "select version, checksum, applied_at from schema_migrations order by version desc limit 5; select count(*) as ai_task_definitions from ai_task_definitions;"
curl -sS http://127.0.0.1:4788/health
```

Notes:

- The sandboxed migration attempt hit known `tsx` IPC `listen EPERM`; rerunning outside the sandbox with Node `22.14.0` passed.
- The normal native helper log shows `db_migrations_complete` with `applied: []` and skipped `0001` through `0025`, then API and worker startup.
- API health response: service `memo-capture-api`, version `0.1.0`, commitSha `dev`.

Useful next commands:

```bash
git status --short --branch
git diff --check
npm run verify
npm run test:postgres
```

## 7. Files to Open First

- `handoff.md`: hot current-state context.
- `docs/completed-tasks.md`: completed work ledger; newest entry records the local migration repair.
- `apps/api/db/migrations/0025_remove_seeded_ai_tasks.sql`: latest migration applied to local dev DB.
- `apps/api/db/migrations/0021_llm_task_routing_and_runtime_options.sql`: edited applied migration whose local checksum was reconciled.
- `apps/api/db/migrations/0024_simplify_provider_task_settings.sql`: edited applied migration whose local checksum was reconciled.
- `scripts/applauncher-native-dev.mjs`: normal native bootstrap path that runs migrations and launches API/worker/native app.
- `scripts/applauncher-native-dev.sh`: AppLauncher/native wrapper using Node `22.14.0`.

## 8. Next Actions

Next:

- Review `git diff -- docs/completed-tasks.md handoff.md`.
- Commit the documentation updates only if explicitly requested.

Later:

- Run `npm run verify` before any code commit after additional implementation work.
- Use `npm run test:postgres` for future database-sensitive regression checks.

Blocked:

- None.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current code checkpoint as `main` at `9d1a29e` with only documentation edits in scope unless Git says otherwise. Open `docs/completed-tasks.md`, `apps/api/db/migrations/0025_remove_seeded_ai_tasks.sql`, `apps/api/db/migrations/0021_llm_task_routing_and_runtime_options.sql`, `apps/api/db/migrations/0024_simplify_provider_task_settings.sql`, and `scripts/applauncher-native-dev.mjs` first. Preserve the database testing split: use `npm run test:postgres` for resettable DB checks against `memo_capture_test`, and do not reset the shared `memo_capture` development database. Distinguish confirmed current state from any new recommendations, and do not commit unless explicitly asked.
