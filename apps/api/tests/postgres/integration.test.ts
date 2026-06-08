import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createPgDatabase } from "../../src/db/postgres.js";
import type { Logger } from "../../src/logger.js";
import { AuditRepository } from "../../src/repositories/audit.js";
import { ProcessingJobRepository } from "../../src/repositories/jobs.js";
import { WorkItemArtifactRepository } from "../../src/repositories/photo-imports.js";
import { UserRepository } from "../../src/repositories/users.js";
import { WorkItemRepository } from "../../src/repositories/work-items.js";
import { WorkflowRepository } from "../../src/repositories/workflows.js";
import { WorkflowService } from "../../src/services/workflows.js";
import { hashBundle } from "../../src/services/workflow-runtime.js";

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

test("processing hook registry is migrated, seeded, and counts task usage in real Postgres", async () => {
  const db = createPgDatabase(requireTestDatabaseUrl(), silentLogger);

  try {
    const seeded = await db.query<{ hook_key: string }>(
      `select hook_key
       from processing_hooks
       where hook_key in ('memo-expansion', 'revise-memo', 'suggest-new-memos', 'suggest-tags')
       order by hook_key`
    );
    assert.deepEqual(
      seeded.rows.map((row) => row.hook_key),
      ["memo-expansion", "revise-memo", "suggest-new-memos", "suggest-tags"]
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
         '10000000-0000-4000-8000-000000000301',
         'postgres-hook-usage',
         'Postgres hook usage',
         'Verifies hook usage counts.',
         'memo-expansion',
         'llm',
         (select id from task_kinds where kind_key = 'llm' limit 1),
         null,
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
       set hook_key = excluded.hook_key`
    );

    const usage = await db.query<{ hook_key: string; task_usage_count: number }>(
      `select
         processing_hooks.hook_key,
         count(ai_task_definitions.id)::int as task_usage_count
       from processing_hooks
       left join ai_task_definitions on ai_task_definitions.hook_key = processing_hooks.hook_key
       where processing_hooks.hook_key = 'memo-expansion'
       group by processing_hooks.hook_key`
    );
    assert.equal(usage.rows[0]?.hook_key, "memo-expansion");
    assert.ok(Number(usage.rows[0]?.task_usage_count ?? 0) >= 1);

    await db.query(
      `insert into processing_hooks (hook_key)
       values ('postgres-unused-hook')
       on conflict (hook_key) do nothing`
    );
    const deleted = await db.query<{ hook_key: string }>(
      `delete from processing_hooks
       where hook_key = 'postgres-unused-hook'
       returning hook_key`
    );
    assert.equal(deleted.rows[0]?.hook_key, "postgres-unused-hook");
  } finally {
    await db.close();
  }
});

test("photo import schema seeds active image intake and accepts photo rows", async () => {
  const db = createPgDatabase(requireTestDatabaseUrl(), silentLogger);
  const userId = "10000000-0000-4000-8000-000000000501";
  const artifactId = "10000000-0000-4000-8000-000000000502";
  const sourceMemoId = "10000000-0000-4000-8000-000000000503";
  const photoImportId = "10000000-0000-4000-8000-000000000504";

  try {
    const imageSettings = await db.query<{
      extension: string;
      media_kind: string;
      capability_state: string;
      parser_key: string | null;
    }>(
      `select extension, media_kind, capability_state, parser_key
       from file_type_settings
       where extension in ('.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif')
       order by extension`
    );
    assert.deepEqual(
      imageSettings.rows.map((row) => [row.extension, row.media_kind, row.capability_state, row.parser_key]),
      [
        [".heic", "image", "active", "photo-preprocess"],
        [".heif", "image", "active", "photo-preprocess"],
        [".jpeg", "image", "active", "photo-preprocess"],
        [".jpg", "image", "active", "photo-preprocess"],
        [".png", "image", "active", "photo-preprocess"],
        [".webp", "image", "active", "photo-preprocess"]
      ]
    );

    await db.query(
      `insert into app_users (id, oidc_issuer, oidc_subject, first_seen_at, last_seen_at)
       values ($1, 'test', 'photo-user', now(), now())`,
      [userId]
    );
    await db.query(
      `insert into import_upload_sessions (
         id,
         status,
         machine_id,
         watch_folder_id,
         source_type,
         original_filename,
         original_path,
         original_file_modified_at,
         mime_type,
         byte_size,
         content_hash,
         created_by
       )
       values (
         '10000000-0000-4000-8000-000000000505',
         'duplicate_exact',
         'machine-photo',
         'watch-photo',
         'watched_photo_file',
         'photo.jpg',
         '/incoming/photo.jpg',
         now(),
         'image/jpeg',
         12,
         'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
         $1
       )`,
      [userId]
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
       values ($1, 'postgres-photo/original.jpg', 'original.jpg', 'image/jpeg', 12, 'photo-hash', 'original_photo_file', 'memo-capture')`,
      [artifactId]
    );
    await db.query(
      `insert into source_memos (
         id,
         source_type,
         primary_artifact_id,
         content_hash,
         updated_at
       )
       values ($1, 'watched_photo_file', $2, 'photo-hash', now())`,
      [sourceMemoId, artifactId]
    );
    await db.query(
      `insert into photo_imports (
         id,
         source_memo_id,
         original_artifact_id,
         status,
         original_filename,
         content_hash,
         created_by
       )
       values ($1, $2, $3, 'available', 'original.jpg', 'photo-hash', $4)`,
      [photoImportId, sourceMemoId, artifactId, userId]
    );

    const visible = await db.query<{ id: string; status: string }>(
      `select id, status
       from photo_imports
       where status in ('available', 'preprocessing', 'preprocessing_failed')`
    );
    assert.equal(visible.rows.some((row) => row.id === photoImportId && row.status === "available"), true);
  } finally {
    await db.close();
  }
});

