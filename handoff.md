# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-05-31T03:40:55Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: backend runtime debugger wiring, Audit debugger API integration, workflow runtime event journal docs, completed-task ledger update, and current checkpoint refresh.

### Checkpoint Status

- Git HEAD: `9190f57`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/server.ts`
  - `apps/api/src/services/workflows.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/api/tests/workflow-runtime.test.ts`
  - `apps/desktop/src/App.tsx`
  - `docs/completed-tasks.md`
  - `docs/specs/workflow-runtime-integration.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/src/services/workflow-debugger.ts`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/workflow-runtime-integration.md`
  - `apps/api/src/services/workflow-debugger.ts`
  - `apps/api/src/services/workflows.ts`
  - `apps/api/src/server.ts`
  - `apps/desktop/package.json`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/styles.css`
  - `apps/desktop/vite.config.ts`
  - `package-lock.json`
- Last verification:
  - command: `npm run verify`
  - result: passed
  - timestamp UTC: 2026-05-31T03:40:55Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD` is recorded, all dirty files are accounted for, the root verification suite passed, and the debugger controls now use a backend runtime debugger contract.
- Next checkpoint action: review and commit the dirty patch set if acceptable.

## 2. Executive Summary

Current focus is the Audit runtime debugger surface.

Complete now:

- Settings includes configurable project create/edit/deactivate controls backed by the existing `/api/projects` API.
- Audit Events moved out of Settings into a new top-level `Audit` page.
- The `Audit` page uses a two-panel layout: application audit events on the left, generic runtime event-journal debugger on the right.
- The right panel mounts `@state-workflow/debugger-react` through a Memo Capture adapter that calls backend debugger snapshot/control endpoints.
- Backend workflow action execution now records runtime journal events and waits at debugger-controlled runtime step boundaries when paused or in step mode.
- Protected backend debugger routes exist for snapshot, start, pause, resume, step, and stop.
- `apps/desktop/vite.config.ts` aliases `state-workflow-runtime` to the browser-safe debugger headless build because the package root imports Node-only modules.
- `docs/completed-tasks.md` was updated. Completed work history is tracked there; do not duplicate it here.

Incomplete now:

- The project settings form has type/build coverage and render coverage, but create/save/deactivate was not re-smoked through live browser clicks in this refresh.
- `npm install` updated `package-lock.json` using the ambient shell Node/npm, which warned that `node v24.14.0` and `npm 11.9.0` are outside the repo engine range. Use Node `22.14.0` and npm `10.9.x` for normal repo work.
- `npm install` reported one high-severity audit finding; it was not investigated in this pass.

Safe to continue from this state if the next session treats `9190f57` as the committed baseline plus the dirty debugger patch set listed above.

## 3. Current Objective

Immediate goal: keep the desktop app's Settings and Audit areas aligned with the product expectation that projects are deterministic/configurable and audit diagnostics are separated from backend settings.

Intended finished state:

- Project names and metadata are user-configurable rather than inferred from memo text.
- Audit diagnostics have their own top-level workspace.
- Runtime debugging UI commands backend runtime execution through protected API routes.

Definition of done for the current workstream:

- Audit page layout and debugger integration remain verified by `npm run verify` and browser smoke.
- Debugger controls are connected to real backend runtime debugger APIs.
- Dirty files are reviewed and committed when the behavior is accepted.

## 4. Current State

### Working

- `npm run verify` passes.
- Desktop navigation includes `Work queue`, `Audit`, `Exports`, `Watched folders`, and `Settings`.
- Settings renders project management controls for existing projects plus a new-project draft form.
- Audit renders application audit events in the left panel.
- Audit renders the generic workflow event-journal debugger in the right panel using backend debugger snapshots.
- `Start Debugger`, `Pause`, `Resume`, `Step`, and `Stop` call backend debugger endpoints.
- Workflow action execution journals validation, transition, hook, and audit-recording events and waits at runtime step boundaries when the backend debugger is paused or in step mode.
- Chrome visual verification at `http://127.0.0.1:5176/` confirmed Audit events in the left panel and the debugger in the right panel.
- The current implementation builds production desktop assets successfully through the root verification script.

