# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-02T06:06:00Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: global suppressed-tag suggestion filtering, work-item detail chip actions, Settings suppressed-tag management, verification, native app rebuild, completed-task ledger update.

### Checkpoint Status

- Git HEAD: `82c64f5`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/repositories/tags.ts`
  - `apps/api/src/server.ts`
  - `apps/api/src/services/app.ts`
  - `apps/api/src/services/work-items.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/api/tests/tag-suggestions.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/styles.css`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/db/migrations/0018_global_suppressed_tags.sql`
  - `apps/api/src/services/tags.ts`
  - `docs/plans/Global_Do-Not-Use_Tag_Suppression.txt`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/plans/Global_Do-Not-Use_Tag_Suppression.txt`
- Last verification:
  - command: `npm run typecheck`; `npm test`; `npm run verify`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`; `git diff --check`
  - result: passed
  - timestamp UTC: 2026-06-02T06:06Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty/untracked file list, completed-task ledger entry, verification commands, and native `.app` rebuild are recorded here. This repo lacks `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py`, so freshness was checked manually with Git facts and file state.
- Next checkpoint action: apply migration `0018` to the target local database before live UI testing, then smoke-test the suppressed-tag chip actions in the native app; commit only if explicitly requested.

## 2. Executive Summary

The global suppressed-tag suggestion feature is implemented in the dirty tree. A new `suppressed_tags` table and tag service/API let users globally suppress suggestion labels while leaving normal flat `tags` / `work_item_tags` storage unchanged. `GET /api/work-items/:id/tag-suggestions` now excludes suppressed labels from Strong, Related, and Weak rows, including text-derived keyword suggestions.

The right-side work-item detail panel still exposes only Selected, Strong, Related, and Weak tag groups. Selected chips now have a left minus action to globally suppress and remove from the current draft, plus the existing right `X` to remove from the draft only. Strong/Related/Weak chips now have a left minus action to suppress and a main click target to add the tag to Selected. Settings now has a `Suppressed Tags` page with an alphabetical multi-column restore grid.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: finish the suppressed-tag feature handoff so the next session can migrate the database and smoke-test the UI without reopening the design choices.

Definition of done for this workstream:

- Global suppression is stored separately from selected work-item tags.
- Suppression hides labels from automatic suggestion rows only.
- Manual tag entry and existing selected tags remain allowed.
- Detail-panel categories remain Selected, Strong, Related, and Weak.
- Settings provides a way to restore globally suppressed labels.
- Automated verification and native `.app` rebuild pass.

## 4. Current State

### Working

- `apps/api/db/migrations/0018_global_suppressed_tags.sql` creates the global suppression table keyed by normalized label.
- `apps/api/src/repositories/tags.ts` lists, creates, deletes, and filters suppressed tags.
- `apps/api/src/services/tags.ts` exposes suppression operations through validated service methods.
- `apps/api/src/server.ts` routes:
  - `GET /api/tags/suppressed`
  - `POST /api/tags/suppressed`
  - `DELETE /api/tags/suppressed/:normalizedName`
- `apps/api/src/services/work-items.ts` filters suppressed labels from both existing tag candidates and newly extracted keyword suggestions.
- `apps/desktop/src/App.tsx` implements split chip actions in the detail panel and the Settings `Suppressed Tags` page.
- `apps/desktop/src/styles.css` keeps split chips compact and makes the suppressed-tags table responsive.
- Tests cover suppression filtering, API route shape, and desktop copy/affordance expectations.
- `docs/design/memo-capture-design-learnings.md` records that suppression affects automatic suggestions only.
- Native app bundle rebuilt at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

### Partially Working

- The feature is verified by automated tests and build, but not yet manually exercised against a migrated live local database.

### Not Working Yet

- No known code blocker remains.

### Not Yet Verified

- `npm run db:migrate` has not been run for migration `0018` in this session.
- Native UI smoke has not yet clicked the minus/restore actions after applying `0018`.
- Browser/Chrome automation was not run for this slice; native bundle rebuild was completed.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Apply `engineering-project-standard` for repo maintenance and verification work.
- Apply `web-app-design-standard` for browser-rendered/Tauri UI changes.
- Use Chrome for browser automation unless the user asks otherwise.
- For Memo Capture user-facing/native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings and tag contracts are canonical; desktop UI state is transient until saved.
- V1 tag editing remains flat: selected tags use `tags` / `work_item_tags`; suppression is a separate global suggestion filter, not a tag hierarchy.

## 6. Commands and Verification

Passed in this slice:

```bash
npm run typecheck
npm test
npm run verify
npm run tauri:build -w @memo-capture/desktop -- --bundles app
git diff --check
```

Verification notes:

- Initial sandboxed `npm test` failed only because protected-route tests could not bind `127.0.0.1` (`listen EPERM`); the approved unsandboxed rerun passed.
- `npm run verify` passed and included doctor, typecheck, tests, and build.
- `npm run tauri:build -w @memo-capture/desktop -- --bundles app` rebuilt the runnable `Memo Capture.app`.
- `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` are absent in this repo; handoff freshness was checked manually.

Useful next commands:

```bash
npm run db:migrate
npm run tauri:dev
git status --short
git diff --check
```

## 7. Files to Open First

- `AGENTS.md`: repo-local constraints and verification expectations.
- `docs/plans/Global_Do-Not-Use_Tag_Suppression.txt`: user-updated implementation plan and interaction requirements.
- `apps/api/db/migrations/0018_global_suppressed_tags.sql`: pending schema change to apply.
- `apps/api/src/repositories/tags.ts`: canonical tag and suppression storage behavior.
- `apps/api/src/services/tags.ts`: suppression API validation and service surface.
- `apps/api/src/services/work-items.ts`: suggestion filtering behavior.
- `apps/desktop/src/App.tsx`: detail-panel chip actions and Settings page.
- `apps/desktop/src/styles.css`: split-chip and suppressed-tags table layout.
- `docs/completed-tasks.md`: append-only completed work ledger.

## 8. Next Actions

Next:

- Run `npm run db:migrate` against the intended local Postgres database to apply `0018_global_suppressed_tags.sql`.
- Launch the native app and smoke-test:
  - selected-tag left minus suppresses globally and removes from draft
  - selected-tag right `X` only removes from draft
  - suggestion-chip left minus suppresses globally
  - suggestion-chip main click adds to Selected
  - Settings `Suppressed Tags` plus action restores suggestions
- Review the dirty diff, including the untracked user plan file.
- Commit only if explicitly requested.

Blocked:

- None.

Later:

- Consider adding a live browser/native screenshot check once the local DB has `0018` applied and the API stack is running.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Review `AGENTS.md`, `docs/plans/Global_Do-Not-Use_Tag_Suppression.txt`, `apps/api/db/migrations/0018_global_suppressed_tags.sql`, `apps/api/src/repositories/tags.ts`, `apps/api/src/services/tags.ts`, `apps/api/src/services/work-items.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, and `docs/completed-tasks.md` first. Treat global suppressed-tag storage, API filtering, detail-panel minus actions, and the Settings `Suppressed Tags` restore page as implemented and verified in the dirty tree at HEAD `82c64f5`. Continue by applying migration `0018`, smoke-testing the native UI actions, and distinguishing confirmed runtime behavior from any new recommendations.
