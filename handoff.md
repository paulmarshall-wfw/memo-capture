# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-06T22:50:15Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: wire local LM Studio into Memo Capture through the existing OpenAI-compatible LLM runtime path.

### Checkpoint Status

- Git HEAD: `b9c94c3`
- Working tree: dirty
- Dirty tracked files intentionally in scope:
  - `.env.example`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/env.md`
  - `docs/completed-tasks.md`
  - `handoff.md`
- Generated/ignored artifacts intentionally updated:
  - `dist/applauncher-manifests/memo-capture/0.1.0/manifest.json`
  - `dist/applauncher-manifests/memo-capture-native/0.1.0/manifest.json`
  - `~/Library/Application Support/AppLauncher/manifest-install/memo-capture/0.1.0/manifest.json`
  - `~/Library/Application Support/AppLauncher/manifest-install/memo-capture-native/0.1.0/manifest.json`
  - `~/Library/Application Support/AppLauncher/manifests/memo-capture/0.1.0/manifest.json`
  - `~/Library/Application Support/AppLauncher/manifests/memo-capture-native/0.1.0/manifest.json`
- Local database state intentionally updated:
  - `provider_configs` row `llm/openai-compatible` is enabled, displayed as `LM Studio`, points at `http://127.0.0.1:1234/v1`, uses model `qwen/qwen3-coder-next`, requires `OPENAI_COMPATIBLE_API_KEY`, and has `external_send_enabled=false`.
  - `ai_task_routes` for `memo-expansion` and `suggest-new-memos` route to that provider and model.
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: app-side wiring, manifests, docs, local DB routing, and runtime readiness have been verified; end-to-end generation is blocked by LM Studio model loading, not by Memo Capture routing.

## 2. Executive Summary

Memo Capture already had the required OpenAI-compatible LLM adapter. This slice made LM Studio selectable and usable as the local OpenAI-compatible runtime without adding a new provider SDK or a new `lm-studio` provider key.

Complete now:

- AppLauncher web and native manifests include a new explicit `LM Studio` option under existing `llm-runtime`.
- The option injects:
  - `LLM_PROVIDER=openai-compatible`
  - `LLM_MODEL=qwen/qwen3-coder-next`
  - `LLM_ENDPOINT=http://127.0.0.1:1234/v1`
- Secrets remain outside manifests. Runtime launch used `OPENAI_COMPATIBLE_API_KEY=lm-studio` as the local dummy value.
- The live local `memo_capture` database routes `expand memo` and `suggest memos` to the OpenAI-compatible provider row configured for LM Studio.
- The native dev stack was relaunched with LM Studio env values, and `/api/settings` reports both implemented AI tasks as `runtimeReady: true`.

Blocked outside the app:

- LM Studio currently exposes models at `/v1/models`, but none of the listed chat models loaded successfully during smoke testing.
- `qwen/qwen3-coder-next` failed on LM Studio resource guardrails.
- `nvidia/nemotron-3-nano` and `qwen/qwen3-vl-30b` failed because LM Studio's local MLX backend could not find `libpython3.11.dylib`.
- A work-item task API smoke reached the provider path and failed with `OpenAI-compatible provider returned HTTP 400`, matching LM Studio's model-load failure.

## 3. Current Objective

Immediate goal: finish validating LM Studio once a chat model can load.

Definition of done for the app-side work:

- The app has an explicit LM Studio runtime option.
- Provider/task settings route to the existing OpenAI-compatible adapter.
- Runtime readiness is green when launched with LM Studio env.
- Provider invocation reaches LM Studio.

Remaining acceptance item:

- Load a working chat/completions model in LM Studio and rerun the work-item task smoke until it returns valid structured JSON.

## 4. Current State

### Working

- `GET http://127.0.0.1:1234/v1/models` reaches LM Studio and returns:
  - `qwen/qwen3-coder-next`
  - `qwen/qwen3-vl-30b`
  - `nvidia/nemotron-3-nano`
  - `text-embedding-nomic-embed-text-v1.5`
- Memo Capture API runtime after relaunch:
  - provider: `openai-compatible`
  - model: `qwen/qwen3-coder-next`
  - endpoint configured: `true`
- Both implemented work-item AI tasks are runtime-ready:
  - `expand memo`
  - `suggest memos`
- Installed AppLauncher manifests validate with zero errors and warnings.
- Native Memo Capture app is currently running from:
  - `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`

### Not Working Yet

- End-to-end AI generation cannot complete until LM Studio can load a chat model.
- The currently selected `qwen/qwen3-coder-next` model is exposed by LM Studio but failed to load due resource guardrails.

### Not Yet Done

