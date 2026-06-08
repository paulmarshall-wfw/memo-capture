# Memo Capture Shared Runtime And Provider Registry Companion Plan

## Summary

Refactor `/Users/paulmarshall/Software Development/memo-capture` to consume the shared `invoke-providers-for-tasks` runtime stack comprehensively:

- Provider catalog comes from the shared registry service.
- Memo Capture keeps app-owned task config, hook registry, prompt config, task-run persistence, domain hooks, workflow state, auth, object storage, and secrets.
- `TargetAppRuntimeService` becomes the app-side facade for task settings, hook registry state, prompt config saves, readiness diagnostics, adapter diagnostics, render-slot actions, invocation, and task-run history.
- Current Settings UX stays task-first: Providers are catalog/status only; Tasks own routing, prompt, model override, render location, readiness, and display order.

## Implementation Changes

- Add pinned `0.1.0` dependencies for `@invoke-providers/core`, `@invoke-providers/client`, `@invoke-providers/adapters`, and optionally `@invoke-providers/react`; do not import `@invoke-providers/registry` into Memo Capture because the registry is a separate Node 24 local service.
- Extend API config to read `INVOKE_PROVIDERS_REGISTRY_URL`, `INVOKE_PROVIDERS_PROFILE`, and `INVOKE_PROVIDERS_COMMIT_SHA`; keep legacy `LLM_*`, `TRANSCRIPTION_*`, and `WHISPER_CPP_*` env support only as fallback/migration compatibility.
- Add `apps/api/src/services/invoke-providers/` with:
  - `runtime.ts`: constructs `TargetAppRuntimeService`.
  - `repositories.ts`: adapts Memo Capture Postgres repositories to shared `TaskRepository`, `HookRepository`, and `TaskRunRepository`.
  - `registry.ts`: wraps `RemoteRegistryClient` and provider refresh/error handling.
  - `mapping.ts`: maps existing task/prompt/hook rows to shared types.
  - `adapters.ts`: creates provider adapters from registry provider records and local runtime config.
  - `secrets.ts`: resolves secret availability and raw secrets at invocation boundaries only.
  - `hooks.ts`: dispatches Memo Capture-owned hook implementations.
- Implement a per-request runtime service factory that supplies registry providers, app-owned repositories, app hooks, adapters, runtime context, secret resolver, audit logging, and task-run persistence.

## Data And Migrations

- Keep `ai_task_definitions`, `ai_task_routes`, `processing_hooks`, and prompt tables as the canonical Memo Capture task/hook/prompt store.
- Add route fields for registry-backed provider selection: `registry_profile_key`, `provider_key`, and optional `provider_model_override`, while preserving `provider_config_id` during migration.
- Add `invoke_task_runs` for shared `TaskRun` history with task key, hook key, provider key, adapter key, model, prompt version/snapshot, status, error class/message, readiness reasons, validation metadata, latency, usage, commit SHA, request/correlation ID, actor, related work item/source memo/job IDs, and timestamps.
- Add a one-time export/seed script that converts existing `provider_configs` rows into registry seed JSON with stable provider keys, capabilities, enabled state, model/endpoint metadata, external-send flag, health status, and secret refs only.
- Normalize provider capability keys to shared values: `llm.generateText`, `llm.generateJson`, `stt.transcribe`, `tts.synthesize`, `ocr.extractText`, and `module.runDeterministic`.
- Backfill current Memo Capture tasks into shared-compatible task records for `memo-expansion`, `suggest-new-memos`, `suggest-tags`, transcription, and OCR extraction where missing.
- Do not store raw secrets in Postgres, registry rows, manifests, docs, or task-run records.

## Runtime Library Adoption

- **Task config:** route task settings APIs through `TargetAppRuntimeService.listTaskSettings`, `saveTaskSettings`, `setTaskEnabled`, and `selectTaskProvider`.
- **Hook registry:** route Processing Hooks APIs through `getHookRegistryState`, `upsertHook`, and `deleteHookIfUnused`; preserve app-owned implemented/unimplemented hook status.
- **Prompt config:** route prompt updates through `savePromptConfig`, while preserving existing prompt tables, prompt versions, output schema, context selectors, and editable `systemMessage`.
- **Task-run history:** expose list/detail/grouped history using `listTaskRuns` and `groupTaskRuns`; link shared task runs to Memo Capture audit and processing-job records.
- **Readiness diagnostics:** use `getReadinessDiagnostics` for Settings, disabled action buttons, diagnostics panels, and API enablement checks.
- **Adapter diagnostics:** expose `diagnoseAdapter` as the safe “test provider” path; it may call the selected adapter but must not dispatch Memo Capture domain hooks.
- **Render slots:** use `listRenderSlots` and `getRenderSlotActions` for `work_item_detail`, `work_item_list`, and `export_page`; preserve visible disabled actions with concrete reasons.
- **Invocation:** use `invokeTask` through `TargetAppRuntimeService` for provider-backed tasks; Memo Capture hook code remains the only place where domain changes are prepared or applied.

