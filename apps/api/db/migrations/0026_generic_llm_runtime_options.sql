-- Normalize AI task runtime metadata to the generic LLM runtime selected by AppLauncher.
-- Task identity and hook routing remain Memo Capture-owned and are intentionally preserved.

update ai_task_definitions
set
  runtime_option_id = 'llm-runtime',
  runtime_option_purpose = 'llm-runtime',
  runtime_provider_env = 'LLM_PROVIDER',
  runtime_model_env = 'LLM_MODEL',
  runtime_endpoint_env = 'LLM_ENDPOINT',
  updated_at = now()
where lower(task_kind) = 'llm';
