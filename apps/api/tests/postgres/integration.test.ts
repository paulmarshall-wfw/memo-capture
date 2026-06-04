import assert from "node:assert/strict";
import test from "node:test";
import { createPgDatabase } from "../../src/db/postgres.js";
import type { Logger } from "../../src/logger.js";
import { AuditRepository } from "../../src/repositories/audit.js";
import { ProcessingJobRepository } from "../../src/repositories/jobs.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

function requireTestDatabaseUrl(): string {
  assert.match(
    databaseUrl,
    /\/memo_capture_test(?:\?|$)/,
    "Postgres integration tests must run against memo_capture_test, not the development database."
  );
  return databaseUrl;
}

test("Postgres integration database is the isolated migrated test database", async () => {
  const db = createPgDatabase(requireTestDatabaseUrl(), silentLogger);
  try {
    const result = await db.query<{
      current_database: string;
      migration_count: string;
      latest_migration: string;
    }>(
      `select
         current_database() as current_database,
         count(*)::text as migration_count,
         max(version) as latest_migration
       from schema_migrations`
    );

    assert.equal(result.rows[0]?.current_database, "memo_capture_test");
    assert.ok(Number(result.rows[0]?.migration_count ?? "0") > 0);
    assert.match(result.rows[0]?.latest_migration ?? "", /^\d{4}_.+/);
  } finally {
    await db.close();
  }
});

test("processing job repository uses real Postgres claim and rollback behavior", async () => {
  const db = createPgDatabase(requireTestDatabaseUrl(), silentLogger);
  const jobs = new ProcessingJobRepository(db);

  try {
    const queued = await jobs.create({
      jobKind: "generate_keywords",
      maxAttempts: 2,
      initiatedBy: null
    });

    const claimed = await jobs.claimNext({
      workerId: "postgres-integration-worker",
      jobKinds: ["generate_keywords"],
      leaseSeconds: 30
    });

    assert.equal(claimed?.id, queued.id);
    assert.equal(claimed?.jobKind, "generate_keywords");

    await assert.rejects(
      db.transaction(async (client) => {
        await new ProcessingJobRepository(client).create({
          jobKind: "expand_work_item",
          initiatedBy: null
        });
        throw new Error("force rollback");
      }),
      /force rollback/
    );

    const rolledBackJobs = await jobs.list({
      jobKind: "expand_work_item",
      limit: 10
    });
    assert.equal(rolledBackJobs.length, 0);
  } finally {
    await db.close();
  }
});

