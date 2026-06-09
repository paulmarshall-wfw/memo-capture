# Memo Capture Invoke Providers Runtime Alignment Plan

## Objective

Align Memo Capture with the shared provider registry and the `@invoke-providers/*` runtime libraries while preserving Memo Capture's app-owned boundaries.

The target structure is:

- `invoke-providers-for-tasks` owns generic provider-task mechanics: provider and task types, readiness, hook registry reconciliation, render-slot action derivation, adapter contracts, invocation orchestration, structured-output validation, no-op behavior, and task-run provenance.
- The shared provider registry owns provider catalog records only: profiles, provider configs, capabilities, enabled state, health metadata, and secret references.
- Memo Capture owns storage, prompts, processing hooks, jobs, audit, workflow state, secrets, UI, object/domain records, and all domain mutations.

Memo Capture is already midway through this migration. Settings now treats the registry provider catalog as the user-facing provider source of truth, but generic runtime, readiness, adapter, invocation, and task-run behavior still needs to move behind the shared packages.

## Current State

Memo Capture currently has the right product-level split, but the implementation still has transitional duplication.

Already aligned:

- Provider registry records are shown as the provider catalog in Settings.
- Task routing stores `registry_profile_key`, `provider_key`, and `provider_model_override`.
- Providers are catalog/status only in the Memo Capture UI.
- Tasks own routing, prompt fields, system messages, render location, display order, enabled state, and readiness.
- Processing hooks are app-owned and keyed by `hookKey`.
- Prompt definitions, prompt versions, task runs, audit events, jobs, work items, workflow transitions, and domain records remain in Memo Capture.

Still transitional:

- Memo Capture has a local `TargetAppRuntimeService` in `apps/api/src/services/invoke-providers/runtime.ts`.
- Memo Capture has local shared provider/task/run types in `apps/api/src/services/invoke-providers/types.ts`.
- Memo Capture has custom registry fetch/parse helpers in `apps/api/src/services/invoke-providers/registry.ts`.
- Memo Capture has custom readiness logic and adapter diagnostics in `apps/api/src/services/invoke-providers/runtime.ts` and `adapters.ts`.
- Memo Capture has local LLM provider implementations in `apps/api/src/services/llm.ts`.
- Actual task execution still depends on `provider_config_id` shadow rows and joined `provider_configs` fields for provider kind/name/secret/runtime behavior.
- `AiExpansionService` invokes local providers directly instead of invoking tasks through `TargetAppRuntimeService.invokeTask`.

## Implementation Chunks

### 1. Shared Runtime Boundary

Goal: replace Memo Capture's local runtime implementation with the shared runtime service exported by `@invoke-providers/client`.

Implementation:

- Import `TargetAppRuntimeService` and related types from `@invoke-providers/client` and `@invoke-providers/core`.
- Remove or shrink the local `apps/api/src/services/invoke-providers/runtime.ts` class.
- Keep a Memo Capture factory such as `createMemoCaptureInvokeRuntime(db, config)` that constructs the shared runtime with Memo Capture-specific dependencies.
- Convert `apps/api/src/services/invoke-providers/` into thin app glue only:
  - `repositories.ts`: Memo Capture DB adapters for shared repositories.
  - `adapters.ts`: adapter instance construction from local runtime config.
  - `secrets.ts`: secret availability and secret value resolution.
  - `hooks.ts`: app-owned hook dispatcher.
  - `mapping.ts`: row-to-shared-type mapping only.
  - `registry.ts`: remove or reduce to a wrapper around shared registry client behavior.
- Delete Memo Capture-local shared types where the same shape exists in `@invoke-providers/core` or `@invoke-providers/client`.

Acceptance criteria:

- No Memo Capture-local class named `TargetAppRuntimeService` remains.
- Settings and task APIs obtain readiness, hook state, render slots, adapter diagnostics, and task-run history through the shared runtime service.
- Memo Capture-specific code is limited to storage, secrets, adapters, hooks, audit/job wrapping, and UI/API serialization.

### 2. Registry Client And Profile Selection

Goal: use the shared registry client/profile-selection semantics instead of custom registry HTTP parsing.

Implementation:

- Replace custom registry fetch/parse helpers with `RemoteRegistryClient` or the registry-profile selection support in `@invoke-providers/client`.
- Keep `provider_registry_settings.selected_provider_profile_key` as Memo Capture-owned persisted state.
- Preserve profile resolution order:
  - saved selected profile first
  - `INVOKE_PROVIDERS_PROFILE` as bootstrap default second
  - not configured if neither exists