- No tracked migration was added, intentionally. This is local runtime/provider configuration, not a universal schema or seed change.
- No Git commit was made.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, install dependencies, or mutate unrelated app/browser state unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Read `docs/design/memo-capture-design-learnings.md` before architecture, schema, workflow, ingestion, AI, or export work.
- Keep provider secrets out of manifests and source control.
- Keep AppLauncher provider/runtime options generic; do not add app-specific task wiring to AppLauncher.
- For native-testable Memo Capture changes, rebuild the runnable `.app` bundle before final handoff unless the change is manifest/runtime-only and the existing app bundle is sufficient for smoke testing.

## 6. Commands and Verification

Passed:

```bash
node --test --import tsx apps/api/tests/llm-prompt.test.ts
node --test apps/desktop/tests/app-copy.test.ts
npm run typecheck
node "/Users/paulmarshall/.codex/skills/applauncher-manifest/scripts/validate_manifest.mjs" --manifest "/Users/paulmarshall/Library/Application Support/AppLauncher/manifest-install/memo-capture/0.1.0/manifest.json"
node "/Users/paulmarshall/.codex/skills/applauncher-manifest/scripts/validate_manifest.mjs" --manifest "/Users/paulmarshall/Library/Application Support/AppLauncher/manifest-install/memo-capture-native/0.1.0/manifest.json" --verify-native-launch-targets
```

Runtime checks performed:

```bash
curl -sS --max-time 5 http://127.0.0.1:1234/v1/models
LLM_PROVIDER=openai-compatible LLM_MODEL="qwen/qwen3-coder-next" LLM_ENDPOINT="http://127.0.0.1:1234/v1" OPENAI_COMPATIBLE_API_KEY=lm-studio node scripts/applauncher-native-dev.mjs
```

Live API readiness after relaunch:

- `/api/settings` showed `llmRuntime.provider = "openai-compatible"`.
- `/api/settings` showed both implemented AI tasks with `runtimeReady: true`.

Expected failing smoke until LM Studio is fixed:

```bash
POST /api/work-items/{workItemId}/tasks/{memoExpansionTaskId}/run
```

Observed result:

- HTTP `502` from Memo Capture.
- Error: `llm_provider_failed`, `OpenAI-compatible provider returned HTTP 400`.
- Direct LM Studio probes showed model-load failures.

## 7. Files to Open First

- `docs/env.md`: runtime env contract and LM Studio notes.
- `.env.example`: non-secret env template and local LM Studio example.
- `dist/applauncher-manifests/memo-capture/0.1.0/manifest.json`: generated web manifest artifact.
- `dist/applauncher-manifests/memo-capture-native/0.1.0/manifest.json`: generated native manifest artifact.
- `apps/api/src/services/llm.ts`: OpenAI-compatible adapter and JSON response handling.
- `apps/api/src/services/ai-expansion.ts`: task/provider readiness and invocation path.
- `apps/desktop/tests/app-copy.test.ts`: manifest/runtime option assertions.

## 8. Next Actions

Next:

- Fix LM Studio so at least one chat/completions model loads successfully.
- If using a different model, update the local provider row, AI task route model, and AppLauncher `lm-studio` runtime option model from `qwen/qwen3-coder-next` to that model ID.
- Relaunch Memo Capture with:

```bash
LLM_PROVIDER=openai-compatible \
LLM_MODEL="<working-lm-studio-model-id>" \
LLM_ENDPOINT="http://127.0.0.1:1234/v1" \
OPENAI_COMPATIBLE_API_KEY=lm-studio \
node scripts/applauncher-native-dev.mjs
```

- Rerun the work-item task smoke and confirm it returns valid structured JSON.

Before committing:

```bash
git status --short
git diff --check
npm run typecheck
node --test --import tsx apps/api/tests/llm-prompt.test.ts
node --test apps/desktop/tests/app-copy.test.ts
```

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `b9c94c3` with tracked dirty files `.env.example`, `apps/desktop/tests/app-copy.test.ts`, `docs/env.md`, `docs/completed-tasks.md`, and `handoff.md`, plus generated/installed AppLauncher manifest artifacts for Memo Capture updated outside Git tracking. The app-side LM Studio wiring is complete through the existing `openai-compatible` provider: AppLauncher has an explicit `lm-studio` runtime option, the local DB routes `memo-expansion` and `suggest-new-memos` to the LM Studio-backed provider row, and `/api/settings` reports both tasks `runtimeReady: true` when launched with the LM Studio env. The remaining blocker is external to Memo Capture: LM Studio exposes models but no tested chat model currently loads. Fix or select a working LM Studio chat model, update the configured model ID if needed, relaunch, then rerun the work-item task smoke.