### Partially Working

- The backend debugger event journal is process-local and bounded to the most recent 500 events; it is not persisted across API restarts.
- Existing local browser tabs may still point at `http://127.0.0.1:5175/`; the previously verified fresh server for the Audit page was `http://127.0.0.1:5176/`.

### Not Working Yet

- No known debugger-control gap remains in the current dirty patch set.

### Not Yet Verified

- Live browser-click create/save/deactivate flow for projects.
- Live browser-click stepping of an in-flight workflow action from the Audit panel.
- Tauri/Rust desktop build/check.
- Watched-folder import, audio transcription recovery, export download, and non-disabled AI provider flows after the latest desktop UI changes.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, deploy, delete files, or weaken project instructions unless explicitly asked.
- Never use `latest`; always use numbered versions.
- Use Node `22.14.0` and npm `10.9.x` for repo commands.
- Apply `engineering-project-standard` for setup, maintenance, versioning, stack, documentation, and verification work.
- Apply `web-app-design-standard` for frontend UI work.
- Use Chrome for browser automation unless the user explicitly asks for another browser or Chrome is unavailable.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings are canonical; watched-folder and archive paths are desktop-local settings.
- Workflow actions, buckets, and reopen behavior must be driven by the active workflow definition wherever possible.
- AI output consumed by code must be structured JSON and validated before storage.
- AI expansion is an app-owned side action, not a workflow transition.
- CSV export, delete behavior, and privacy purge behavior are out of scope for V1.

## 6. Commands and Verification

Use the repo's expected Node/npm versions:

```bash
nvm use 22.14.0
npm run verify
```

Primary dev commands:

```bash
npm run dev:api
npm run dev:worker
npm run dev:desktop
```

Desktop-only verified command used in this pass:

```bash
npm run dev -w @memo-capture/desktop -- --host 127.0.0.1 --port 5176
```

Passed in this refresh:

```bash
npm run verify
```

Verification evidence:

- Root doctor, typecheck, workspace tests, and build passed.
- Desktop Vite build transformed 1636 modules and emitted production assets.
- Chrome visual check confirmed the new `Audit` page layout and debugger rendering at `http://127.0.0.1:5176/`.

Current blockers and caveats:

- No `scripts/handoff_status.py` or `scripts/verify_handoff_freshness.py` exists in this repo, so handoff freshness was checked manually with `git status`, `HEAD`, dirty file inventory, file existence, and `npm run verify`.
- The generic debugger controls are semantically misleading until made read-only or backed by real backend runtime debugger behavior.
- The package-lock update should be reviewed because installation ran under the ambient Node/npm and produced engine warnings.

## 7. Files to Open First

- `AGENTS.md`: repo-local instructions and constraints.
- `handoff.md`: hot-context continuity source.
- `docs/completed-tasks.md`: append-only completed work ledger.
- `docs/design/memo-capture-design-learnings.md`: resolved V1 product decisions.
- `apps/desktop/src/App.tsx`: project settings, Audit page, and debugger adapter.
- `apps/desktop/src/styles.css`: Audit, Settings, project editor, and debugger styling.
- `apps/desktop/vite.config.ts`: runtime debugger alias for browser bundling.
- `apps/desktop/package.json`: local state-workflow debugger dependencies.
- `package-lock.json`: dependency graph updated after adding debugger packages.

## 8. Suggested Next Steps

1. Decide the debugger-control behavior: disable/hide the controls for read-only projection, or add backend runtime debugger APIs and wire them honestly.
2. Re-smoke project create/save/deactivate from Chrome.
3. Review `package-lock.json` and the local file dependencies to `state-workflow-runtime`.
4. Re-run `npm run verify` after any debugger-control change.
5. Commit the dirty patch set once the UI behavior is accepted.