- Preserve missing saved profile behavior:
  - keep the saved value
  - block provider-backed readiness
  - show a concrete Settings diagnostic asking the user to save a valid profile
- Keep registry URL as runtime config from `INVOKE_PROVIDERS_REGISTRY_URL`.
- Keep provider setup outside Memo Capture. Memo Capture must not create, edit, enable, disable, or delete registry provider records.

Acceptance criteria:

- Settings still shows registry URL, active profile, available profiles, provider count, provider health, and registry errors.
- Saved profile override, clear override, missing profile, and registry unavailable paths still work.
- Memo Capture code no longer manually parses every registry provider field when the shared client can provide typed provider records.

### 3. Repository Adapters

Goal: implement shared repository interfaces over Memo Capture's existing schema.

Implementation:

- Implement `TaskRepository` over:
  - `ai_task_definitions`
  - `ai_task_routes`
  - `task_kinds`
  - prompt definition/version joins
- Implement `HookRepository` over `processing_hooks`.
- Implement `TaskRunRepository` over `invoke_task_runs`.
- Map prompt data into `TaskDefinition.prompt`:
  - `systemInstructions` from current prompt `context_config.systemMessage`
  - `userInstructions` from current prompt body/freeform text
  - `structuredOutputSchema` from active output schema
  - `promptVersion` and `promptSnapshotId` from active prompt version metadata
- Map `render_location` to shared `renderSlot`.
- Map `provider_key` to `TaskDefinition.selectedProviderKey`.
- Map `provider_model_override` to `TaskDefinition.modelOverride`.
- Map task kind capability to shared `requiredCapability`.
- Preserve app-owned IDs for API/UI responses, but keep shared runtime operations keyed by stable `taskKey` and `hookKey`.

Acceptance criteria:

- Shared runtime can list task settings, hook state, and task runs from Memo Capture storage.
- Shared runtime can save task settings through Memo Capture repositories without bypassing audit wrappers at the service boundary.
- Prompt/system-message fields round-trip through task settings and shared `PromptConfig`.

### 4. Provider Routing Cleanup

Goal: make registry-backed route fields the only source of truth for new task routing and execution.

Implementation:

- For new and updated task routes, persist:
  - `registry_profile_key`
  - `provider_key`
  - `provider_model_override`
- Stop requiring `provider_config_id` to enable registry-backed task routes.
- Stop joining `provider_configs` for runtime provider kind, provider name, endpoint, model, secret, adapter, or enabled state on new registry-backed execution paths.
- Keep compatibility reads only where needed for old rows during the transition.
- Replace helper behavior that maps registry provider keys back to local provider rows, including provider-name normalization for `local-dev`, `openai-compatible`, `whisper-cpp`, and `codex-cli`.
- Use registry provider metadata for:
  - provider kind
  - adapter key
  - display name
  - model
  - endpoint/base URL
  - enabled state
  - capabilities
  - required secret ref
  - external-send posture
  - health
- Add a later dedicated migration after test coverage is in place to remove:
  - `ai_task_routes.provider_config_id`
  - `provider_capabilities.provider_config_id`
  - obsolete `provider_configs` execution joins
  - obsolete local provider lookup methods used only by registry-backed tasks

Acceptance criteria:

- Creating or updating a registry-backed task does not require a matching local `provider_configs` row.
- Enabling a registry-backed task uses registry provider metadata and shared readiness.
- Existing compatibility data is not destructively removed until a dedicated cleanup migration.

### 5. Adapters And Secrets

Goal: invoke providers through `@invoke-providers/adapters` instead of Memo Capture-local provider classes.

Implementation:

- Construct adapter instances from `@invoke-providers/adapters`:
  - deterministic LLM/JSON/STT/OCR/TTS/module adapters where useful for local tests and demos
  - `OpenAiCompatibleTextAdapter` for cloud and local OpenAI-compatible providers
  - `CodexCliAdapter` for Codex CLI providers
  - `WhisperCppAdapter` for Whisper.cpp transcription providers
  - `AppleVisionOcrAdapter` once Memo Capture has the helper path/runtime support wired
- Keep PaddleOCR disabled until a real adapter is implemented or registered.
- Resolve raw secret values only inside Memo Capture's secret resolver or adapter construction boundary.
- Store and persist secret references only, not raw values.
- Preserve local OpenAI-compatible behavior where local endpoints may use a non-secret placeholder key.
- Preserve Codex CLI binary/model/profile/extra-arg behavior through adapter options instead of local provider code.

Acceptance criteria:

- No work-item task execution path calls Memo Capture's local `createLlmProvider`.
- Provider calls go through shared adapter contracts.
- Adapter diagnostics can optionally call the selected adapter without dispatching Memo Capture domain hooks.
- Missing adapter, missing secret, timeout, non-JSON, empty output, and provider HTTP errors map to shared task-run/error classes or clearly documented app-specific wrappers.

### 6. Readiness, Diagnostics, And Render Slots

Goal: use shared readiness and render-slot derivation everywhere generic provider-task readiness is needed.

Implementation:

- Use shared `getReadinessDiagnostics` for:
  - Settings diagnostics
  - disabled task action buttons
  - provider diagnostic panels
  - API enablement checks
  - work-item action readiness
- Use shared render-slot APIs/helpers for:
  - `work_item_detail`
  - future `work_item_list`
  - future `export_page`
- Keep unavailable task buttons visible but disabled with concrete reasons.
- Preserve UI wording that explains missing registry, missing profile, disabled provider, incompatible capability, missing secret, unimplemented hook, missing adapter, and runtime mismatch.
- Do not rely on UI disabling alone. Server-side invocation and route enablement must enforce readiness.

Acceptance criteria:

- Work-item detail actions and Settings readiness use the same readiness source.
- A task that appears disabled in the UI also skips/no-ops or rejects correctly server-side.
- Readiness tests cover missing registry, missing profile, disabled provider, missing provider, missing secret, incompatible capability, unimplemented hook, missing adapter, and disabled task route.

### 7. Task Invocation

Goal: run provider-backed work-item tasks through shared invocation.

Implementation:

- Refactor `AiExpansionService.runWorkItemTask` to call `TargetAppRuntimeService.invokeTask`.
- Pass work-item context as shared invocation input:
  - work item ID/title/body/tags/contributor
  - source memo ID/source type/transcript
  - project ID/name/description
  - actor/request/correlation metadata
  - processing job ID when created before invocation
- Register Memo Capture host hooks keyed by `hookKey`, initially:
  - `memo-expansion`
  - `suggest-new-memos`
- Let shared invocation handle:
  - readiness resolution
  - provider adapter selection
  - provider invocation
  - structured-output validation where schema is available
  - no-op/skipped runs for unready tasks
  - task-run provenance construction
- Keep Memo Capture hooks responsible for:
  - converting validated provider output to app domain candidates
  - updating processing jobs
  - writing audit records
  - staging expanded memo review content
  - staging ephemeral suggested work items
  - applying accepted changes only after user acceptance
  - preserving workflow behavior outside shared runtime

Acceptance criteria:

- Work-item task execution writes `invoke_task_runs` through the shared task-run repository.
- Provider-backed task failures record provider/task/run provenance consistently.
- Memo expansion and suggested work-item flows still return the current UI response shapes.
- Domain records are not mutated before review/acceptance.

### 8. Prompt And Hook Behavior

Goal: preserve Memo Capture's task-first prompt and hook UX while delegating generic prompt/hook operations where possible.

Implementation:

- Keep task-owned prompt editing in Settings.
- Keep `systemMessage` visible and editable directly under prompt text.
- Use shared `savePromptConfig` where it fits, wrapped by Memo Capture's prompt-version persistence and audit rules.
- Preserve default-system-message restore behavior per hook.
- Use shared hook registry reconciliation for:
  - implementation status
  - usage counts
  - orphan implementations
  - safe deletion
- Keep hook records immutable after creation unless the user explicitly changes that product rule.
- Block hook deletion while any configured task references the hook, whether the task is enabled or disabled.
- Ensure unimplemented hooks no-op and never call providers.

Acceptance criteria:

- Prompt body, system message, output schema, and prompt version metadata still round-trip through Settings.
- Hook status is derived from actual registered app hook implementations, not stale task-row booleans.
- Unimplemented hooks remain visible but disabled/no-op.

### 9. API And Desktop Surfaces

Goal: keep existing Memo Capture API/UI shapes stable where possible while changing the runtime behind them.

Implementation:

- Keep `/api/settings` compatible for the desktop app.
- Continue exposing:
  - `providerCatalog`
  - `providerRegistry`
  - `aiTasks`
  - `registeredTaskHooks`
  - prompt summaries
  - readiness diagnostics
- Preserve task create/update payloads that send `registryProfileKey`, `providerKey`, prompt fields, hook key, render location, display order, and enabled state.
- Keep provider config editing out of Memo Capture.
- Keep Providers page read-only and registry-backed.
- Keep Tasks page task-first.
- Keep Processing Hooks page app-owned.

