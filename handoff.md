# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-07T03:40:20Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: checkpoint the LM Studio OpenAI-compatible runtime repair and continuity docs.

### Checkpoint Status

- Git HEAD: `11ff2d3`
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
  - `docs/completed-tasks.md`
  - `docs/env.md`
  - `handoff.md`
  - `scripts/applauncher-native-dev.mjs`
- Last verification:
  - command: `node --check scripts/applauncher-native-dev.mjs`; `git diff --check`; live `/api/settings` readiness check
  - result: passed
  - timestamp UTC: 2026-06-07T03:40:20Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: `HEAD 11ff2d3` contains the native LM Studio dummy-key fallback and env-doc update; the current dirty tree is only this requested ledger/handoff refresh.
- Next checkpoint action: commit or leave the continuity docs dirty intentionally.

## 2. Executive Summary

Memo Capture's local LM Studio route is now usable through the existing OpenAI-compatible provider without manually injecting a dummy key into the native helper launch.

Complete now:

- `scripts/applauncher-native-dev.mjs` supplies `OPENAI_COMPATIBLE_API_KEY=lm-studio` only when:
  - `LLM_PROVIDER=openai-compatible`
  - `LLM_ENDPOINT=http://127.0.0.1:1234/v1`
  - no non-empty `OPENAI_COMPATIBLE_API_KEY` was injected
- `docs/env.md` documents that native-helper local LM Studio fallback.
- The app was relaunched after the patch.
- Live `/api/settings` showed the LM Studio-backed `openai-compatible` provider with `secretConfigured: true`.
- Live `/api/settings` showed both work-item AI tasks runtime-ready:
  - `expand memo`
  - `suggest memos`

Incomplete now:

- Local LLM prompt/output quality still needs normal product review. The default system messages are schema-safe but light on quality guidance.
- No new native `.app` rebuild was run for this script/docs-only correction.

Safe to continue: yes, from `HEAD 11ff2d3` plus the intentionally dirty continuity docs.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: continue testing Memo Capture AI actions through LM Studio and tune task prompts/model choice if output quality is not acceptable.

Intended finished state:

- The native AppLauncher path starts Memo Capture with a runtime-ready local LM Studio provider.
- Task buttons are enabled when LM Studio is selected and reachable.
- `expand memo` and `suggest memos` continue returning valid structured JSON.

Definition of done for the current workstream:

- Native helper no longer fails readiness solely because the local LM Studio dummy key was not injected.
- Runtime readiness is green in `/api/settings`.
- Continuity docs accurately describe the current checkpoint.

## 4. Current State

### Working

- Current committed checkpoint is `11ff2d3` on `main`.
- Native helper local LM Studio fallback is committed.
- `docs/env.md` documents the fallback.
- Live API readiness after relaunch showed:
  - provider `openai-compatible`
  - display name `LM Studio`
  - runtime provider `openai-compatible`
  - runtime model `openai/gpt-oss-20b`
  - `secretConfigured: true`
  - `expand memo` `runtimeReady: true`
  - `suggest memos` `runtimeReady: true`

### Partially Working

- The default system prompt is good for JSON compliance because the adapter also sends `response_format: json_schema`.
- The default system prompt is not yet strong product guidance for local model quality. It should probably add concise instructions to preserve user intent, avoid invented facts, keep tags relevant, and only suggest distinct follow-up memos.

### Not Working Yet

- No current repo evidence shows a remaining `OPENAI_COMPATIBLE_API_KEY` readiness failure after the fallback relaunch.

### Not Yet Verified

- Full `npm run verify` was not rerun after the script/docs-only fallback.
- Native UI button state was not rechecked visually after the final continuity-doc refresh.
- Prompt-quality evaluation against `openai/gpt-oss-20b` remains unscored.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, install dependencies, delete files, or mutate unrelated app/browser state unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Read `docs/design/memo-capture-design-learnings.md` before architecture, schema, workflow, ingestion, AI, or export work.
- Keep provider secrets out of manifests and source control.
- Keep AppLauncher provider/runtime options generic; do not add app-specific task wiring to AppLauncher.
- For local LM Studio, `OPENAI_COMPATIBLE_API_KEY=lm-studio` is a local dummy value, not a real credential.
- For non-local OpenAI-compatible endpoints, require a real injected secret; do not extend the dummy-key fallback beyond `http://127.0.0.1:1234/v1`.

## 6. Commands and Verification

Most recent passed checks:

```bash
node --check scripts/applauncher-native-dev.mjs
git diff --check
```

Live readiness check performed after relaunch:

```bash
GET /api/settings
```

Confirmed result:

- `openai-compatible` provider `secretConfigured: true`
- `expand memo` `runtimeReady: true`
- `suggest memos` `runtimeReady: true`

Useful next checks:

```bash
git status --short
git diff --check
node --check scripts/applauncher-native-dev.mjs
node --test --import tsx apps/api/tests/llm-prompt.test.ts
```

For broader validation before committing more app behavior:

```bash
npm run typecheck
npm run test:postgres
npm run verify
```

## 7. Files to Open First

- `scripts/applauncher-native-dev.mjs`: native helper fallback for local LM Studio key injection.
- `docs/env.md`: runtime env contract and local LM Studio notes.
- `apps/api/src/services/llm.ts`: OpenAI-compatible adapter, task system messages, and `json_schema` response format.
- `apps/api/src/services/ai-expansion.ts`: task/provider readiness checks and work-item task invocation path.
- `apps/desktop/src/App.tsx`: task button readiness rendering and tooltip display.
- `docs/completed-tasks.md`: append-only completion history.

## 8. Next Actions

Next:

- Test `expand memo` and `suggest memos` in the native UI now that `/api/settings` reports both runtime-ready.
- If local-model output quality is weak, tune task-owned System messages in Settings before changing adapter code.
- For prompt tuning, keep the JSON shape in the system message and add quality constraints such as preserving user intent, avoiding invented facts, using relevant tags, and returning empty suggestions when there are no distinct follow-up memos.

Blocked:

- None known for the local LM Studio readiness issue.

Later:

- If the native AppLauncher secret path is fixed upstream, consider removing or narrowing the helper fallback after verifying secrets are delivered to native executable launches.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `11ff2d3`, with only `docs/completed-tasks.md` and `handoff.md` intentionally dirty after the continuity refresh. The local LM Studio readiness issue was fixed in `scripts/applauncher-native-dev.mjs` by supplying the documented dummy `OPENAI_COMPATIBLE_API_KEY=lm-studio` only when the selected OpenAI-compatible endpoint is `http://127.0.0.1:1234/v1` and no key was injected. Before editing, review `scripts/applauncher-native-dev.mjs`, `docs/env.md`, `apps/api/src/services/llm.ts`, and `apps/api/src/services/ai-expansion.ts`. Continue by testing the native UI task buttons and tuning task-owned System messages if local-model output quality is weak. Distinguish confirmed runtime readiness from new prompt-quality recommendations.