test("audit repository lists events with display context in real Postgres", async () => {
  const db = createPgDatabase(requireTestDatabaseUrl(), silentLogger);
  const audit = new AuditRepository(db);
  const projectId = "10000000-0000-4000-8000-000000000001";
  const artifactId = "10000000-0000-4000-8000-000000000002";
  const sourceMemoId = "10000000-0000-4000-8000-000000000003";
  const workItemId = "10000000-0000-4000-8000-000000000004";

  try {
    await db.query(
      `insert into projects (id, name, slug)
       values ($1, $2, $3)`,
      [projectId, "Postgres Audit Project", "postgres-audit-project"]
    );
    await db.query(
      `insert into artifacts (
         id,
         object_key,
         original_filename,
         mime_type,
         byte_size,
         content_hash,
         artifact_kind,
         bucket
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        artifactId,
        "postgres-audit/source.md",
        "postgres-source.md",
        "text/markdown",
        42,
        "postgres-audit-content-hash",
        "original_text_file",
        "memo-capture"
      ]
    );
    await db.query(
      `insert into source_memos (
         id,
         source_type,
         primary_artifact_id,
         content_hash,
         original_path,
         updated_at
       )
       values ($1, $2, $3, $4, $5, now())`,
      [
        sourceMemoId,
        "watched_folder_text",
        artifactId,
        "postgres-source-memo-content-hash",
        "/incoming/postgres-source.md"
      ]
    );
    await db.query(
      `insert into work_items (
         id,
         source_memo_id,
         project_id,
         title,
         body,
         workflow_state
       )
       values ($1, $2, $3, $4, $5, $6)`,
      [workItemId, sourceMemoId, projectId, "Postgres source memo", "Body", "memo"]
    );

    await audit.record({
      eventName: "work_item.workflow_action_executed",
      actor: null,
      subjectType: "work_item",
      subjectId: workItemId,
      requestId: "postgres-audit-request",
      workItemId,
      metadata: { actionId: "review.memo" }
    });

    const [event] = await audit.list({
      eventName: "work_item.workflow_action_executed",
      subjectId: workItemId,
      limit: 1
    });

    assert.equal(event?.eventName, "work_item.workflow_action_executed");
    assert.equal(event?.display.title, "Postgres source memo");
    assert.equal(event?.display.originalFilename, "postgres-source.md");
    assert.equal(event?.display.originalPath, "/incoming/postgres-source.md");
    assert.equal(event?.display.projectName, "Postgres Audit Project");
  } finally {
    await db.close();
  }
});

test("settings schema supports multiple provider instances and task-owned prompt preservation", async () => {
  const db = createPgDatabase(requireTestDatabaseUrl(), silentLogger);
  const providerId = "10000000-0000-4000-8000-000000000101";

  try {
    await db.query(
      `insert into provider_configs (
         id,
         provider_kind,
         provider_name,
         display_name,
         adapter_key,
         enabled,
         endpoint,
         model_name,
         secret_source,
         required_secret_env,
         external_send_enabled,
         health_status
       )
       values ($1, 'llm', 'local-dev-shadow', 'Local development shadow', 'local-dev', false, null,
               'memo-capture-local-dev-expander-v1', 'environment', null, false, 'unknown')
       on conflict (provider_kind, provider_name) do nothing`,
      [providerId]
    );
    await db.query(
      `insert into provider_capabilities (id, provider_config_id, capability_key, enabled)
       values ($1, $2, 'structured-generation', true)
       on conflict (provider_config_id, capability_key) do nothing`,
      ["10000000-0000-4000-8000-000000000102", providerId]
    );

    const providers = await db.query<{ provider_count: string }>(
      `select count(*)::text as provider_count
       from provider_configs
       join provider_capabilities on provider_capabilities.provider_config_id = provider_configs.id
       where provider_configs.provider_kind = 'llm'
         and provider_capabilities.capability_key = 'structured-generation'`
    );
    assert.ok(Number(providers.rows[0]?.provider_count ?? "0") >= 2);

    await db.query(
      `insert into prompt_definitions (id, name, purpose, active_version, retention_policy)
       values (
         '10000000-0000-4000-8000-000000000201',
         'task_expand_memo',
         'Prompt for Expand memo.',
         1,
         'retain_active_and_referenced'
       )
       on conflict (id) do nothing`
    );
    await db.query(
      `insert into prompt_versions (id, prompt_definition_id, version, body, output_schema, context_config)
       values (
         '10000000-0000-4000-8000-000000000202',
         '10000000-0000-4000-8000-000000000201',
         1,
         'Return strict JSON.',
         '{}'::jsonb,
         '{"freeformText":"Return strict JSON.","includeProjectSynopsis":true,"includeMemoMetadata":true,"includeMemoTranscriptText":true}'::jsonb
       )
       on conflict (prompt_definition_id, version) do nothing`
    );
    await db.query(
      `insert into ai_task_definitions (
         id,
         task_key,
         display_name,
         description,
         hook_key,
         task_kind,
         task_kind_id,
         prompt_definition_id,
         implemented,
         default_provider_name,
         default_model_name,
         runtime_option_id,
         runtime_option_purpose,
         runtime_provider_env,
         runtime_model_env,
         runtime_endpoint_env
       )
       values (
         '10000000-0000-4000-8000-000000000203',
         'expand-memo',
         'Expand memo',
         'Expand one memo.',
         'memo-expansion',
         'llm',
         (select id from task_kinds where kind_key = 'llm' limit 1),
         '10000000-0000-4000-8000-000000000201',
         true,
         'local-dev',
         'memo-capture-local-dev-expander-v1',
         'llm-runtime',
         'llm-runtime',
         'LLM_PROVIDER',
         'LLM_MODEL',
         'LLM_ENDPOINT'
       )
       on conflict (task_key) do update
       set
         hook_key = excluded.hook_key,
         prompt_definition_id = excluded.prompt_definition_id,
         runtime_option_id = excluded.runtime_option_id,
         runtime_provider_env = excluded.runtime_provider_env,
         runtime_model_env = excluded.runtime_model_env,
         runtime_endpoint_env = excluded.runtime_endpoint_env`
    );

    const promptLink = await db.query<{
      task_key: string;
      hook_key: string;
      prompt_name: string;
      active_version: number;
      version_count: string;
      runtime_option_id: string;
      runtime_provider_env: string;
    }>(
      `select
         ai_task_definitions.task_key,
         ai_task_definitions.hook_key,
         prompt_definitions.name as prompt_name,
         prompt_definitions.active_version,
         count(prompt_versions.id)::text as version_count,
         ai_task_definitions.runtime_option_id,
         ai_task_definitions.runtime_provider_env
       from ai_task_definitions
       join prompt_definitions on prompt_definitions.id = ai_task_definitions.prompt_definition_id
       join prompt_versions on prompt_versions.prompt_definition_id = prompt_definitions.id
       where ai_task_definitions.task_key = 'expand-memo'
       group by ai_task_definitions.task_key, ai_task_definitions.hook_key, prompt_definitions.name,
                prompt_definitions.active_version, ai_task_definitions.runtime_option_id,
                ai_task_definitions.runtime_provider_env`
    );

    assert.equal(promptLink.rows[0]?.hook_key, "memo-expansion");
    assert.equal(promptLink.rows[0]?.prompt_name, "task_expand_memo");
    assert.equal(promptLink.rows[0]?.active_version, 1);
    assert.ok(Number(promptLink.rows[0]?.version_count ?? "0") >= 1);
    assert.equal(promptLink.rows[0]?.runtime_option_id, "llm-runtime");
    assert.equal(promptLink.rows[0]?.runtime_provider_env, "LLM_PROVIDER");
  } finally {
    await db.close();
  }
});
