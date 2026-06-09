# AppLauncher Provider Decoupling Plan

## Summary

Memo Capture already uses the shared `@invoke-providers/*` runtime for provider-backed task invocation. The remaining work is to remove Memo Capture’s provider configuration dependency on AppLauncher.

After this change, AppLauncher launches Memo Capture only. It does not expose provider slots, provider registry settings, LLM runtime options, provider secrets, or model selectors for Memo Capture. Memo Capture continues to use the shared provider registry directly through its own API/runtime configuration and Settings UI.

## Key Changes

- Replace Memo Capture AppLauncher manifests with launch-only manifests.
  - Remove `providerSlots` from the generated web and native `1.0.0` manifests.
  - Do not add `providerRegistry` or `runtimeOptions`.
  - Keep only app identity, launch command, working directory, storage metadata, and ordinary launch requirements.
  - Update the desktop manifest test to assert no `providerSlots`, `providerRegistry`, `runtimeOptions`, `LLM_PROVIDER`, `LLM_MODEL`, or `LLM_ENDPOINT`.

- Make `LLM_PROVIDER` legacy-only inside Memo Capture.
  - Stop using `LLM_PROVIDER` as the readiness gate for registry-selected OpenAI-compatible providers.
  - Update OpenAI-compatible adapter diagnostics to use registry provider metadata, adapter availability, endpoint, and secret readiness.
  - Keep `LLM_MODEL` and `LLM_ENDPOINT` only as Memo Capture runtime fallback/default env where still needed, not as AppLauncher inputs.

- Remove stale AppLauncher provider wording.
  - Update `docs/env.md` so provider setup is described as Memo Capture/shared-registry configuration, not AppLauncher configuration.
  - Update desktop/API copy such as “Relaunch from AppLauncher if runtime options changed” to “restart Memo Capture/API if runtime environment changed.”
  - Update design docs only where they still claim AppLauncher owns provider/runtime options.

- Preserve Memo Capture-owned provider registry behavior.
  - Keep `providerRegistry`, `providerCatalog`, registry profile selection, and registry readiness in Memo Capture Settings/API.
  - Keep `INVOKE_PROVIDERS_REGISTRY_URL` and `INVOKE_PROVIDERS_PROFILE` as Memo Capture/shared-runtime configuration.
  - Do not move provider profile selection back into AppLauncher.

- Leave schema cleanup separate.
  - Do not remove `provider_config_id`, `provider_capabilities`, or historical compatibility joins in this slice.
  - Keep that for a later Postgres migration with `npm run test:postgres`.

## Test Plan

- Update and run focused tests:
  - Manifest tests prove Memo Capture manifests are provider-blind.
  - Adapter/readiness tests prove registry-selected OpenAI-compatible providers do not require `LLM_PROVIDER=openai-compatible`.
  - Existing task execution tests prove `expand memo` and `suggest memos` still invoke through the shared runtime.

- Run standard verification:
  - `npm run typecheck`
  - `npm test`
  - `npm run verify`

- If desktop copy changes are included:
  - `npm run tauri:build -w @memo-capture/desktop -- --bundles app`

## Assumptions

- AppLauncher should have no provider-aware contract for Memo Capture, including no generic `providerRegistry` manifest declaration.
- Memo Capture continues to consume the shared provider registry directly.
- Provider setup remains outside AppLauncher and outside Memo Capture manifests.
- Raw provider secrets remain out of docs, manifests, database records, and task-run records.
- No release, tag, publish, DMG creation, or AppLauncher repo change is part of this Memo Capture slice.
