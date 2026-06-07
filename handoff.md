# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-06T22:55:10Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: wire and validate local LM Studio through Memo Capture's existing OpenAI-compatible LLM runtime path.

### Checkpoint Status

- Git HEAD: `64a09d0`
- Working tree: dirty
- Dirty tracked files intentionally in scope:
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
  - `provider_configs` row `llm/openai-compatible` is enabled, displayed as `LM Studio`, points at `http://127.0.0.1:1234/v1`, uses model `openai/gpt-oss-20b`, requires `OPENAI_COMPATIBLE_API_KEY`, and has `external_send_enabled=false`.
  - `ai_task_routes` for `memo-expansion` and `suggest-new-memos` route to that provider and model.
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: app-side wiring, manifests, local DB routing, and runtime readiness were committed at `64a09d0`; the current working tree adds the OpenAI-compatible `json_schema` adapter patch and has passed real LM Studio task smoke tests with `openai/gpt-oss-20b`.

## 2. Executive Summary

Memo Capture already had the required OpenAI-compatible LLM adapter. This slice made LM Studio selectable and usable as the local OpenAI-compatible runtime without adding a new provider SDK or a new `lm-studio` provider key.

Complete now:

- AppLauncher web and native manifests include a new explicit `LM Studio` option under existing `llm-runtime`.
- The option injects:
  - `LLM_PROVIDER=openai-compatible`
  - `LLM_MODEL=openai/gpt-oss-20b`
  - `LLM_ENDPOINT=http://127.0.0.1:1234/v1`
- Secrets remain outside manifests. Runtime launch used `OPENAI_COMPATIBLE_API_KEY=lm-studio` as the local dummy value.
- The live local `memo_capture` database routes `expand memo` and `suggest memos` to the OpenAI-compatible provider row configured for LM Studio and `openai/gpt-oss-20b`.
- The API was relaunched with LM Studio env values, and both implemented work-item AI task smokes returned `validation.ok: true`.
- The OpenAI-compatible adapter now sends task-specific `json_schema` response formats. LM Studio rejected the older `json_object` format.

## 3. Current Objective

Immediate goal: continue using the validated LM Studio route in normal app testing and tune prompts/model choice if output quality is not acceptable.

Definition of done for the app-side work:

- The app has an explicit LM Studio runtime option.
- Provider/task settings route to the existing OpenAI-compatible adapter.
- Runtime readiness is green when launched with LM Studio env.
- Provider invocation reaches LM Studio.
- Real work-item task smoke returns valid structured JSON for both `expand memo` and `suggest memos`.

## 4. Current State

### Working

- `GET http://127.0.0.1:1234/v1/models` reaches LM Studio and includes `openai/gpt-oss-20b`.
- Memo Capture API runtime after relaunch:
  - provider: `openai-compatible`
  - model: `openai/gpt-oss-20b`
  - endpoint configured: `true`
- Both implemented work-item AI tasks are runtime-ready:
  - `expand memo`
  - `suggest memos`
- Installed AppLauncher manifests validate with zero errors and warnings.
- Native Memo Capture app bundle exists at:
  - `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`

### Known Caveats

- `openai/gpt-oss-20b` returns structurally valid JSON through the app path, but output quality still needs normal product review and prompt/model tuning.
- `qwen/qwen3-coder-next` is no longer the selected local runtime because LM Studio resource guardrails stopped it from loading on this machine.

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
LLM_PROVIDER=openai-compatible LLM_MODEL="openai/gpt-oss-20b" LLM_ENDPOINT="http://127.0.0.1:1234/v1" OPENAI_COMPATIBLE_API_KEY=lm-studio npm run dev:api
```

Live API readiness after relaunch:

- `/api/settings` showed `llmRuntime.provider = "openai-compatible"`.
- `/api/settings` showed both implemented AI tasks with `runtimeReady: true`.

Passing smoke after the adapter patch:

```bash
POST /api/work-items/{workItemId}/tasks/{memoExpansionTaskId}/run
POST /api/work-items/{workItemId}/tasks/{suggestMemosTaskId}/run
```

Observed result:

- HTTP `200`.
- `providerName: "openai-compatible"`.
- `modelName: "openai/gpt-oss-20b"`.
- `validation.ok: true`.

## 7. Files to Open First

- `docs/env.md`: runtime env contract and LM Studio notes.
- `.env.example`: non-secret env template and local LM Studio example.
- `dist/applauncher-manifests/memo-capture/0.1.0/manifest.json`: generated web manifest artifact.
- `dist/applauncher-manifests/memo-capture-native/0.1.0/manifest.json`: generated native manifest artifact.
- `apps/api/src/services/llm.ts`: OpenAI-compatible adapter, task-specific `json_schema` response format, and JSON response handling.
- `apps/api/src/services/ai-expansion.ts`: task/provider readiness and invocation path.
- `apps/desktop/tests/app-copy.test.ts`: manifest/runtime option assertions.

## 8. Next Actions

Next:

- Use the validated `openai/gpt-oss-20b` route for app testing, or select a different LM Studio model and update the local provider row, AI task route model, and AppLauncher `lm-studio` runtime option model to that model ID.
- Relaunch Memo Capture API with:

```bash
LLM_PROVIDER=openai-compatible \
LLM_MODEL="openai/gpt-oss-20b" \
LLM_ENDPOINT="http://127.0.0.1:1234/v1" \
OPENAI_COMPATIBLE_API_KEY=lm-studio \
npm run dev:api
```

- Rerun the work-item task smoke after prompt/model changes and confirm it returns valid structured JSON.

Before committing:

```bash
git status --short
git diff --check
npm run typecheck
node --test --import tsx apps/api/tests/llm-prompt.test.ts
node --test apps/desktop/tests/app-copy.test.ts
```

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `64a09d0` with app-code changes in `apps/api/src/services/llm.ts`, `apps/api/src/services/ai-expansion.ts`, and `apps/api/tests/llm-prompt.test.ts`, plus continuity docs dirty after this refresh. The app-side LM Studio wiring is complete through the existing `openai-compatible` provider: the local DB routes `memo-expansion` and `suggest-new-memos` to the LM Studio-backed provider row using `openai/gpt-oss-20b`, and `/api/settings` reports both tasks `runtimeReady: true` when launched with `LLM_PROVIDER=openai-compatible`, `LLM_MODEL=openai/gpt-oss-20b`, `LLM_ENDPOINT=http://127.0.0.1:1234/v1`, and `OPENAI_COMPATIBLE_API_KEY=lm-studio`. The OpenAI-compatible adapter now sends task-specific `json_schema` response formats, and real work-item task smokes for `expand memo` and `suggest memos` returned HTTP 200 with `validation.ok: true`.