test("work item photo attachments are counted and listed in real Postgres", async () => {
  const db = createPgDatabase(requireTestDatabaseUrl(), silentLogger);
  const userId = "10000000-0000-4000-8000-000000000601";
  const projectId = "10000000-0000-4000-8000-000000000602";
  const sourceMemoId = "10000000-0000-4000-8000-000000000603";
  const workItemId = "10000000-0000-4000-8000-000000000604";
  const originalArtifactId = "10000000-0000-4000-8000-000000000605";
  const thumbnailArtifactId = "10000000-0000-4000-8000-000000000606";
  const nonPhotoArtifactId = "10000000-0000-4000-8000-000000000607";
  const photoImportId = "10000000-0000-4000-8000-000000000608";

  try {
    await db.query(
      `insert into app_users (id, oidc_issuer, oidc_subject, first_seen_at, last_seen_at)
       values ($1, 'test', 'photo-attachment-user', now(), now())`,
      [userId]
    );
    await db.query(
      `insert into projects (id, name, slug)
       values ($1, 'Postgres Photo Attachments', 'postgres-photo-attachments')`,
      [projectId]
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
       values
         ($1, 'postgres-photo-attachments/original.jpg', 'original.jpg', 'image/jpeg', 42, 'photo-attachment-original', 'original_photo_file', 'memo-capture'),
         ($2, 'postgres-photo-attachments/thumb.jpg', 'thumb.jpg', 'image/jpeg', 12, 'photo-attachment-thumb', 'derived_photo_thumbnail', 'memo-capture'),
         ($3, 'postgres-photo-attachments/audio.m4a', 'audio.m4a', 'audio/mp4', 9, 'photo-attachment-audio', 'original_audio_file', 'memo-capture')`,
      [originalArtifactId, thumbnailArtifactId, nonPhotoArtifactId]
    );
    await db.query(
      `insert into source_memos (
         id,
         source_type,
         primary_artifact_id,
         content_hash,
         updated_at
       )
       values ($1, 'form', $2, 'photo-attachment-source', now())`,
      [sourceMemoId, originalArtifactId]
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
       values ($1, $2, $3, 'Postgres photo memo', 'Body', 'memo')`,
      [workItemId, sourceMemoId, projectId]
    );
    await db.query(
      `insert into photo_imports (
         id,
         source_memo_id,
         original_artifact_id,
         thumbnail_artifact_id,
         status,
         original_filename,
         content_hash,
         captured_at,
         camera_make,
         camera_model,
         created_by
       )
       values ($1, $2, $3, $4, 'attached', 'camera-original.jpg', 'photo-attachment-original', '2026-05-28T08:30:00Z', 'Nikon', 'Z8', $5)`,
      [photoImportId, sourceMemoId, originalArtifactId, thumbnailArtifactId, userId]
    );
    await db.query(
      `insert into work_item_artifacts (work_item_id, artifact_id, relationship)
       values
         ($1, $2, 'photo_attachment'),
         ($1, $3, 'source_audio')`,
      [workItemId, originalArtifactId, nonPhotoArtifactId]
    );

    const workItem = await new WorkItemRepository(db).findById(workItemId);
    assert.equal(workItem?.photoAttachmentCount, 1);

    const photos = await new WorkItemArtifactRepository(db).listPhotoAttachments(workItemId);
    assert.deepEqual(photos, [
      {
        originalArtifactId,
        thumbnailArtifactId,
        originalFilename: "camera-original.jpg",
        mimeType: "image/jpeg",
        byteSize: 42,
        capturedAt: "2026-05-28T08:30:00.000Z",
        cameraMake: "Nikon",
        cameraModel: "Z8"
      }
    ]);
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

test("workflow accept action creates accepted snapshot in real Postgres", async () => {
  const db = createPgDatabase(requireTestDatabaseUrl(), silentLogger);
  const actor = await new UserRepository(db).upsertFromIdentity({
    oidcIssuer: "memo-capture-test",
    oidcSubject: "accept-action-user",
    email: "accept-action@example.invalid",
    displayName: "Accept Action User"
  });
  const projectId = "10000000-0000-4000-8000-000000000501";
  const sourceMemoId = "10000000-0000-4000-8000-000000000502";
  const workItemId = "10000000-0000-4000-8000-000000000503";
  const workflowBundle = JSON.parse(
    readFileSync(
      new URL("../../../../docs/design/memo-capture-0.2.5-workflow-definition-bundled.json", import.meta.url),
      "utf8"
    )
  ) as Record<string, unknown>;

  try {
    await new WorkflowRepository(db).replaceActive({
      workflowId: "memo-capture_workflow",
      workflowVersion: "0.2.5",
      stateMachineVersion: "0.2.5",
      contentHash: hashBundle(workflowBundle),
      requiredAppCapabilities: ["create_accepted_snapshot"],
      bundle: workflowBundle,
      activatedBy: actor.id
    });
    await db.query(
      `insert into projects (id, name, slug)
       values ($1, $2, $3)`,
      [projectId, "Postgres Accept Project", "postgres-accept-project"]
    );
    await db.query(
      `insert into source_memos (
         id,
         source_type,
         original_text,
         extracted_text,
         content_hash,
         created_by,
         updated_at
       )
       values ($1, $2, $3, $3, $4, $5, now())`,
      [sourceMemoId, "form", "Accept this memo.", "postgres-accept-content-hash", actor.id]
    );
    await db.query(
      `insert into work_items (
         id,
         source_memo_id,
         project_id,
         title,
         body,
         body_format,
         workflow_state,
         workflow_item_version,
         accepted_unexported_changes,
         created_by,
         updated_by
       )
       values ($1, $2, $3, $4, $5, 'markdown', 'memo', 1, false, $6, $6)`,
      [workItemId, sourceMemoId, projectId, "Acceptable memo", "Ready to accept.", actor.id]
    );

    const result = await new WorkflowService(db, "local-dev").executeAction(
      workItemId,
      "memo.accepted",
      { expectedVersion: 1 },
      actor,
      "postgres-accept-action"
    );

    assert.equal(result.newState, "accepted");
    assert.notEqual(result.createdSnapshotId, null);

    const accepted = await db.query<{
      workflow_state: string;
      accepted_snapshot_id: string | null;
      snapshot_count: number;
    }>(
      `select
         work_items.workflow_state,
         work_items.accepted_snapshot_id,
         count(accepted_snapshots.id)::int as snapshot_count
       from work_items
       left join accepted_snapshots on accepted_snapshots.work_item_id = work_items.id
       where work_items.id = $1
       group by work_items.id`,
      [workItemId]
    );

    assert.equal(accepted.rows[0]?.workflow_state, "accepted");
    assert.equal(accepted.rows[0]?.accepted_snapshot_id, result.createdSnapshotId);
    assert.equal(accepted.rows[0]?.snapshot_count, 1);
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
         jsonb_build_object(
           'freeformText', 'Return strict JSON.',
           'systemMessage', 'Return only strict JSON matching this shape: { "expanded_work_item": { "title": "string", "body": "string", "tags": ["string"] } }. Do not include prose outside JSON.',
           'includeProjectSynopsis', true,
           'includeMemoMetadata', true,
           'includeMemoTranscriptText', true
         )
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
