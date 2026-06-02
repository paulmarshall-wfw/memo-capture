# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-02T23:53:21Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: isolated Docker Postgres integration test lane, completed-task ledger update, and handoff refresh.

### Checkpoint Status

- Git HEAD: `b163a47`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `AGENTS.md`
  - `apps/api/package.json`
  - `docs/completed-tasks.md`
  - `docs/development.md`
  - `handoff.md`
  - `package.json`
- Dirty files intentionally out of scope:
  - `apps/api/src/repositories/audit.ts`
  - `apps/api/tests/backend-foundation.test.ts`
- Untracked files intentionally in scope:
  - `apps/api/tests/postgres/integration.test.ts`
  - `scripts/prepare-postgres-test-db.mjs`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `AGENTS.md`
  - `docs/development.md`
  - `package.json`
  - `apps/api/package.json`
  - `scripts/prepare-postgres-test-db.mjs`
  - `apps/api/tests/postgres/integration.test.ts`
- Last verification:
  - command: `npm run test:postgres`; `npm run typecheck`; `npm test`
  - result: passed outside the sandbox
  - timestamp UTC: 2026-06-02T23:51Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty/untracked file list, completed-task ledger entry, docs updates, new Postgres test-lane files, and verification results are recorded here. This repo currently has no `scripts/handoff_status.py` or `scripts/verify_handoff_freshness.py`, so freshness was checked manually with Git facts and file state.
- Next checkpoint action: review dirty diff and commit only if explicitly requested.

## 2. Executive Summary

The current focus is the new isolated real-Postgres automated test lane for Memo Capture. The repo now has `npm run test:postgres`, which starts or creates the local Docker Postgres container `memo-capture-postgres-16-8`, drops and recreates only `memo_capture_test`, applies all API migrations to that isolated database, and runs Postgres-backed API integration tests from `apps/api/tests/postgres/`.

The testing policy is now documented in `AGENTS.md` and `docs/development.md`: use the Docker Postgres `memo_capture` database for normal local development and manual smoke testing, keep `FakeDatabase` tests for fast service-level checks, and use `memo_capture_test` for resettable automated Postgres tests. The policy was also written to Codex memory as requested so future sessions should follow it.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: carry forward the completed Postgres testing split and use the new real-Postgres lane for database-sensitive automated checks.

Definition of done for this workstream:

- `npm test` remains the default fast workspace test suite and does not pick up Postgres integration tests.
- `npm run test:postgres` uses only `memo_capture_test` and refuses to run the integration tests against the shared `memo_capture` development database.
- Database-sensitive behavior such as migrations, repository SQL, constraints, transactions, indexes, and worker locking has a clear verification path.
- Future sessions can find the policy in `AGENTS.md`, `docs/development.md`, `docs/completed-tasks.md`, and Codex memory.

## 4. Current State

### Working

- `package.json` adds root scripts:
  - `prepare:test:postgres`
  - `test:postgres`
- `apps/api/package.json` adds an API-local `test:postgres` script scoped to `tests/postgres/*.test.ts`.
- `scripts/prepare-postgres-test-db.mjs` starts an existing `memo-capture-postgres-16-8` container or creates one from numbered image `postgres:16.8-alpine`, then resets and migrates `memo_capture_test`.
- `apps/api/tests/postgres/integration.test.ts` verifies the migrated isolated test DB and real Postgres processing-job claim plus rollback behavior.
- `AGENTS.md` records the test command and verification policy for future agents.
- `docs/development.md` documents the development-vs-automated-test database split.
- `docs/completed-tasks.md` has an append-only completed-task entry for the isolated Postgres lane.
- Codex memory note added at `/Users/paulmarshall/.codex/memories/extensions/ad_hoc/notes/2026-06-03-memo-capture-postgres-test-policy.md`.

### Partially Working

- The Postgres integration lane currently has a small seed of coverage. It proves migration setup, DB isolation guard, repository claim behavior, and transaction rollback, but it is not yet broad coverage for every DB-sensitive path.

### Not Working Yet

- No known blocker in the new Postgres test lane.

### Not Yet Verified

- Full `npm run verify` was not rerun after the handoff/ledger edit. `npm test`, `npm run typecheck`, and `npm run test:postgres` passed.
- Native app behavior was not touched or re-smoke-tested for this workstream.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Local development uses Docker Postgres `memo-capture-postgres-16-8` with the `memo_capture` database.
- Resettable automated Postgres tests must use `memo_capture_test`, not the shared local development database.
- Keep `FakeDatabase` tests for fast service-level behavior, but do not treat them as proof of real SQL, migrations, constraints, transactions, indexes, or Postgres locking semantics.
- Browser automation should use Chrome unless explicitly told otherwise.
- For Memo Capture user-facing/native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.

## 6. Commands and Verification

Passed in this slice:

```bash
npm run test:postgres
npm run typecheck
npm test
```

Additional check:

```bash
npm run test -w @memo-capture/api
```

Verification notes:

- `npm run test:postgres` first failed in the sandbox because Docker socket access was denied; the approved outside-sandbox rerun passed.
- `npm run test -w @memo-capture/api` first failed in the sandbox on local route binding `listen EPERM`; the approved outside-sandbox rerun passed.
- `npm test` passed outside the sandbox and confirmed the default test lane does not include `apps/api/tests/postgres/integration.test.ts`.
- `npm run test:postgres` applied migrations `0001` through `0020` to `memo_capture_test` and ran 2 passing Postgres integration tests.

Useful next commands:

```bash
git status --short --branch
git diff --check
npm test
npm run test:postgres
npm run typecheck
```

## 7. Files to Open First

- `AGENTS.md`: repo-local testing policy and command list.
- `docs/development.md`: detailed development database and `test:postgres` workflow.
- `package.json`: root `prepare:test:postgres` and `test:postgres` scripts.
- `apps/api/package.json`: API-local Postgres integration test script.
- `scripts/prepare-postgres-test-db.mjs`: Docker Postgres test database reset/migration implementation.
- `apps/api/tests/postgres/integration.test.ts`: real Postgres coverage and guard against using the dev DB.
- `docs/completed-tasks.md`: append-only entry for this completed work.

## 8. Next Actions

Next:

- Review the dirty diff, including the two out-of-scope dirty files, before any commit.
- If database behavior changes, add focused coverage under `apps/api/tests/postgres/` and run `npm run test:postgres`.
- Run `git diff --check` before committing.

Blocked:

- None.

Later:

- Expand Postgres integration coverage for repository SQL paths, constraints, migrations, and job-locking behavior as those areas change.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `b163a47` with a dirty tree. The active completed work is the isolated Docker Postgres integration test lane: open `AGENTS.md`, `docs/development.md`, `package.json`, `apps/api/package.json`, `scripts/prepare-postgres-test-db.mjs`, and `apps/api/tests/postgres/integration.test.ts` first. Use `npm run test:postgres` for database-sensitive automated checks against `memo_capture_test`; do not point resettable automated tests at the shared `memo_capture` development database. Account for unrelated dirty files `apps/api/src/repositories/audit.ts` and `apps/api/tests/backend-foundation.test.ts` before committing.
