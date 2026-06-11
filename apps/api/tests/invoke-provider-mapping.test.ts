import test from "node:test";
import assert from "node:assert/strict";
import { mapTaskRouteRow } from "../src/services/invoke-providers/mapping.js";

test("task route mapping preserves the shared local-dev registry key without a legacy provider join", () => {
  const mapped = mapTaskRouteRow({
    id: "task-1",
    task_key: "memo-expansion",
    display_name: "Memo expansion",
    description: "Expand a memo.",
    hook_key: "memo-expansion",
    render_location: "work_item_detail",
    display_order: 0,
    task_kind: "llm",
    task_kind_id: "task-kind-llm",
    task_kind_display_name: "LLM generation",
    task_kind_description: "Structured generation",
    task_kind_provider_kind: "llm",
    task_kind_capability_key: "structured-generation",
    prompt_fields_enabled: true,
    implemented: true,
    default_provider_name: "local-dev",
    default_model_name: "memo-capture-local-dev-expander-v1",
    runtime_option_id: "llm-runtime",
    runtime_option_purpose: "llm-runtime",
    runtime_provider_env: "LLM_PROVIDER",
    runtime_model_env: "LLM_MODEL",
    runtime_endpoint_env: "LLM_ENDPOINT",
    route_enabled: true,
    route_model_name: null,
    registry_profile_key: "local-dev",
    provider_key: "local-dev",
    provider_model_override: null,
    provider_config_id: null,
    provider_kind: null,
    provider_name: null,
    provider_display_name: null,
    adapter_key: null,
    provider_enabled: null,
    provider_model_name: null,
    endpoint: null,
    secret_source: null,
    required_secret_env: null,
    external_send_enabled: null,
    health_status: null,
    prompt_definition_id: null,
    prompt_name: null,
    prompt_purpose: null,
    prompt_active_version: null,
    active_prompt_version_id: null,
    active_body: null,
    active_output_schema: null,
    active_context_config: null,
    prompt_retention_policy: null,
    updated_at: "2026-06-11T00:00:00.000Z"
  });

  assert.equal(mapped.selectedProviderKey, "deterministic-local-dev");
});