## Provider Coverage

- Register deterministic adapters for local tests and demos: LLM, STT, OCR, TTS, and module.
- Register OpenAI-compatible adapters separately for cloud and local providers:
  - `openai-compatible-cloud`
  - `openai-compatible-local` for LM Studio and similar local servers.
- Register `WhisperCppAdapter` for STT, using existing Whisper.cpp binary/model/ffmpeg config and preserving retry/error semantics.
- Register `AppleVisionOcrAdapter` for macOS OCR, using a configured compiled Swift helper path.
- Keep `paddleocr-local` visible only as a disabled future OCR provider until a real adapter is implemented.
- Surface TTS/module providers in catalog, readiness, diagnostics, and task setup, but keep Memo Capture tasks disabled unless a real app-owned hook exists.

## Memo Capture Behavior To Preserve

- `memo-expansion` returns an expanded memo candidate for modal review; it must not mutate the live editor until accepted.
- `suggest-new-memos` returns ephemeral suggested work-item candidates; they persist only when explicitly accepted.
- Structured JSON validation remains strict before hook output is considered usable.
- Audio transcription still creates transcript artifacts, work items, processing-job results, retry state, and manual recovery paths through existing Memo Capture services.
- OCR output becomes app-owned review/artifact data; it must not directly advance workflow state.
- Workflow transitions, scheduled hooks, tag nomination, classification, source memo creation, photo intake, object storage, and auth stay outside the shared library.

## API And UI Changes

- Keep `/api/settings` compatible, but derive provider/task readiness from the shared runtime service.
- Add/extend protected API endpoints for:
  - registry status and provider refresh
  - provider adapter diagnostics
  - task settings save/enable/provider selection
  - prompt config save
  - hook registry state/create/delete
  - render-slot action previews
  - task-run list/detail/grouping
- Providers Settings page:
  - show registry URL/profile, registry reachability, provider list, enabled state, health, capabilities, external-send flag, secret-ref readiness, and last health check.
  - remove task routing, prompt editing, and hook behavior from this page.
- Tasks Settings page:
  - show task enablement, selected registry provider, capability requirement, prompt/system-message editor, model override, render location, display order, readiness reasons, and safe test invocation.
- Processing Hooks page:
  - remain app-owned; show implemented/unimplemented state, usage counts, safe delete state, and orphan implementations.
- Diagnostics:
  - show registry reachability, selected profile, missing secrets, runtime mismatch, adapter availability, provider health, and recent task runs.
- Work-item and export surfaces:
  - render task actions from shared render-slot actions; unavailable actions stay visible but disabled with specific reason text.

## Verification Plan

- Mapping tests for provider, task, hook, prompt, runtime, secret, and task-run conversions.
- Settings tests for registry unavailable, missing profile, disabled provider, missing provider, missing secret, incompatible capability, unimplemented hook, runtime mismatch, and ready state.
- Runtime-service tests for task save, enable/disable, provider selection, prompt save, hook delete-in-use rejection, render-slot action ordering, and task-run grouping.
- LLM tests for deterministic, OpenAI-compatible local, OpenAI-compatible cloud, JSON schema request construction, invalid JSON, empty output, and hook output validation.
- STT tests for deterministic and Whisper.cpp success, missing model, missing binary, ffmpeg failure, timeout, and empty transcript.
- OCR tests for Apple Vision OCR adapter wiring, missing helper path, normalized output mapping, and disabled PaddleOCR readiness.
- API tests for new diagnostics and task-run endpoints.
- Postgres tests for migrations, provider-key backfill, task-run persistence, and compatibility with existing provider/task rows.
- Desktop tests for Providers, Tasks, Processing Hooks, readiness panels, disabled work-item actions, task-run history, diagnostics copy, and prompt/system-message editing.
- Final checks: `npm run typecheck`, focused `node --test --import tsx ...`, `npm run test:postgres`, `npm run build`, `npm run verify`, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app`.

## Assumptions

- Memo Capture remains Build Mode version `0.1.0`.
- The shared registry service runs separately on `127.0.0.1:5181`.
- AppLauncher injects only non-secret registry context.
- Memo Capture resolves secrets locally from environment/AppLauncher/Keychain references.
- No commit, tag, release, publish, DMG, or destructive migration is part of this plan.