Acceptance criteria:

- Existing desktop Settings tests pass after API internals change.
- Desktop source contains no reintroduced `providerConfigId` task-routing vocabulary.
- Providers page clearly states provider records are managed outside Memo Capture.

### 10. Documentation, Ledger, And Handoff

Goal: leave durable repo state accurate after implementation.

Implementation:

- Update Memo Capture docs after behavior changes:
  - provider registry is read-only in Memo Capture
  - provider setup happens in the shared registry service
  - task routing/prompt/render configuration belongs to Tasks
  - hooks are app-owned
  - workflow behavior remains outside shared provider runtime
- Update `docs/design/memo-capture-design-learnings.md` only if the implementation changes a durable product decision.
- Append `docs/completed-tasks.md` after the implementation slice is complete and verified.
- Refresh `handoff.md` after verification, including:
  - current commit or dirty-tree status
  - files changed
  - verification run
  - any intentionally deferred compatibility cleanup

Acceptance criteria:

- Documentation matches implemented behavior.
- Ledger entry is append-only and concise.
- Handoff clearly distinguishes completed runtime alignment from deferred schema cleanup.

## Suggested Implementation Order

1. Add shared repository adapters and type mappings while leaving current callers unchanged.
2. Build a shared-runtime factory and make Settings diagnostics/readiness use it.
3. Replace custom registry fetch/profile behavior with shared registry client/profile support.
4. Move render-slot action derivation to shared runtime.
5. Move task create/update/provider selection through shared task repository/runtime helpers where possible.
6. Register shared adapters and secret resolver.
7. Move `runWorkItemTask` invocation through shared `invokeTask`.
8. Remove local LLM provider execution from provider-backed task paths.
9. Stop writing or requiring `provider_config_id` for new registry-backed task paths.
10. Add tests for registry-only execution and compatibility behavior.
11. Run full verification.
12. Update docs, completed-task ledger, and handoff.
13. Plan the follow-up schema cleanup migration for legacy provider columns.

## Test Plan

Run these checks for the main implementation:

```bash
npm run typecheck
npm test
npm run verify
```

Run this for repository, migration, and schema cleanup work:

```bash
npm run test:postgres
```

Rebuild the native app after user-facing Settings or action-surface changes:

```bash
npm run tauri:build -w @memo-capture/desktop -- --bundles app
```

Add or update focused tests proving:

- Settings provider dropdown reads registry providers only.
- Task create/update does not require `providerConfigId`.
- Registry-backed task execution does not require local `provider_configs` shadow rows.
- Missing registry produces a blocking readiness diagnostic.
- Missing saved profile is retained and blocks readiness.
- Disabled provider blocks readiness.
- Missing provider blocks readiness.
- Missing secret blocks readiness.
- Incompatible capability blocks readiness.
- Unimplemented hook blocks readiness and does not call a provider.
- Missing adapter blocks readiness or adapter diagnostics.
- Work-item task execution uses shared invocation and records `invoke_task_runs`.
- Provider adapters are invoked through `@invoke-providers/adapters`.
- Memo expansion and suggested work-item outputs still validate and return current desktop response shapes.
- Domain mutation still happens only after explicit user acceptance.
- Prompt body and `systemMessage` round-trip through task settings.
- Hook deletion remains blocked while any configured task references the hook.

## Deferred Cleanup

Do not remove compatibility columns in the first runtime-alignment slice unless the implementation specifically targets schema cleanup.

After registry-backed task execution is fully covered, create a dedicated follow-up migration and code cleanup for:

- `ai_task_routes.provider_config_id`
- `provider_capabilities.provider_config_id`
- provider-config joins in task-route reads
- local provider lookup helpers used only by registry-backed routing
- historical tests that seed local provider rows solely for task execution

That cleanup must include `npm run test:postgres`.

## Assumptions

- Memo Capture remains in Build Mode.
- No release, tag, publish, dependency publication, or DMG creation is in scope.
- The shared provider registry service runs separately, typically at `127.0.0.1:5181`.
- `INVOKE_PROVIDERS_REGISTRY_URL` supplies the registry URL.
- `INVOKE_PROVIDERS_PROFILE` supplies only a bootstrap default profile.
- Saved selected provider profile remains Memo Capture-owned state.
- Raw secrets remain outside registry records, Memo Capture DB records, docs, manifests, and task-run records.
- The first implementation preserves compatibility columns until a deliberate cleanup migration is done.
- Memo Capture hooks remain app-owned and are the only place provider output can become domain behavior.
