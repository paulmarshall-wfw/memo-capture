# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-01T19:03:19Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: active folder watching for the native Tauri desktop app, Whisper.cpp local runtime readiness, and continuity refresh.

### Checkpoint Status

- Git HEAD: `5778a78`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/completed-tasks.md`
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/specs/settings-and-audit.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `package.json`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/specs/settings-and-audit.md`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/tests/app-copy.test.ts`
  - `scripts/applauncher-native-dev.mjs`
  - `handoff.md`
- Last verification:
  - command: `npm run typecheck`; `npm test -w @memo-capture/desktop`; `npm run build`; `npm run verify`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`
  - result: passed
  - timestamp UTC: 2026-06-01T18:54Z
- Latest runtime check:
  - command: `curl -sS http://127.0.0.1:4788/health`; `ps -axo pid,ppid,args | perl -ne 'print if /Software Development\/memo-capture/ && !/Codex Computer Use/'`
  - result: API was not reachable at 2026-06-01T19:03Z; only a memo-capture Vite process was visible. The active watcher is implemented and verified, but it is not actively processing unless the native app plus API/worker are running.
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty files, completed-task entry, source changes, docs updates, verification commands, and runtime status were checked during this refresh. No handoff freshness helper scripts exist in this repo, so freshness was checked manually.
- Next checkpoint action: review the dirty active-watching slice, restart the native app if runtime validation is needed, then commit if acceptable.

## 2. Executive Summary

Memo Capture is a Tauri desktop app with a browser-rendered React UI, TypeScript API, TypeScript worker, Postgres, and backend-mediated artifact storage.

The current dirty slice implements active folder watching in the native desktop app. Saved, enabled watched folders with both watched and archive paths are now polled every 5 seconds while the native app is open. The polling reuses the existing Tauri stable-file scanner and existing automatic import/archive pipeline; Settings remains configuration-oriented and does not expose a manual per-file import queue.

The slice has been verified with full repo verification and an app-only native rebuild. A live smoke test after rebuild produced new watched-folder work items including `Butlers Cnr Rd` and `Rat check`. Current runtime is not up, so a fresh session should restart the native bootstrap before claiming the app is actively watching folders at that moment.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: finish and checkpoint the active-folder-watching implementation safely.

Intended finished state:

- Native Memo Capture automatically processes eligible files from saved enabled watched folders while the app is open.
- Watched-folder auto-processing respects backend file type and media capability settings.
- Manual `Check now` remains allowed only as the same automatic watched-folder processing path, not as a manual import picker.
- Native `.app` is rebuilt after user-facing desktop changes.
- Continuity docs identify the dirty files, verification, and current runtime caveat accurately.

Definition of done for this workstream:

- Dirty active-watcher files are reviewed.
- Native app is restarted before any additional runtime smoke.
- Commit is made if the implementation is accepted.

## 4. Current State

### Working

- Root scripts are present: `doctor`, `db:migrate`, `dev:api`, `dev:desktop`, `dev:worker`, `test`, `typecheck`, `build`, and `verify`.
- Active folder watching is implemented in `apps/desktop/src/App.tsx` with:
  - `watchedFolderPollingIntervalMs = 5000`
  - `watchableFolders` restricted to enabled folders with watched and archive paths
  - `activeFolderWatching` gated on Tauri runtime, auth token, machine ID, saved settings, active file extensions, and watchable folders
  - immediate scan plus interval scan while active
  - in-flight guard to avoid overlapping scans
  - manual and automatic modes sharing `runWatchedFolderScan`
  - automatic imports routed through existing `importWatchedCandidate`
- Settings status copy now reports active watching, last scan time, last processed count, and saved/unsaved status.
- Settings are loaded after auth even outside the Settings view so active file extensions are available to the watcher.
- Desktop copy test now asserts the active-watching copy and polling constant.
- Specs now state that saved enabled watched folders are actively polled by the native desktop app while it is open.
- Whisper.cpp local runtime is installed outside the repo under `/Users/paulmarshall/Software Development/whisper.cpp`, pinned to `v1.8.5`, with `ggml-base.en.bin` available and symlinked commands under `/opt/homebrew/bin/`.
- The rebuilt app bundle exists at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

### Partially Working

- Active folder watching is app-lifecycle based, not a background daemon. It only runs while the native app is open and authenticated against a running API.
- Current machine runtime is not fully up: API health failed at `127.0.0.1:4788` during this handoff refresh, and only a memo-capture Vite process was visible.
- The watcher depends on saved desktop-local watched-folder settings in Tauri/local storage. A fresh runtime smoke should confirm the configured watched/archive paths before adding new test files.
- Current smoke evidence used existing configured watched folders and produced work items, but this handoff refresh did not create another new watched file.

