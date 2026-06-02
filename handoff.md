# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-02T17:54:25Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: project-scoped tag visibility and nomination, completed-task ledger update, handoff refresh.

### Checkpoint Status

- Git HEAD: `e00af92`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/repositories/rows.ts`
  - `apps/api/src/repositories/tags.ts`
  - `apps/api/src/repositories/work-items.ts`
  - `apps/api/src/services/ai-expansion.ts`
  - `apps/api/src/services/form-memos.ts`
  - `apps/api/src/services/keywords.ts`
  - `apps/api/src/services/work-items.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/api/tests/tag-suggestions.test.ts`
  - `apps/desktop/src/App.tsx`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/domain-model-and-schema.md`
  - `docs/specs/processing-jobs-and-diagnostics.md`
  - `handoff.md`
  - `packages/domain/src/index.ts`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/db/migrations/0020_project_scoped_tag_nomination.sql`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/domain-model-and-schema.md`
  - `docs/specs/processing-jobs-and-diagnostics.md`
- Last verification:
  - command: `npm run verify`; `npm run db:migrate`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`; `git diff --check`
  - result: passed
  - timestamp UTC: 2026-06-02T17:54Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty/untracked file list, verification results, applied migration, completed-task ledger entry, and rebuilt native `.app` are recorded here. This repo currently has no `scripts/handoff_status.py` or `scripts/verify_handoff_freshness.py`, so freshness was checked manually with Git facts and file state.
- Next checkpoint action: review the dirty diff and commit only if explicitly requested.

## 2. Executive Summary

Project-scoped tag visibility and nomination is implemented in the dirty tree. Work-item API responses now include `tagsAvailable`; selected tags and Strong/Related/Weak suggestions are masked until tag nomination has completed for the work item's current project. Automatic nomination and suggestions use the current project's internal `project_tags` lexicon and still exclude globally suppressed tags.

The desktop detail panel now omits the entire tag editor while tags are unavailable, without showing a user-facing pending state. Manual tag editing after the gate opens seeds the current project's lexicon.

Migration `0020_project_scoped_tag_nomination` has been applied to the local database. Native app rebuild completed at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: continue from the completed project-scoped tag visibility implementation and validate any desired runtime/user-flow behavior in the native app.

Definition of done for this workstream:

- Work items in `needs_review` or `memo` before completed nomination expose `tagsAvailable: false` and `tags: []`.
- After successful `nominate_tags`, tags and suggestions are visible for the current project.
- Suggestions and automatic nominations do not leak tags from other projects.
- Native app uses the rebuilt `.app` bundle.

## 4. Current State

### Working

- `apps/api/db/migrations/0020_project_scoped_tag_nomination.sql` adds work-item nomination readiness fields and `project_tags`.
- `apps/api/src/repositories/work-items.ts` masks tags at read time unless readiness matches the current project.
- `apps/api/src/repositories/tags.ts` maintains project lexicons on tag saves and restricts suggestion candidates to the current project.
- `apps/api/src/services/keywords.ts` assigns only nominated keywords that already exist in the current project lexicon and are not globally suppressed.
- `apps/api/src/services/work-items.ts` treats omitted `tags` in `PATCH /api/work-items/:id` as no tag change and returns empty suggestions when tags are unavailable.
- `apps/desktop/src/App.tsx` omits the tag editor/suggestion rows while `tagsAvailable` is false and omits `tags` from save payloads in that state.
- Docs and tests cover the new behavior.
- `npm run verify`, `npm run db:migrate`, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed.

### Partially Working

- Automated verification covers API/domain/desktop build behavior. Interactive native UI smoke for the invisible tag gate has not been run after this handoff refresh.

### Not Working Yet

- No known code blocker remains.

### Not Yet Verified

- A live native flow showing a newly promoted memo with hidden tags before nomination and visible project-scoped suggestions after nomination.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- For Memo Capture user-facing/native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.
- Desktop clients must not connect directly to Postgres or object storage.
- Workflow actions, buckets, reopen behavior, and lifecycle hooks should be driven by the active workflow definition wherever possible.
- Tag editing remains flat in V1; generated/user tags should not create hierarchy/provenance UI.
- The global suppressed-tag list remains cross-project; project lexicons scope nominations/suggestions.

## 6. Commands and Verification

Passed in this slice:

```bash
npm run verify
npm run db:migrate
npm run tauri:build -w @memo-capture/desktop -- --bundles app
git diff --check
```

Verification notes:

- `npm run db:migrate` first failed in the sandbox because `tsx` could not create its IPC pipe; approved unsandboxed rerun passed and applied only `0020_project_scoped_tag_nomination`.
- Rebuilt app bundle: `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.
- Handoff helper scripts are absent in this repo; freshness is manually grounded in `git status`, `HEAD`, and the listed verification evidence.

Useful next commands:

```bash
git status --short
git diff --check
npm run verify
npm run tauri:dev
```

## 7. Files to Open First

- `AGENTS.md`: repo-local constraints and verification expectations.
- `apps/api/db/migrations/0020_project_scoped_tag_nomination.sql`: schema change for readiness and project lexicons.
- `apps/api/src/repositories/work-items.ts`: tag masking/readiness behavior.
- `apps/api/src/repositories/tags.ts`: project lexicon maintenance and suggestion candidate query.
- `apps/api/src/services/keywords.ts`: project-scoped automatic nomination.
- `apps/api/src/services/work-items.ts`: API tag gate and optional tag patch behavior.
- `apps/desktop/src/App.tsx`: invisible tag editor gate and save payload behavior.
- `apps/api/tests/backend-foundation.test.ts` and `apps/api/tests/tag-suggestions.test.ts`: coverage for readiness, lexicon scope, and suggestion behavior.

## 8. Next Actions

Next:

- Review dirty diff and untracked migration.
- Optionally run native app smoke to confirm the tag editor stays hidden before nomination and appears after nomination.
- Commit only if explicitly requested.

Blocked:

- None.

Later:

- If runtime smoke uncovers stale pre-`0020` items with hidden historical tags, decide whether an operator-only backfill or manual nomination trigger is needed.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Review `AGENTS.md`, `apps/api/db/migrations/0020_project_scoped_tag_nomination.sql`, `apps/api/src/repositories/work-items.ts`, `apps/api/src/repositories/tags.ts`, `apps/api/src/services/keywords.ts`, `apps/api/src/services/work-items.ts`, `apps/desktop/src/App.tsx`, `apps/api/tests/backend-foundation.test.ts`, and `apps/api/tests/tag-suggestions.test.ts` first. Treat project-scoped tag visibility and nomination as implemented and verified in the dirty tree at HEAD `e00af92`. Continue by reviewing the dirty diff, optionally native-smoke-testing the invisible tag gate, and distinguishing confirmed runtime behavior from any new recommendations.