### Not Working Yet

- No always-on background folder watcher exists outside the native app lifecycle.
- No launch-at-login or system background service is implemented.
- No global Jobs/System Diagnostics page is complete yet.
- Production OIDC desktop sign-in, S3-compatible object storage verification, and production LLM/transcription provider setup remain future work.
- Direct create-memo UI, fuller contributor/tag/admin management, Operations workflow activation UI, and richer extraction/classification suggestions remain to be built.

### Not Yet Verified

- Active watcher behavior after a clean fresh native app restart from a single app instance.
- Long-running watch behavior across app sleep/wake, API restart, and worker restart.
- Duplicate protection under two native app instances watching the same folder.
- Image/PDF/OCR processing; those media/parser rows are settings-level support scaffolding, not implemented processing.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Use Git-derived traceability by default.
- Apply `engineering-project-standard` for repo maintenance, documentation, and verification work.
- Apply `web-app-design-standard` for browser-rendered UI changes.
- Use Chrome for browser automation unless the user asks otherwise.
- For Memo Capture user-facing/native-testable changes, treat the native Tauri app as the primary validation surface and rebuild the `.app`; do not create a DMG unless explicitly requested.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings are canonical; watched-folder and archive paths are desktop-local settings.
- Workflow actions, buckets, and reopen behavior must be driven by the active workflow definition wherever possible.
- AI output consumed by code must be structured JSON and validated before storage.
- CSV export remains out of scope for V1.

## 6. Commands and Verification

Use Node `22.14.0` and npm `10.9.x` for project commands.

Important commands:

```bash
npm run verify
npm run tauri:build -w @memo-capture/desktop -- --bundles app
./scripts/applauncher-native-dev.sh
curl -sS http://127.0.0.1:4788/health
```

Passed in the active-watching slice:

```bash
npm run typecheck
npm test -w @memo-capture/desktop
npm run build
npm run verify
npm run tauri:build -w @memo-capture/desktop -- --bundles app
git diff --check -- docs/completed-tasks.md
```

Runtime evidence from the slice:

- Rebuilt native `Memo Capture.app` launched successfully during smoke testing.
- API health passed during the smoke test.
- Automatic watched-folder import produced work items titled `Butlers Cnr Rd` and `Rat check`.
- During this handoff refresh, API health failed and only Vite was visible; restart native bootstrap before additional runtime claims.

Handoff helper status:

- `scripts/handoff_status.py` is absent.
- `scripts/verify_handoff_freshness.py` is absent.
- Freshness was checked manually with Git status, short HEAD, dirty file list, and claimed canonical file existence.

## 7. Files to Open First

- `AGENTS.md`: repo-local constraints and runtime notes.
- `handoff.md`: this hot-context checkpoint.
- `docs/completed-tasks.md`: append-only completed work ledger; do not duplicate it in handoff.
- `apps/desktop/src/App.tsx`: active watcher implementation and Settings status UI.
- `apps/desktop/tests/app-copy.test.ts`: desktop regression assertions for Settings copy.
- `docs/specs/ingestion-and-artifacts.md`: watched ingestion and artifact behavior.
- `docs/specs/settings-and-audit.md`: Settings rules, including no manual per-file import queue.
- `scripts/applauncher-native-dev.mjs`: local native bootstrap with API/worker/native app launch and Whisper.cpp env.

## 8. Next Actions

Next:

- Inspect the active-watching dirty diff.
- Start the native runtime with `./scripts/applauncher-native-dev.sh` if live watcher validation is needed.
- Re-smoke from a single native app instance: configure or confirm one watched folder and archive path, drop one text file, wait for the watcher, confirm a work item and archive move.
- Commit the active-watching slice if accepted.

Blocked:

- None at code level.
- Live watcher claims are blocked until native app, API, and worker are running again.

Later:

- Decide whether V1 needs a true background watcher outside the app lifecycle.
- Build the global Jobs/System Diagnostics surface.
- Add longer-running watcher resilience checks for sleep/wake, API restarts, worker restarts, and duplicate native app instances.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Do not duplicate `docs/completed-tasks.md`; use it only for completed work history. Review `AGENTS.md`, `apps/desktop/src/App.tsx`, `apps/desktop/tests/app-copy.test.ts`, `docs/specs/ingestion-and-artifacts.md`, and `docs/specs/settings-and-audit.md` first. Treat the active-folder-watching implementation as complete but dirty at HEAD `5778a78`; verify current runtime before saying folders are actively being watched. Continue by reviewing the dirty diff, restarting the native bootstrap if runtime validation is needed, and committing only if explicitly asked.
