import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readApiConfig } from "../src/config.js";
import type { Database, Queryable, QueryParams, QueryResult } from "../src/db/types.js";
import { createLogger } from "../src/logger.js";
import type { AiSuggestionRecord } from "../src/repositories/ai-suggestions.js";
import type { AppServices } from "../src/services/app.js";
import { createAppServicesFromDatabase } from "../src/services/app.js";
import { HttpError } from "../src/services/errors.js";
import { countIncompatibleActiveWorkflowDependentJobs } from "../src/services/workflows.js";
import { createApiServer } from "../src/server.js";
import { WorkItemRepository } from "../src/repositories/work-items.js";
import { WorkflowRepository } from "../src/repositories/workflows.js";
import { AuditRepository } from "../src/repositories/audit.js";
import { ObjectStorageService } from "../src/services/object-storage.js";
import { TranscriptionService } from "../src/services/transcription.js";
import { KeywordService } from "../src/services/keywords.js";

const originalFileModifiedAt = "2026-05-28T23:45:00.000Z";
const testNominateTagsIntervalMs = 123456;

test("local-dev auth creates a fixed development session when explicitly enabled", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_EMAIL: "dev@example.test",
    MEMO_CAPTURE_APP_VERSION: "0.1.0",
    MEMO_CAPTURE_COMMIT_SHA: "test-sha"
  });
  const db = new FakeDatabase();
  seedActiveClassifyWorkflow(db);
  const services = createAppServicesFromDatabase(config, db);

  const session = await services.auth.createLocalDevSession();

  assert.equal(session.authMode, "local-dev");
  assert.equal(session.user.email, "dev@example.test");
  assert.equal(session.accessToken, "local-dev:memo-capture-local-dev:local-dev-user");
  assert.equal(db.users.length, 1);
});

test("settings summary separates provider catalog from task-owned prompts and capabilities", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    LLM_PROVIDER: "local-dev"
  });
  const db = new FakeDatabase();
  seedTaskSettings(db);
  const services = createAppServicesFromDatabase(config, db);

  const summary = (await services.settings.getSummary()) as {
    providers: Array<{ providerName: string; capabilities: Array<{ capabilityKey: string }> }>;
    taskKinds: Array<{ kindKey: string; capabilityKey: string; promptFieldsEnabled: boolean }>;
    aiTasks: Array<{ taskKey: string; prompt: { name: string } | null; runtimeReady: boolean }>;
    registeredTaskHooks: Array<{ hookKey: string }>;
  };

  assert.equal(summary.providers[0]?.providerName, "local-dev");
  assert.deepEqual(summary.providers[0]?.capabilities.map((capability) => capability.capabilityKey), [
    "structured-generation"
  ]);
  assert.equal(summary.taskKinds.find((kind) => kind.kindKey === "llm")?.promptFieldsEnabled, true);
  assert.equal(summary.aiTasks.find((task) => task.taskKey === "memo-expansion")?.prompt?.name, "work_item_expansion");
  assert.equal(summary.aiTasks.find((task) => task.taskKey === "memo-expansion")?.runtimeReady, true);
  assert.deepEqual(summary.registeredTaskHooks.map((hook) => hook.hookKey), [
    "memo-expansion",
    "revise-memo",
    "suggest-new-memos",
    "suggest-tags"
  ]);
});

test("AI task creation derives task key and reports duplicate derived key conflicts", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  seedTaskSettings(db);
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  const created = (await services.settings.createAiTaskDefinition(
    {
      displayName: "Custom Digest",
      hookKey: "custom-digest",
      taskKind: "llm",
      promptsEnabled: true,
      initialPromptText: "Summarize this memo as strict JSON.",
      includeProjectSynopsis: false,
      includeMemoMetadata: true,
      includeMemoTranscriptText: false
    },
    session.user,
    "request-create-task"
  )) as { aiTask: { taskKey: string; hookImplemented: boolean; routeEnabled: boolean; prompt: { id: string } } };

  assert.equal(created.aiTask.taskKey, "custom-digest");
  assert.equal(created.aiTask.hookImplemented, false);
  assert.equal(created.aiTask.routeEnabled, false);
  assert.equal(typeof created.aiTask.prompt.id, "string");
  const createdPromptVersion = db.promptVersions.find(
    (row) => row.prompt_definition_id === created.aiTask.prompt.id
  );
  assert.deepEqual(createdPromptVersion?.context_config, {
    freeformText: "Summarize this memo as strict JSON.",
    includeProjectSynopsis: false,
    includeMemoMetadata: true,
    includeMemoTranscriptText: false
  });

  await assert.rejects(
    () =>
      services.settings.createAiTaskDefinition(
        {
          displayName: "Custom   Digest",
          hookKey: "custom-digest-again",
          taskKind: "llm"
        },
        session.user,
        "request-create-task-duplicate"
      ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === "ai_task_exists" &&
      (error.details as { taskKey?: string } | undefined)?.taskKey === "custom-digest"
  );
});

test("settings allow additional task kinds and task definitions can use them", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  seedTaskSettings(db);
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  const created = (await services.settings.createTaskKind(
    {
      displayName: "Image enrichment",
      description: "Image analysis tasks",
      providerKind: "llm",
      capabilityKey: "structured-generation",
      promptFieldsEnabled: true,
      enabled: false
    },
    session.user,
    "request-create-task-kind"
  )) as { taskKind: { kindKey: string; promptFieldsEnabled: boolean; enabled: boolean } };

  assert.equal(created.taskKind.kindKey, "image-enrichment");
  assert.equal(created.taskKind.promptFieldsEnabled, true);
  assert.equal(created.taskKind.enabled, false);

  const taskKindRow = db.taskKinds.find((row) => row.kind_key === "image-enrichment");
  assert.notEqual(taskKindRow, undefined);

  const updated = (await services.settings.updateTaskKind(
    String(taskKindRow!.id),
    {
      displayName: "Image enrichment",
      description: "Image enrichment and analysis tasks",
      providerKind: "llm",
      capabilityKey: "structured-generation",
      promptFieldsEnabled: true,
      enabled: false
    },
    session.user,
    "request-update-task-kind"
  )) as { taskKind: { kindKey: string; description: string; enabled: boolean } };

  assert.equal(updated.taskKind.kindKey, "image-enrichment");
  assert.equal(updated.taskKind.description, "Image enrichment and analysis tasks");
  assert.equal(updated.taskKind.enabled, false);

  await assert.rejects(
    () =>
      services.settings.updateTaskKind(
        String(taskKindRow!.id),
        { enabled: true },
        session.user,
        "request-enable-task-kind"
      ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === "task_kind_route_not_implemented"
  );

  const aiTask = (await services.settings.createAiTaskDefinition(
    {
      displayName: "Image digest",
      hookKey: "image-digest",
      taskKind: "image-enrichment"
    },
    session.user,
    "request-create-image-digest-task"
  )) as { aiTask: { taskKey: string; taskKind: string; prompt: { id: string } | null } };

  assert.equal(aiTask.aiTask.taskKey, "image-digest");
  assert.equal(aiTask.aiTask.taskKind, "image-enrichment");
  assert.notEqual(aiTask.aiTask.prompt, null);
});

test("AI task route enablement blocks unimplemented hooks and incompatible providers", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    LLM_PROVIDER: "local-dev"
  });
  const db = new FakeDatabase();
  seedTaskSettings(db);
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  await assert.rejects(
    () =>
      services.settings.updateAiTaskRoute(
        "task-custom",
        {
          providerConfigId: "provider-local-dev",
          enabled: true
        },
        session.user,
        "request-enable-unimplemented"
      ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === "ai_task_hook_not_implemented"
  );

  await assert.rejects(
    () =>
      services.settings.updateAiTaskRoute(
        "task-memo-expansion",
        {
          providerConfigId: "provider-whisper",
          enabled: true
        },
        session.user,
        "request-enable-incompatible"
      ),
    (error: unknown) =>
      error instanceof HttpError && error.statusCode === 400 && error.code === "provider_incompatible"
  );
});

test("AI task route enablement uses generic LLM runtime rather than task key", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    LLM_PROVIDER: "local-dev"
  });
  const db = new FakeDatabase();
  seedTaskSettings(db);
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  const created = (await services.settings.createAiTaskDefinition(
    {
      displayName: "Concise expansion",
      hookKey: "memo-expansion",
      providerConfigId: "provider-local-dev",
      modelName: "memo-capture-local-dev-expander-v1",
      enabled: true
    },
    session.user,
    "request-create-concise-expansion"
  )) as { aiTask: { taskKey: string; hookKey: string; routeEnabled: boolean; runtimeReady: boolean } };

  assert.equal(created.aiTask.taskKey, "concise-expansion");
  assert.equal(created.aiTask.hookKey, "memo-expansion");
  assert.equal(created.aiTask.routeEnabled, true);
  assert.equal(created.aiTask.runtimeReady, true);

  const second = (await services.settings.createAiTaskDefinition(
    {
      displayName: "Detailed expansion",
      hookKey: "memo-expansion",
      providerConfigId: "provider-local-dev",
      modelName: "memo-capture-local-dev-expander-v1",
      enabled: true
    },
    session.user,
    "request-create-detailed-expansion"
  )) as { aiTask: { taskKey: string; hookKey: string; routeEnabled: boolean; runtimeReady: boolean } };

  assert.equal(second.aiTask.taskKey, "detailed-expansion");
  assert.equal(second.aiTask.hookKey, "memo-expansion");
  assert.equal(second.aiTask.routeEnabled, true);
  assert.equal(second.aiTask.runtimeReady, true);
});

test("disabled generic LLM runtime blocks LLM task enablement", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    LLM_PROVIDER: "disabled"
  });
  const db = new FakeDatabase();
  seedTaskSettings(db);
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  await assert.rejects(
    () =>
      services.settings.createAiTaskDefinition(
        {
          displayName: "Disabled runtime expansion",
          hookKey: "memo-expansion",
          providerConfigId: "provider-local-dev",
          enabled: true
        },
        session.user,
        "request-create-disabled-runtime-expansion"
      ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === "task_runtime_disabled"
  );
});

test("AI task display name updates do not change the derived task key", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    LLM_PROVIDER: "local-dev"
  });
  const db = new FakeDatabase();
  seedTaskSettings(db);
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  const updated = (await services.settings.updateAiTaskDefinition(
    "task-memo-expansion",
    {
      displayName: "Renamed expansion",
      hookKey: "memo-expansion",
      providerConfigId: "provider-local-dev",
      enabled: true
    },
    session.user,
    "request-rename-expansion-task"
  )) as { aiTask: { taskKey: string; displayName: string } };

  assert.equal(updated.aiTask.displayName, "Renamed expansion");
  assert.equal(updated.aiTask.taskKey, "memo-expansion");
});

test("AI task updates save prompt fields and task definitions can be deleted", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    LLM_PROVIDER: "local-dev"
  });
  const db = new FakeDatabase();
  seedTaskSettings(db);
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  const updated = (await services.settings.updateAiTaskDefinition(
    "task-memo-expansion",
    {
      displayName: "Memo expansion",
      hookKey: "memo-expansion",
      providerConfigId: "provider-local-dev",
      modelName: "memo-capture-local-dev-expander-v1",
      promptsEnabled: true,
      freeformText: "Return strict JSON with a stronger memo body.",
      includeProjectSynopsis: false,
      includeMemoMetadata: true,
      includeMemoTranscriptText: true,
      outputSchema: {},
      enabled: true
    },
    session.user,
    "request-update-task-with-prompt"
  )) as { aiTask: { prompt: { id: string } } };

  assert.equal(updated.aiTask.prompt.id, "prompt-work-item-expansion");
  const promptVersion = db.promptVersions.find((row) => row.prompt_definition_id === "prompt-work-item-expansion");
  assert.equal(promptVersion?.body, "Return strict JSON with a stronger memo body.");
  assert.deepEqual(promptVersion?.context_config, {
    freeformText: "Return strict JSON with a stronger memo body.",
    includeProjectSynopsis: false,
    includeMemoMetadata: true,
    includeMemoTranscriptText: true
  });

  const deleted = await services.settings.deleteAiTaskDefinition(
    "task-custom",
    session.user,
    "request-delete-task"
  );

  assert.deepEqual(deleted, { deleted: true, taskId: "task-custom" });
  assert.equal(db.aiTaskDefinitions.some((row) => row.id === "task-custom"), false);
  assert.equal(db.aiTaskRoutes.some((row) => row.task_definition_id === "task-custom"), false);
});

test("form memo service creates source memo, work item, import event, and audit rows", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  seedActiveClassifyWorkflow(db);
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  const result = await services.formMemos.createFromRequest(
    {
      projectId: "00000000-0000-4000-8000-000000000301",
      title: "Capture this",
      body: "Useful memo body",
      contributorText: "Paul",
      tags: ["Launch Blocker", "Workflow"]
    },
    session.user,
    "request-1"
  );

  assert.equal(db.sourceMemos.length, 1);
  assert.equal(db.workItems.length, 1);
  assert.equal(db.importEvents.length, 1);
  assert.equal(db.auditEvents.length, 2);
  assert.equal(db.processingJobs.length, 1);
  assert.equal(db.processingJobs[0]?.job_kind, "nominate_tags");
  assert.equal(result.workItem.workflowState, "memo");
  assert.equal(result.workItem.title, "Capture this");
  assert.equal(result.workItem.tagsAvailable, true);
  assert.deepEqual(result.workItem.tags, ["Launch Blocker", "Workflow"]);
});

test("accepting an AI suggestion keeps its seeded tags visible", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  seedActiveClassifyWorkflow(db);
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  db.sourceMemos.push({
    id: "source-parent",
    source_type: "form",
    original_text: "Parent body",
    extracted_text: "Parent body",
    content_hash: "parent-hash",
    contributor_text: null,
    current_transcript_text: null,
    original_path: null,
    archive_path: null,
    primary_artifact_id: null,
    original_file_modified_at: originalFileModifiedAt,
    created_at: "2026-05-29T00:00:00.000Z",
    updated_at: "2026-05-29T00:00:00.000Z"
  });
  db.workItems.push({
    id: "work-item-parent",
    source_memo_id: "source-parent",
    project_id: "00000000-0000-4000-8000-000000000301",
    contributor_text: null,
    contributor_id: null,
    title: "Parent item",
    body: "Parent body",
    workflow_state: "memo",
    workflow_item_version: 1,
    accepted_snapshot_id: null,
    accepted_unexported_changes: false,
    original_file_modified_at: originalFileModifiedAt,
    created_at: "2026-05-29T00:00:00.000Z",
    updated_at: "2026-05-29T00:00:00.000Z",
    tag_nomination_completed_at: null,
    tag_nomination_project_id: null,
    tag_nomination_job_id: null
  });
  db.aiSuggestions.push({
    id: "ai-suggestion-1",
    parent_work_item_id: "work-item-parent",
    title: "Expanded item",
    body: "Expanded body",
    tags: ["Launch Blocker", "Workflow"],
    rationale: "Useful follow-up",
    status: "pending",
    applied_work_item_id: null,
    created_by: session.user.id,
    prompt_version_id: null,
    provider_name: "openai",
    model_name: "gpt-4.1",
    validation_result: { ok: true },
    created_at: "2026-05-29T00:00:00.000Z",
    updated_at: "2026-05-29T00:00:00.000Z"
  });

  const result = await services.ai.acceptSuggestion("ai-suggestion-1", session.user, "request-ai-accept");

  assert.equal(result.workItem.projectId, "00000000-0000-4000-8000-000000000301");
  assert.equal(result.workItem.tagsAvailable, true);
  assert.deepEqual(result.workItem.tags, ["Launch Blocker", "Workflow"]);
});

test("catalog service deletes unused projects and blocks projects referenced by work items", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();
  db.projects.push(projectRow("project-unused", "Unused Project"));
  db.projects.push(projectRow("project-used", "Used Project"));
  db.workItems.push({ id: "work-item-used", project_id: "project-used" });

  const deleted = await services.catalog.deleteProject("project-unused", session.user, "request-delete-unused");

  assert.equal(deleted?.id, "project-unused");
  assert.equal(db.projects.some((project) => project.id === "project-unused"), false);
  assert.equal(db.auditEvents.at(-1)?.event_name, "project.deleted");
  await assert.rejects(
    () => services.catalog.deleteProject("project-used", session.user, "request-delete-used"),
    (error: unknown) => error instanceof HttpError && error.statusCode === 409 && error.code === "project_in_use"
  );
});

test("audit repository lists events with source memo display context", async () => {
  const db = new FakeDatabase();
  db.projects.push(projectRow("project-audit", "Audit Project"));
  db.artifacts.push({
    id: "artifact-audit",
    original_filename: "debug-source.md"
  });
  db.sourceMemos.push({
    id: "source-memo-audit",
    primary_artifact_id: "artifact-audit",
    original_path: "/incoming/debug-source.md"
  });
  db.workItems.push({
    id: "work-item-audit",
    source_memo_id: "source-memo-audit",
    project_id: "project-audit",
    title: "Debug source memo"
  });

  await new AuditRepository(db).record({
    eventName: "work_item.workflow_action_executed",
    actor: null,
    subjectType: "work_item",
    subjectId: "work-item-audit",
    requestId: "request-audit",
    workItemId: "work-item-audit",
    metadata: { actionId: "review.memo" }
  });

  const [event] = await new AuditRepository(db).list();

  assert.equal(event?.eventName, "work_item.workflow_action_executed");
  assert.equal(event?.display.title, "Debug source memo");
  assert.equal(event?.display.originalFilename, "debug-source.md");
  assert.equal(event?.display.originalPath, "/incoming/debug-source.md");
  assert.equal(event?.display.projectName, "Audit Project");
});

test("workflow activation compatibility lists only workflow-dependent active jobs", async () => {
  const db = new FakeDatabase();
  const activeStatuses = ["queued", "claimed", "running", "retry_scheduled"];
  const nonWorkflowJobKinds = [
    "transcribe_audio",
    "extract_memo_metadata",
    "generate_keywords",
    "expand_work_item",
    "generate_export_batch"
  ];

  for (const status of activeStatuses) {
    for (const jobKind of nonWorkflowJobKinds) {
      db.processingJobs.push({
        job_kind: jobKind,
        status,
        work_item_id: jobKind === "generate_export_batch" ? null : "work-item-1"
      });
    }
  }
  db.processingJobs.push(
    { id: "job-nominate-queued", job_kind: "nominate_tags", status: "queued", work_item_id: "work-item-queued" },
    { id: "job-nominate-running", job_kind: "nominate_tags", status: "running", work_item_id: "work-item-running" },
    { id: "job-nominate-done", job_kind: "nominate_tags", status: "succeeded", work_item_id: "work-item-done" }
  );
  db.workItems.push(
    { id: "work-item-queued", workflow_state: "memo" },
    { id: "work-item-running", workflow_state: "memo" },
    { id: "work-item-done", workflow_state: "memo" }
  );

  const activeDependentJobs = await new WorkflowRepository(db).listActiveWorkflowDependentJobs();

  assert.deepEqual(
    activeDependentJobs.map((job) => job.id),
    ["job-nominate-queued", "job-nominate-running"]
  );
});

test("workflow activation compatibility allows nomination jobs when the staged bundle supports the same state hook", () => {
  const db = new FakeDatabase();
  seedActiveClassifyWorkflow(db);
  const candidateBundle = db.activeWorkflow?.bundle;

  const activeDependentJobs = countIncompatibleActiveWorkflowDependentJobs(
    [{ id: "job-nominate-queued", job_kind: "nominate_tags", work_item_id: "work-item-1", workflow_state: "memo" }],
    candidateBundle
  );

  assert.equal(activeDependentJobs, 0);
});

test("workflow activation compatibility blocks nomination jobs when the staged bundle removes their state hook", () => {
  const db = new FakeDatabase();
  seedActiveClassifyWorkflow(db);
  const candidateBundle = {
    ...(db.activeWorkflow?.bundle as Record<string, unknown>),
    hooks: []
  };

  const activeDependentJobs = countIncompatibleActiveWorkflowDependentJobs(
    [{ id: "job-nominate-queued", job_kind: "nominate_tags", work_item_id: "work-item-1", workflow_state: "memo" }],
    candidateBundle
  );

  assert.equal(activeDependentJobs, 1);
});

test("archive result rejects mismatched machine ids", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  db.importEvents.push({
    id: "import-event-1",
    source_memo_id: "source-memo-1",
    machine_id: "machine-1",
    status: "imported"
  });
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  await assert.rejects(
    () =>
      services.imports.reportArchiveResult(
        "import-event-1",
        {
          machineId: "machine-2",
          archivePath: "/archive/memo.md",
          status: "archived",
          warning: null
        },
        session.user,
        "request-1"
      ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === "machine_id_mismatch"
  );
});

test("upload sessions reject inactive file type settings", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  db.fileTypes.push({
    id: "file-type-md",
    extension: ".md",
    media_kind: "text",
    capability_state: "inactive",
    parser_key: "markdown",
    updated_at: "2026-05-29T00:00:00.000Z"
  });
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  await assert.rejects(
    () =>
      services.imports.createUploadSession(
        {
          machineId: "machine-1",
          watchFolderId: "watch-1",
          sourceType: "watched_text_file",
          originalFilename: "memo.md",
          originalPath: "/watched/memo.md",
          originalFileModifiedAt,
          mimeType: "text/markdown",
          byteSize: 10,
          contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        session.user,
        "request-1"
      ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 400 &&
      error.code === "unsupported_file_type"
  );
});

test("exact duplicate imports repair source memo original time when creation time is earlier", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  seedMediaParserRegistry(db);
  db.fileTypes.push({
    id: "file-type-m4a",
    extension: ".m4a",
    media_kind: "audio",
    capability_state: "active",
    parser_key: "audio-transcription",
    updated_at: "2026-05-29T00:00:00.000Z"
  });
  db.sourceMemos.push({
    id: "source-existing",
    source_type: "watched_audio_file",
    primary_artifact_id: null,
    content_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    original_file_modified_at: "2024-03-15T09:18:00.000Z"
  });
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  const duplicate = await services.imports.createUploadSession(
    {
      machineId: "machine-1",
      watchFolderId: "watch-1",
      sourceType: "watched_audio_file",
      originalFilename: "memo.m4a",
      originalPath: "/watched/memo.m4a",
      originalFileModifiedAt: "2023-07-28T17:26:15.000Z",
      mimeType: "audio/mp4",
      byteSize: 10,
      contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },
    session.user,
    "request-1"
  );

  assert.equal(duplicate.status, "duplicate_exact");
  assert.equal(db.sourceMemos[0]?.original_file_modified_at, "2023-07-28T17:26:15.000Z");
  assert.equal(db.workItems.length, 0);
});

test("settings service creates configurable file types with audit", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  seedMediaParserRegistry(db);
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();
  db.fileTypes.push({
    id: "file-type-md",
    extension: ".md",
    media_kind: "text",
    capability_state: "active",
    parser_key: "markdown",
    updated_at: "2026-05-29T00:00:00.000Z"
  });

  const created = await services.settings.createFileType(
    {
      extension: "HTML",
      mediaKind: "text",
      parserKey: null,
      capabilityState: "active"
    },
    session.user,
    "request-1"
  ) as { fileType: { extension: string; capabilityState: string; parserKey: string | null } };

  assert.equal(created.fileType.extension, ".html");
  assert.equal(created.fileType.capabilityState, "active");
  assert.equal(created.fileType.parserKey, null);
  assert.equal(db.auditEvents.at(-1)?.event_name, "file_type_settings.created");

  await assert.rejects(
    () =>
      services.settings.createFileType(
        {
          extension: ".html",
          mediaKind: "text",
          parserKey: null,
          capabilityState: "inactive"
        },
        session.user,
        "request-2"
      ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === "file_type_exists"
  );

  const mediaType = await services.settings.createMediaType(
    {
      mediaKey: "document",
      displayName: "Document",
      description: "Future document imports",
      capabilityState: "not_supported_yet"
    },
    session.user,
    "request-3"
  ) as { mediaType: { mediaKey: string; capabilityState: string } };
  assert.equal(mediaType.mediaType.mediaKey, "document");
  assert.equal(mediaType.mediaType.capabilityState, "not_supported_yet");

  const parserType = await services.settings.createParserType(
    {
      parserKey: "pdf-text",
      displayName: "PDF text",
      description: "Future PDF parser",
      mediaKey: "document",
      capabilityState: "not_supported_yet"
    },
    session.user,
    "request-4"
  ) as { parserType: { parserKey: string; mediaKey: string } };
  assert.equal(parserType.parserType.parserKey, "pdf-text");
  assert.equal(parserType.parserType.mediaKey, "document");

  await assert.rejects(
    () =>
      services.settings.createFileType(
        {
          extension: ".pdf",
          mediaKind: "document",
          parserKey: "markdown",
          capabilityState: "inactive"
        },
        session.user,
        "request-5"
      ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 400 &&
      error.code === "invalid_request"
  );

  await assert.rejects(
    () => services.settings.deleteParserType("parser-markdown", session.user, "request-6"),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === "parser_type_in_use"
  );

  const deletedFileType = await services.settings.deleteFileType(
    "file-type-md",
    session.user,
    "request-7"
  ) as { deleted: boolean; fileType: { extension: string } };
  assert.equal(deletedFileType.deleted, true);
  assert.equal(deletedFileType.fileType.extension, ".md");
  assert.equal(db.auditEvents.at(-1)?.event_name, "file_type_settings.deleted");

  const deletedParserType = await services.settings.deleteParserType(
    "parser-markdown",
    session.user,
    "request-8"
  ) as { deleted: boolean; parserType: { parserKey: string } };
  assert.equal(deletedParserType.deleted, true);
  assert.equal(deletedParserType.parserType.parserKey, "markdown");
  assert.equal(db.auditEvents.at(-1)?.event_name, "parser_type_settings.deleted");

  await assert.rejects(
    () => services.settings.deleteMediaType("media-text", session.user, "request-9"),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.code === "media_type_in_use"
  );
});

test("enabled file types without parsers finalize into ingestion review without jobs", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    OBJECT_STORAGE_LOCAL_ROOT: "/private/tmp/memo-capture-test-storage"
  });
  const db = new FakeDatabase();
  seedMediaParserRegistry(db);
  db.fileTypes.push({
    id: "file-type-html",
    extension: ".html",
    media_kind: "text",
    capability_state: "active",
    parser_key: null,
    updated_at: "2026-05-29T00:00:00.000Z"
  });
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();
  const body = Buffer.from("<section>memo</section>", "utf8");
  const contentHash = `sha256:${createHash("sha256").update(body).digest("hex")}`;

  const uploadSession = await services.imports.createUploadSession(
    {
      machineId: "machine-1",
      watchFolderId: "watch-1",
      sourceType: "watched_text_file",
      originalFilename: "memo.html",
      originalPath: "/watched/memo.html",
      originalFileModifiedAt,
      mimeType: "text/plain",
      byteSize: body.byteLength,
      contentHash
    },
    session.user,
    "request-1"
  );
  assert.equal(uploadSession.status, "upload_required");
  await services.imports.uploadSessionArtifact(uploadSession.sessionId, body);

  const finalized = await services.imports.finalizeUploadSession(
    uploadSession.sessionId,
    { machineId: "machine-1", archivePlanned: true },
    session.user,
    "request-2"
  );

  assert.equal(finalized.initialWorkflowState, "needs_review");
  assert.deepEqual(finalized.processingJobs, []);
  assert.equal(db.processingJobs.length, 0);
  assert.equal(db.sourceMemos[0]?.original_file_modified_at, originalFileModifiedAt);
  assert.equal(db.workItems[0]?.original_file_modified_at, originalFileModifiedAt);
  assert.match(String(db.workItems[0]?.title), /Add file type support for \.html/);
  assert.match(String(db.workItems[0]?.body), /Parser key: none/);
});

test("text import classify_item promotes only on one confident active project match", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    OBJECT_STORAGE_LOCAL_ROOT: "/private/tmp/memo-capture-test-storage"
  });
  const db = new FakeDatabase();
  seedMediaParserRegistry(db);
  seedActiveClassifyWorkflow(db);
  db.projects.push(projectRow("project-memo-capture", "Memo Capture"));
  db.fileTypes.push({
    id: "file-type-md",
    extension: ".md",
    media_kind: "text",
    capability_state: "active",
    parser_key: "markdown",
    updated_at: "2026-05-29T00:00:00.000Z"
  });
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();
  const body = Buffer.from("Memo Capture\nMemo Capture import routing.", "utf8");
  const contentHash = `sha256:${createHash("sha256").update(body).digest("hex")}`;

  const uploadSession = await services.imports.createUploadSession(
    {
      machineId: "machine-1",
      watchFolderId: "watch-1",
      sourceType: "watched_text_file",
      originalFilename: "memo.md",
      originalPath: "/watched/memo.md",
      originalFileModifiedAt,
      mimeType: "text/markdown",
      byteSize: body.byteLength,
      contentHash
    },
    session.user,
    "request-1"
  );
  await services.imports.uploadSessionArtifact(uploadSession.sessionId, body);

  const beforeFinalize = Date.now();
  const finalized = await services.imports.finalizeUploadSession(
    uploadSession.sessionId,
    { machineId: "machine-1", archivePlanned: true },
    session.user,
    "request-2"
  );

  assert.equal(finalized.initialWorkflowState, "needs_review");
  assert.equal(db.workItems[0]?.project_id, "project-memo-capture");
  assert.equal(db.workItems[0]?.workflow_state, "memo");
  assert.equal(db.processingJobs[0]?.job_kind, "nominate_tags");
  const scheduledDelayMs = new Date(String(db.processingJobs[0]?.run_after)).getTime() - beforeFinalize;
  assert.equal(scheduledDelayMs > 0, true);
  assert.notEqual(scheduledDelayMs, 900000);
  assert.equal(db.auditEvents.some((event) => event.event_name === "work_item.workflow_action_executed"), true);
});

test("manual workflow action into memo schedules nominate_tags", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    OBJECT_STORAGE_LOCAL_ROOT: "/private/tmp/memo-capture-test-storage"
  });
  const db = new FakeDatabase();
  seedActiveClassifyWorkflow(db);
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();
  db.sourceMemos.push({
    id: "00000000-0000-4000-8000-000000000101",
    source_type: "watched_text_file",
    extracted_text: "Memo Capture",
    current_transcript_text: null,
    original_file_modified_at: originalFileModifiedAt
  });
  db.workItems.push({
    id: "00000000-0000-4000-8000-000000000201",
    source_memo_id: "00000000-0000-4000-8000-000000000101",
    project_id: "00000000-0000-4000-8000-000000000301",
    contributor_text: null,
    contributor_id: null,
    title: "Reviewed memo",
    body: "Ready for memo",
    body_format: "markdown",
    workflow_state: "needs_review",
    tags: [],
    workflow_item_version: 1,
    accepted_snapshot_id: null,
    accepted_unexported_changes: false,
    original_file_modified_at: originalFileModifiedAt,
    created_at: "2026-05-29T00:00:00.000Z",
    updated_at: "2026-05-29T00:00:00.000Z"
  });

  await services.workflows.executeAction(
    "00000000-0000-4000-8000-000000000201",
    "review.memo",
    {},
    session.user,
    "request-action"
  );

  assert.equal(db.workItems[0]?.workflow_state, "memo");
  assert.equal(db.processingJobs.length, 1);
  assert.equal(db.processingJobs[0]?.job_kind, "nominate_tags");
});

test("nominate_tags job assigns generated tags and reschedules recurring memo hook", async () => {
  const db = new FakeDatabase();
  seedActiveClassifyWorkflow(db);
  seedWorkItemRow({
    db,
    title: "Project Falcon launch notes",
    body: "Project Falcon Project Falcon launch sequencing and release notes.",
    sourceText: "Project Falcon launch sequencing."
  });
  seedProjectTag(db, "Project Falcon");

  const result = await new KeywordService(db).runNominateTagsJob({
    jobId: "job-nominate",
    workItemId: "00000000-0000-4000-8000-000000000201",
    sourceMemoId: "00000000-0000-4000-8000-000000000101"
  });

  assert.equal(result.workItemId, "00000000-0000-4000-8000-000000000201");
  assert.deepEqual(result.tags.map((tag) => tag.name), ["Project Falcon"]);
  assert.deepEqual(db.workItems[0]?.tags, ["Project Falcon"]);
  assert.notEqual(db.workItems[0]?.tag_nomination_completed_at, null);
  assert.equal(db.processingJobs.length, 1);
  assert.equal(db.processingJobs[0]?.job_kind, "nominate_tags");
});

test("nominate_tags job does not assign keywords outside the project lexicon", async () => {
  const db = new FakeDatabase();
  seedActiveClassifyWorkflow(db);
  seedWorkItemRow({
    db,
    title: "Project Falcon launch notes",
    body: "Project Falcon Project Falcon launch sequencing and release notes.",
    sourceText: "Project Falcon launch sequencing."
  });
  seedProjectTag(db, "Unrelated Lexicon");

  const result = await new KeywordService(db).runNominateTagsJob({
    jobId: "job-nominate",
    workItemId: "00000000-0000-4000-8000-000000000201",
    sourceMemoId: "00000000-0000-4000-8000-000000000101"
  });

  assert.deepEqual(result.tags, []);
  assert.deepEqual(db.workItems[0]?.tags, []);
  assert.notEqual(db.workItems[0]?.tag_nomination_completed_at, null);
});

test("nominate_tags job skips tag assignment when the work item is no longer in memo", async () => {
  const db = new FakeDatabase();
  seedActiveClassifyWorkflow(db);
  seedWorkItemRow({
    db,
    workflowState: "parked",
    title: "Project Falcon launch notes",
    body: "Project Falcon Project Falcon launch sequencing."
  });

  const result = await new KeywordService(db).runNominateTagsJob({
    jobId: "job-nominate",
    workItemId: "00000000-0000-4000-8000-000000000201",
    sourceMemoId: "00000000-0000-4000-8000-000000000101"
  });

  assert.deepEqual(result.tags, []);
  assert.deepEqual(db.workItems[0]?.tags, []);
  assert.equal(db.processingJobs.length, 0);
});

test("leaving memo cancels pending nominate_tags jobs", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    OBJECT_STORAGE_LOCAL_ROOT: "/private/tmp/memo-capture-test-storage"
  });
  const db = new FakeDatabase();
  seedActiveClassifyWorkflow(db);
  seedWorkItemRow({ db, workflowState: "memo" });
  db.processingJobs.push({
    id: "job-pending",
    job_kind: "nominate_tags",
    status: "queued",
    source_memo_id: "00000000-0000-4000-8000-000000000101",
    work_item_id: "00000000-0000-4000-8000-000000000201"
  });
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  await services.workflows.executeAction(
    "00000000-0000-4000-8000-000000000201",
    "memo.parked",
    {},
    session.user,
    "request-park"
  );

  assert.equal(db.workItems[0]?.workflow_state, "parked");
  assert.equal(db.processingJobs[0]?.status, "cancelled");
});

test("watched text imports link contributor records by normalized contributor name", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    OBJECT_STORAGE_LOCAL_ROOT: "/private/tmp/memo-capture-test-storage"
  });
  const db = new FakeDatabase();
  seedMediaParserRegistry(db);
  db.fileTypes.push({
    id: "file-type-md",
    extension: ".md",
    media_kind: "text",
    capability_state: "active",
    parser_key: "markdown",
    updated_at: "2026-05-29T00:00:00.000Z"
  });
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  async function importText(filename: string, text: string, contributorText: string | null) {
    const body = Buffer.from(text, "utf8");
    const uploadSession = await services.imports.createUploadSession(
      {
        machineId: "machine-1",
        watchFolderId: "watch-1",
        sourceType: "watched_text_file",
        originalFilename: filename,
        originalPath: `/watched/${filename}`,
        originalFileModifiedAt,
        mimeType: "text/markdown",
        byteSize: body.byteLength,
        contentHash: `sha256:${createHash("sha256").update(body).digest("hex")}`,
        contributorText
      },
      session.user,
      `request-${filename}-create`
    );
    await services.imports.uploadSessionArtifact(uploadSession.sessionId, body);
    await services.imports.finalizeUploadSession(
      uploadSession.sessionId,
      { machineId: "machine-1", archivePlanned: true },
      session.user,
      `request-${filename}-finalize`
    );
  }

  await importText("first.md", "First memo", "Paul-Marshall!");
  await importText("second.md", "Second memo", "paul marshall");
  await importText("empty.md", "Empty contributor memo", "***");

  assert.equal(db.contributors.length, 1);
  assert.equal(db.contributors[0]?.contributor_key, "paulmarshall");
  assert.equal(db.contributors[0]?.display_name, "Paul-Marshall!");
  assert.equal(db.sourceMemos[0]?.contributor_text, "Paul-Marshall!");
  assert.equal(db.workItems[0]?.contributor_text, "Paul-Marshall!");
  assert.equal(db.sourceMemos[0]?.contributor_id, db.contributors[0]?.id);
  assert.equal(db.workItems[0]?.contributor_id, db.contributors[0]?.id);
  assert.equal(db.workItems[1]?.contributor_id, db.contributors[0]?.id);
  assert.equal(db.workItems[1]?.contributor_text, "paul marshall");
  assert.equal(db.sourceMemos[2]?.contributor_text, null);
  assert.equal(db.workItems[2]?.contributor_id, null);
});

test("text import classify_item leaves ambiguous project matches in review", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    OBJECT_STORAGE_LOCAL_ROOT: "/private/tmp/memo-capture-test-storage"
  });
  const db = new FakeDatabase();
  seedMediaParserRegistry(db);
  seedActiveClassifyWorkflow(db);
  db.projects.push(projectRow("project-memo", "Memo"), projectRow("project-capture", "Capture"));
  db.fileTypes.push({
    id: "file-type-md",
    extension: ".md",
    media_kind: "text",
    capability_state: "active",
    parser_key: "markdown",
    updated_at: "2026-05-29T00:00:00.000Z"
  });
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();
  const body = Buffer.from("Memo Capture import routing.", "utf8");
  const contentHash = `sha256:${createHash("sha256").update(body).digest("hex")}`;

  const uploadSession = await services.imports.createUploadSession(
    {
      machineId: "machine-1",
      watchFolderId: "watch-1",
      sourceType: "watched_text_file",
      originalFilename: "memo.md",
      originalPath: "/watched/memo.md",
      originalFileModifiedAt,
      mimeType: "text/markdown",
      byteSize: body.byteLength,
      contentHash
    },
    session.user,
    "request-1"
  );
  await services.imports.uploadSessionArtifact(uploadSession.sessionId, body);

  await services.imports.finalizeUploadSession(
    uploadSession.sessionId,
    { machineId: "machine-1", archivePlanned: true },
    session.user,
    "request-2"
  );

  assert.equal(db.workItems[0]?.project_id, null);
  assert.equal(db.workItems[0]?.workflow_state, "needs_review");
  assert.equal(db.processingJobs.length, 0);
  assert.equal(db.auditEvents.some((event) => event.event_name === "work_item.workflow_action_executed"), false);
});

test("audio transcription parser finalization queues transcription jobs", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    OBJECT_STORAGE_LOCAL_ROOT: "/private/tmp/memo-capture-test-storage"
  });
  const db = new FakeDatabase();
  seedMediaParserRegistry(db);
  db.fileTypes.push({
    id: "file-type-m4a",
    extension: ".m4a",
    media_kind: "audio",
    capability_state: "active",
    parser_key: "audio-transcription",
    updated_at: "2026-05-29T00:00:00.000Z"
  });
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();
  const body = Buffer.from("audio bytes", "utf8");
  const contentHash = `sha256:${createHash("sha256").update(body).digest("hex")}`;

  const uploadSession = await services.imports.createUploadSession(
    {
      machineId: "machine-1",
      watchFolderId: "watch-1",
      sourceType: "watched_audio_file",
      originalFilename: "memo.m4a",
      originalPath: "/watched/memo.m4a",
      originalFileModifiedAt,
        mimeType: "audio/mp4",
        byteSize: body.byteLength,
        contentHash,
        contributorText: "Audio Contributor"
      },
    session.user,
    "request-1"
  );
  await services.imports.uploadSessionArtifact(uploadSession.sessionId, body);

  const finalized = await services.imports.finalizeUploadSession(
    uploadSession.sessionId,
    { machineId: "machine-1", archivePlanned: true },
    session.user,
    "request-2"
  );

  assert.equal(finalized.workItemId, null);
  assert.equal(finalized.initialWorkflowState, null);
  assert.equal(finalized.processingJobs.length, 1);
  assert.equal(db.processingJobs[0]?.job_kind, "transcribe_audio");
  assert.equal(db.processingJobs[0]?.work_item_id, null);
  assert.equal(db.workItems.length, 0);
  assert.equal(db.sourceMemos[0]?.contributor_text, "Audio Contributor");
  assert.equal(db.sourceMemos[0]?.contributor_id, db.contributors[0]?.id);

  const transcription = new TranscriptionService(db, new ObjectStorageService(config.objectStorage), config);
  await transcription.ensureRecoverableAudioWorkItem({
    sourceMemoId: String(finalized.sourceMemoId),
    actorUserId: session.user.id,
    requestId: "request-recovery"
  });

  assert.equal(db.workItems.length, 1);
  assert.equal(db.workItems[0]?.contributor_text, "Audio Contributor");
  assert.equal(db.workItems[0]?.contributor_id, db.contributors[0]?.id);
});

test("work item repository exposes and orders by original file modified time", async () => {
  let capturedSql = "";
  const queryable: Queryable = {
    query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
      text: string
    ): Promise<QueryResult<Row>> => {
      capturedSql = text;
      return rows([
        {
          id: "work-item-newer-original",
          source_memo_id: "source-memo-newer-original",
          project_id: null,
          contributor_text: null,
          contributor_id: null,
          title: "Newer original",
          body: "Body",
          tags: [],
          body_format: "markdown",
          workflow_state: "needs_review",
          workflow_item_version: 1,
          accepted_snapshot_id: null,
          accepted_unexported_changes: false,
          original_file_modified_at: "2026-05-29T03:00:00.000Z",
          created_at: "2026-05-29T00:00:00.000Z",
          updated_at: "2026-05-29T05:00:00.000Z"
        },
        {
          id: "work-item-older-original",
          source_memo_id: "source-memo-older-original",
          project_id: null,
          contributor_text: null,
          contributor_id: null,
          title: "Older original",
          body: "Body",
          tags: [],
          body_format: "markdown",
          workflow_state: "needs_review",
          workflow_item_version: 1,
          accepted_snapshot_id: null,
          accepted_unexported_changes: false,
          original_file_modified_at: "2026-05-29T01:00:00.000Z",
          created_at: "2026-05-29T04:00:00.000Z",
          updated_at: "2026-05-29T06:00:00.000Z"
        }
      ] as unknown as Row[]);
    }
  };

  const workItems = await new WorkItemRepository(queryable).list();

  assert.match(capturedSql, /source_memos\.original_file_modified_at desc nulls last/);
  assert.match(capturedSql, /work_items\.created_at desc/);
  assert.equal(workItems[0]?.originalFileModifiedAt, "2026-05-29T03:00:00.000Z");
  assert.equal(workItems[1]?.originalFileModifiedAt, "2026-05-29T01:00:00.000Z");
});

test("watched imports reject active file types when media type is unsupported", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  seedMediaParserRegistry(db);
  const audioMedia = db.mediaTypes.find((row) => row.media_key === "audio");
  if (audioMedia !== undefined) {
    audioMedia.capability_state = "not_supported_yet";
  }
  db.fileTypes.push({
    id: "file-type-m4a",
    extension: ".m4a",
    media_kind: "audio",
    capability_state: "active",
    parser_key: "audio-transcription",
    updated_at: "2026-05-29T00:00:00.000Z"
  });
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  await assert.rejects(
    () =>
      services.imports.createUploadSession(
        {
          machineId: "machine-1",
          watchFolderId: "watch-1",
          sourceType: "watched_audio_file",
          originalFilename: "memo.m4a",
          originalPath: "/watched/memo.m4a",
          originalFileModifiedAt,
          mimeType: "audio/mp4",
          byteSize: 10,
          contentHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        },
        session.user,
        "request-1"
      ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.statusCode === 400 &&
      error.code === "unsupported_file_type"
  );
});

test("protected routes require authorization and include a request id", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    MEMO_CAPTURE_APP_VERSION: "0.1.0",
    MEMO_CAPTURE_COMMIT_SHA: "test-sha"
  });
  const services = stubServices();
  const server = createApiServer(config, createLogger("error"), services);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects`);
    const body = (await response.json()) as { error: { code: string } };

    assert.equal(response.status, 401);
    assert.equal(body.error.code, "unauthorized");
    assert.match(response.headers.get("x-request-id") ?? "", /.+/);
  } finally {
    server.close();
    await services.close();
  }
});

test("basic protected capture routes expose session, catalog, work items, and form memo creation", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    MEMO_CAPTURE_APP_VERSION: "0.1.0",
    MEMO_CAPTURE_COMMIT_SHA: "test-sha"
  });
  const services = captureRouteServices();
  const server = createApiServer(config, createLogger("error"), services);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const session = await authedJson(baseUrl, "/api/current-session");
    assert.equal(session.response.status, 200);
    assert.equal(session.body.user.email, "dev@example.test");

    const removedFeatureGroups = await authedJson(baseUrl, "/api/feature-groups");
    assert.equal(removedFeatureGroups.response.status, 404);

    const contributorPatch = await authedJson(baseUrl, "/api/contributors/contributor-1", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Paul Marshall" })
    });
    assert.equal(contributorPatch.response.status, 200);
    assert.equal(contributorPatch.body.contributor.displayName, "Paul Marshall");

    const contributorDeactivate = await authedJson(
      baseUrl,
      "/api/contributors/contributor-1/deactivate",
      { method: "POST" }
    );
    assert.equal(contributorDeactivate.response.status, 200);
    assert.equal(contributorDeactivate.body.contributor.isActive, false);

    const projectDelete = await authedJson(baseUrl, "/api/projects/project-1", {
      method: "DELETE"
    });
    assert.equal(projectDelete.response.status, 200);
    assert.equal(projectDelete.body.project.id, "project-1");

    const workItemDetail = await authedJson(baseUrl, "/api/work-items/work-item-1");
    assert.equal(workItemDetail.response.status, 200);
    assert.equal(workItemDetail.body.workItem.title, "Captured memo");
    assert.equal(workItemDetail.body.workItem.originalFileModifiedAt, originalFileModifiedAt);

    const tagSuggestions = await authedJson(baseUrl, "/api/work-items/work-item-1/tag-suggestions");
    assert.equal(tagSuggestions.response.status, 200);
    assert.deepEqual(tagSuggestions.body.suggestions.strong, ["capture workflow"]);
    assert.deepEqual(tagSuggestions.body.suggestions.related, ["review queue"]);
    assert.deepEqual(tagSuggestions.body.suggestions.weak, ["local dev"]);

    const suppressedCreate = await authedJson(baseUrl, "/api/tags/suppressed", {
      method: "POST",
      body: JSON.stringify({
        name: "Review Queue",
        sourceWorkItemId: "work-item-1"
      })
    });
    assert.equal(suppressedCreate.response.status, 200);
    assert.equal(suppressedCreate.body.suppressedTag.normalizedName, "review queue");

    const suppressedList = await authedJson(baseUrl, "/api/tags/suppressed");
    assert.equal(suppressedList.response.status, 200);
    assert.deepEqual(suppressedList.body.suppressedTags.map((tag: { displayName: string }) => tag.displayName), [
      "Review Queue"
    ]);

    const suppressedDelete = await authedJson(baseUrl, "/api/tags/suppressed/review%20queue", {
      method: "DELETE"
    });
    assert.equal(suppressedDelete.response.status, 200);
    assert.equal(suppressedDelete.body.suppressedTag.displayName, "Review Queue");

    const workItemPatch = await authedJson(baseUrl, "/api/work-items/work-item-1", {
      method: "PATCH",
      body: JSON.stringify({
        expectedVersion: 1,
        title: "Captured memo updated",
        body: "Updated memo body",
        projectId: "project-1",
        contributorId: "contributor-1",
        contributorText: "Paul",
        tags: ["capture-api"]
      })
    });
    assert.equal(workItemPatch.response.status, 200);
    assert.equal(workItemPatch.body.workItem.title, "Captured memo updated");
    assert.equal(workItemPatch.body.workItem.workflowItemVersion, 2);

    const staleWorkItemPatch = await authedJson(baseUrl, "/api/work-items/work-item-1", {
      method: "PATCH",
      body: JSON.stringify({
        expectedVersion: 1,
        title: "Stale title",
        body: "Stale body"
      })
    });
    assert.equal(staleWorkItemPatch.response.status, 409);
    assert.equal(staleWorkItemPatch.body.error.code, "stale_work_item_version");
    assert.equal(staleWorkItemPatch.body.error.details.currentVersion, 2);

    const workflowStatus = await authedJson(baseUrl, "/api/workflow/status");
    assert.equal(workflowStatus.response.status, 200);
    assert.equal(workflowStatus.body.active.workflowVersion, "0.2.2");

    const workflowBuckets = await authedJson(baseUrl, "/api/workflow/buckets");
    assert.equal(workflowBuckets.response.status, 200);
    assert.equal(workflowBuckets.body.buckets[0].id, "memos");

    const debuggerStart = await authedJson(baseUrl, "/api/workflow/debugger/start", {
      method: "POST",
      body: JSON.stringify({ stepMode: true })
    });
    assert.equal(debuggerStart.response.status, 200);
    assert.equal(debuggerStart.body.state, "paused");
    assert.equal(debuggerStart.body.stepMode, true);

    const debuggerSnapshot = await authedJson(baseUrl, "/api/workflow/debugger/snapshot");
    assert.equal(debuggerSnapshot.response.status, 200);
    assert.equal(debuggerSnapshot.body.events[0].eventType, "debug_start");

    const debuggerResume = await authedJson(baseUrl, "/api/workflow/debugger/resume", {
      method: "POST"
    });
    assert.equal(debuggerResume.response.status, 200);
    assert.equal(debuggerResume.body.state, "running");

    const workflowActions = await authedJson(baseUrl, "/api/work-items/work-item-1/actions");
    assert.equal(workflowActions.response.status, 200);
    assert.equal(workflowActions.body.actions[0].id, "memo.accepted");

    const workflowAction = await authedJson(baseUrl, "/api/work-items/work-item-1/actions/memo.accepted", {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 2 })
    });
    assert.equal(workflowAction.response.status, 200);
    assert.equal(workflowAction.body.newState, "accepted");

    const exportableSnapshots = await authedJson(baseUrl, "/api/exports/accepted-snapshots");
    assert.equal(exportableSnapshots.response.status, 200);
    assert.equal(exportableSnapshots.body.snapshots[0].acceptedSnapshotId, "snapshot-1");

    const exportBatch = await authedJson(baseUrl, "/api/exports/batches", {
      method: "POST",
      body: JSON.stringify({ acceptedSnapshotIds: ["snapshot-1"], filterContext: {}, options: {} })
    });
    assert.equal(exportBatch.response.status, 200);
    assert.equal(exportBatch.body.exportBatchId, "export-batch-1");

    const exportBatchDetail = await authedJson(baseUrl, "/api/exports/batches/export-batch-1");
    assert.equal(exportBatchDetail.response.status, 200);
    assert.equal(exportBatchDetail.body.batch.status, "pending");

    const jobs = await authedJson(baseUrl, "/api/jobs?status=failed");
    assert.equal(jobs.response.status, 200);
    assert.equal(jobs.body.jobs[0].id, "job-1");

    const jobDetail = await authedJson(baseUrl, "/api/jobs/job-1");
    assert.equal(jobDetail.response.status, 200);
    assert.equal(jobDetail.body.job.status, "failed");

    const retryJob = await authedJson(baseUrl, "/api/jobs/job-1/retry", {
      method: "POST",
      body: JSON.stringify({ reason: "Provider recovered." })
    });
    assert.equal(retryJob.response.status, 200);
    assert.equal(retryJob.body.job.status, "queued");

    const cancelJob = await authedJson(baseUrl, "/api/jobs/job-1/cancel", {
      method: "POST",
      body: JSON.stringify({ reason: "No longer needed." })
    });
    assert.equal(cancelJob.response.status, 200);
    assert.equal(cancelJob.body.job.status, "cancelled");

    const systemDiagnostics = await authedJson(baseUrl, "/api/diagnostics/system");
    assert.equal(systemDiagnostics.response.status, 200);
    assert.equal(systemDiagnostics.body.database.ok, true);

    const providerDiagnostics = await authedJson(baseUrl, "/api/diagnostics/providers");
    assert.equal(providerDiagnostics.response.status, 200);
    assert.deepEqual(providerDiagnostics.body.providers, []);

    const settings = await authedJson(baseUrl, "/api/settings");
    assert.equal(settings.response.status, 200);
    assert.equal(settings.body.providers[0].providerName, "local-dev");
    assert.equal(settings.body.fileTypes[0].extension, ".md");

    const taskKindCreate = await authedJson(baseUrl, "/api/settings/task-kinds", {
      method: "POST",
      body: JSON.stringify({
        displayName: "Image enrichment",
        description: "Image enrichment tasks",
        providerKind: "llm",
        capabilityKey: "structured-generation",
        promptFieldsEnabled: true,
        enabled: false
      })
    });
    assert.equal(taskKindCreate.response.status, 200, JSON.stringify(taskKindCreate.body));
    assert.equal(taskKindCreate.body.taskKind.kindKey, "image-enrichment");

    const taskKindPatch = await authedJson(baseUrl, `/api/settings/task-kinds/${taskKindCreate.body.taskKind.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: false })
    });
    assert.equal(taskKindPatch.response.status, 200, JSON.stringify(taskKindPatch.body));
    assert.equal(taskKindPatch.body.taskKind.enabled, false);

    const providerPatch = await authedJson(baseUrl, "/api/settings/providers/provider-1", {
      method: "PATCH",
      body: JSON.stringify({ enabled: true, modelName: "memo-capture-local-dev-expander-v1" })
    });
    assert.equal(providerPatch.response.status, 200);
    assert.equal(providerPatch.body.provider.enabled, true);

    const aiTaskCreate = await authedJson(baseUrl, "/api/settings/ai-tasks", {
      method: "POST",
      body: JSON.stringify({
        taskKey: "custom-summary",
        displayName: "Custom summary",
        hookKey: "custom-summary",
        taskKind: "llm"
      })
    });
    assert.equal(aiTaskCreate.response.status, 200);
    assert.equal(aiTaskCreate.body.aiTask.taskKey, "custom-summary");
    assert.equal(aiTaskCreate.body.aiTask.hookImplemented, false);

    const fileTypePatch = await authedJson(baseUrl, "/api/settings/file-types/file-type-md", {
      method: "PATCH",
      body: JSON.stringify({ active: false })
    });
    assert.equal(fileTypePatch.response.status, 200);
    assert.equal(fileTypePatch.body.fileType.capabilityState, "inactive");

    const fileTypeCreate = await authedJson(baseUrl, "/api/settings/file-types", {
      method: "POST",
      body: JSON.stringify({
        extension: ".html",
        mediaKind: "text",
        parserKey: null,
        capabilityState: "active"
      })
    });
    assert.equal(fileTypeCreate.response.status, 200);
    assert.equal(fileTypeCreate.body.fileType.extension, ".html");
    assert.equal(fileTypeCreate.body.fileType.capabilityState, "active");

    const fileTypeDelete = await authedJson(baseUrl, "/api/settings/file-types/file-type-html", {
      method: "DELETE"
    });
    assert.equal(fileTypeDelete.response.status, 200);
    assert.equal(fileTypeDelete.body.deleted, true);

    const promptVersion = await authedJson(baseUrl, "/api/settings/prompts/prompt-1/current", {
      method: "PATCH",
      body: JSON.stringify({
        freeformText: "Expand with implementation detail.",
        includeProjectSynopsis: true,
        includeMemoMetadata: false,
        includeMemoTranscriptText: true,
        outputSchema: {}
      })
    });
    assert.equal(promptVersion.response.status, 200);
    assert.equal(promptVersion.body.prompt.activeVersion, 1);
    assert.equal(promptVersion.body.prompt.contextConfig.includeMemoMetadata, false);

    const auditEvents = await authedJson(baseUrl, "/api/audit-events?event_name=provider_config.updated");
    assert.equal(auditEvents.response.status, 200);
    assert.equal(auditEvents.body.auditEvents[0].eventName, "provider_config.updated");

    const itemDiagnostics = await authedJson(baseUrl, "/api/work-items/work-item-1/diagnostics");
    assert.equal(itemDiagnostics.response.status, 200);
    assert.equal(itemDiagnostics.body.workItemId, "work-item-1");

    const artifactDownload = await fetch(`${baseUrl}/api/artifacts/artifact-audio/download`, {
      headers: { authorization: "Bearer test-token" }
    });
    assert.equal(artifactDownload.status, 200);
    assert.equal(await artifactDownload.text(), "audio");

    const manualTranscript = await authedJson(baseUrl, "/api/work-items/work-item-1/manual-transcript", {
      method: "POST",
      body: JSON.stringify({
        expectedVersion: 2,
        title: "Captured memo updated",
        transcriptText: "Recovered from audio playback."
      })
    });
    assert.equal(manualTranscript.response.status, 200);
    assert.equal(manualTranscript.body.workItem.body, "Recovered from audio playback.");

    const aiExpansion = await authedJson(baseUrl, "/api/work-items/work-item-1/ai-expansions", {
      method: "POST",
      body: JSON.stringify({})
    });
    assert.equal(aiExpansion.response.status, 200);
    assert.equal(aiExpansion.body.expandedWorkItem.title, "Captured memo updated expanded");
    assert.equal(aiExpansion.body.suggestions[0].status, "pending");

    const aiSuggestions = await authedJson(baseUrl, "/api/work-items/work-item-1/ai-suggestions");
    assert.equal(aiSuggestions.response.status, 200);
    assert.equal(aiSuggestions.body.suggestions[0].id, "suggestion-1");

    const acceptedSuggestion = await authedJson(baseUrl, "/api/ai-suggestions/suggestion-1/accept", {
      method: "POST",
      body: JSON.stringify({})
    });
    assert.equal(acceptedSuggestion.response.status, 200);
    assert.equal(acceptedSuggestion.body.workItem.workflowState, "memo");

    const dismissedSuggestion = await authedJson(baseUrl, "/api/ai-suggestions/suggestion-2/dismiss", {
      method: "POST",
      body: JSON.stringify({})
    });
    assert.equal(dismissedSuggestion.response.status, 200);
    assert.equal(dismissedSuggestion.body.suggestion.status, "dismissed");

    const missingWorkItem = await authedJson(baseUrl, "/api/work-items/missing");
    assert.equal(missingWorkItem.response.status, 404);
    assert.equal(missingWorkItem.body.error.code, "not_found");

    const formMemo = await authedJson(baseUrl, "/api/source-memos/form", {
      method: "POST",
      body: JSON.stringify({
        projectId: "project-1",
        title: "Capture this",
        body: "Useful memo body"
      })
    });
    assert.equal(formMemo.response.status, 200);
    assert.equal(formMemo.body.result.sourceMemoId, "source-memo-1");
    assert.equal(formMemo.body.result.workItem.workflowState, "memo");

    const uploadSession = await authedJson(baseUrl, "/api/imports/upload-sessions", {
      method: "POST",
      body: JSON.stringify({
        machineId: "machine-1",
        watchFolderId: "watch-1",
        sourceType: "watched_text_file",
        originalFilename: "memo.md",
        originalPath: "/watched/memo.md",
        originalFileModifiedAt,
        mimeType: "text/markdown",
        byteSize: 10,
        contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
    });
    assert.equal(uploadSession.response.status, 200);
    assert.equal(uploadSession.body.status, "upload_required");

    const uploadArtifact = await authedJson(baseUrl, "/api/imports/upload-sessions/upload-session-1/artifact", {
      method: "PUT",
      body: "memo body"
    });
    assert.equal(uploadArtifact.response.status, 200);
    assert.equal(uploadArtifact.body.status, "uploaded");

    const finalizedImport = await authedJson(
      baseUrl,
      "/api/imports/upload-sessions/upload-session-1/finalize",
      {
        method: "POST",
        body: JSON.stringify({ machineId: "machine-1", archivePlanned: true })
      }
    );
    assert.equal(finalizedImport.response.status, 200);
    assert.equal(finalizedImport.body.initialWorkflowState, "needs_review");

    const audioUploadSession = await authedJson(baseUrl, "/api/imports/upload-sessions", {
      method: "POST",
      body: JSON.stringify({
        machineId: "machine-1",
        watchFolderId: "watch-1",
        sourceType: "watched_audio_file",
        originalFilename: "memo.m4a",
        originalPath: "/watched/memo.m4a",
        originalFileModifiedAt,
        mimeType: "audio/mp4",
        byteSize: 5,
        contentHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      })
    });
    assert.equal(audioUploadSession.response.status, 200);
    assert.equal(audioUploadSession.body.status, "upload_required");

    const archiveResult = await authedJson(baseUrl, "/api/imports/import-event-1/archive-result", {
      method: "POST",
      body: JSON.stringify({
        machineId: "machine-1",
        archivePath: "/archive/2026/05/30/uploaded.md",
        status: "archived",
        warning: null
      })
    });
    assert.equal(archiveResult.response.status, 200);
    assert.equal(archiveResult.body.status, "imported");
  } finally {
    server.close();
    await services.close();
  }
});

function stubServices(): AppServices {
  return {
    ai: {
      listSuggestions: async () => ({ suggestions: [] }),
      expandWorkItem: async () => {
        throw new Error("not used");
      },
      acceptSuggestion: async () => {
        throw new Error("not used");
      },
      dismissSuggestion: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["ai"],
    audit: {
      list: async () => []
    } as unknown as AppServices["audit"],
    artifacts: {
      download: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["artifacts"],
    auth: {
      authenticateAuthorizationHeader: async () => {
        throw new HttpError(401, "unauthorized", "Missing bearer token.");
      },
      createLocalDevSession: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["auth"],
    catalog: {
      listProjects: async () => [],
      deleteProject: async () => null
    } as unknown as AppServices["catalog"],
    diagnostics: {
      getWorkItemDiagnostics: async () => ({ workItemId: "missing" }),
      listProviderHealth: async () => ({ providers: [] }),
      getSystemDiagnostics: async () => ({})
    } as unknown as AppServices["diagnostics"],
    exports: {
      listAcceptedSnapshots: async () => ({ snapshots: [] }),
      listBatches: async () => ({ batches: [] }),
      createBatch: async () => {
        throw new Error("not used");
      },
      getBatch: async () => {
        throw new Error("not used");
      },
      downloadBundle: async () => {
        throw new Error("not used");
      },
      generateBatch: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["exports"],
    formMemos: {} as unknown as AppServices["formMemos"],
    imports: {
      createUploadSession: async () => {
        throw new Error("not used");
      },
      uploadSessionArtifact: async () => {
        throw new Error("not used");
      },
      finalizeUploadSession: async () => {
        throw new Error("not used");
      },
      reportArchiveResult: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["imports"],
    jobs: {
      list: async () => ({ jobs: [] }),
      get: async () => {
        throw new Error("not used");
      },
      retry: async () => {
        throw new Error("not used");
      },
      cancel: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["jobs"],
    settings: {
      getSummary: async () => ({ providers: [], aiTasks: [], appLauncher: null }),
      updateExtraction: async () => {
        throw new Error("not used");
      },
      updateTranscription: async () => {
        throw new Error("not used");
      },
      updateFileType: async () => {
        throw new Error("not used");
      },
      createFileType: async () => {
        throw new Error("not used");
      },
      updateProvider: async () => {
        throw new Error("not used");
      },
      createProvider: async () => {
        throw new Error("not used");
      },
      createAiTaskDefinition: async () => {
        throw new Error("not used");
      },
      updateAiTaskDefinition: async () => {
        throw new Error("not used");
      },
      updateAiTaskRoute: async () => {
        throw new Error("not used");
      },
      createPromptVersion: async () => {
        throw new Error("not used");
      },
      updateCurrentPrompt: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["settings"],
    tags: {
      listSuppressed: async () => ({ suppressedTags: [] }),
      suppress: async () => {
        throw new Error("not used");
      },
      unsuppress: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["tags"],
    workflows: {
      getStatus: async () => ({ active: null, supportedHookHandlers: [] }),
      getBuckets: async () => ({ buckets: [] }),
      getAllowedActions: async () => ({ workItemId: "missing", workflowState: "memo", actions: [] }),
      importBundle: async () => {
        throw new Error("not used");
      },
      activateStagedImport: async () => {
        throw new Error("not used");
      },
      executeAction: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["workflows"],
    workItems: {
      list: async () => [],
      findById: async () => null,
      getTagSuggestions: async () => ({ workItemId: "missing", suggestions: { strong: [], related: [], weak: [] } }),
      recoverTranscript: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["workItems"],
    close: async () => undefined
  };
}

function captureRouteServices(): AppServices {
  const user = {
    id: "user-1",
    oidcIssuer: "memo-capture-local-dev",
    oidcSubject: "local-dev-user",
    email: "dev@example.test",
    displayName: "Dev User",
    firstSeenAt: "2026-05-29T00:00:00.000Z",
    lastSeenAt: "2026-05-29T00:00:00.000Z",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  const project = {
    id: "project-1",
    slug: "memo-capture",
    name: "Memo Capture",
    description: "",
    isActive: true,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  const contributor = {
    id: "contributor-1",
    displayName: "Paul Marshall",
    isActive: true,
    mergedIntoContributorId: null,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  let workItem = {
    id: "work-item-1",
    sourceMemoId: "source-memo-1",
    projectId: "project-1",
    contributorText: "Paul",
    contributorId: "contributor-1",
    title: "Captured memo",
    body: "Useful memo body",
    tags: ["capture-api"],
    tagsAvailable: true,
    bodyFormat: "markdown",
    workflowState: "memo",
    workflowItemVersion: 1,
    acceptedSnapshotId: null,
    acceptedUnexportedChanges: false,
    originalFileModifiedAt,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  let suggestionOne: AiSuggestionRecord = {
    id: "suggestion-1",
    parentWorkItemId: "work-item-1",
    status: "pending",
    title: "Captured memo updated acceptance criteria",
    body: "Define acceptance criteria.",
    tags: ["acceptance-criteria"],
    rationale: "Acceptance criteria make the idea easier to review.",
    promptVersionId: "prompt-version-1",
    providerName: "local-dev",
    modelName: "memo-capture-local-dev-expander-v1",
    validationResult: { ok: true },
    appliedWorkItemId: null,
    createdAt: "2026-05-29T00:06:00.000Z",
    appliedAt: null,
    dismissedAt: null
  };
  let suggestionTwo = {
    ...suggestionOne,
    id: "suggestion-2",
    title: "Captured memo updated rollout notes"
  };
  let fileTypeCapabilityState = "active";
  let promptActiveVersion = 1;
  let promptContextConfig = {
    freeformText: "Return strict JSON.",
    includeProjectSynopsis: true,
    includeMemoMetadata: true,
    includeMemoTranscriptText: true
  };
  let suppressedTags: { normalizedName: string; displayName: string; createdAt: string; updatedAt: string }[] = [];

  return {
    ai: {
      listSuggestions: async () => ({ suggestions: [suggestionOne, suggestionTwo] }),
      expandWorkItem: async () => ({
        expandedWorkItem: {
          title: `${workItem.title} expanded`,
          body: `${workItem.body}\n\nExpansion focus: clarify value.`,
          tags: ["ai-expanded"]
        },
        suggestions: [suggestionOne],
        providerName: "local-dev",
        modelName: "memo-capture-local-dev-expander-v1",
        validation: { ok: true, strictJson: true }
      }),
      acceptSuggestion: async () => {
        const createdWorkItem = {
          ...workItem,
          id: "work-item-ai-1",
          sourceMemoId: "source-memo-ai-1",
          title: suggestionOne.title,
          body: suggestionOne.body,
          workflowItemVersion: 1
        };
        suggestionOne = {
          ...suggestionOne,
          status: "applied",
          appliedWorkItemId: createdWorkItem.id,
          appliedAt: "2026-05-29T00:07:00.000Z"
        };
        return { suggestion: suggestionOne, workItem: createdWorkItem };
      },
      dismissSuggestion: async () => {
        suggestionTwo = {
          ...suggestionTwo,
          status: "dismissed",
          dismissedAt: "2026-05-29T00:08:00.000Z"
        };
        return { suggestion: suggestionTwo };
      }
    } as unknown as AppServices["ai"],
    audit: {
      list: async () => [
        {
          id: "audit-1",
          eventName: "provider_config.updated",
          actorUserId: "user-1",
          actorEmailSnapshot: "dev@example.test",
          actorDisplayNameSnapshot: "Dev User",
          subjectType: "provider_config",
          subjectId: "provider-1",
          requestId: "request-1",
          jobId: null,
          sourceMemoId: null,
          workItemId: null,
          metadata: { providerName: "local-dev" },
          redactionApplied: true,
          createdAt: "2026-05-29T00:06:00.000Z"
        }
      ]
    } as unknown as AppServices["audit"],
    artifacts: {
      download: async () => ({
        filename: "memo.m4a",
        contentType: "audio/mp4",
        body: Buffer.from("audio")
      })
    } as unknown as AppServices["artifacts"],
    auth: {
      authenticateAuthorizationHeader: async (header: string | undefined) => {
        if (header !== "Bearer test-token") {
          throw new HttpError(401, "unauthorized", "Missing bearer token.");
        }

        return {
          user,
          authMode: "local-dev",
          isAdmin: true
        };
      },
      createLocalDevSession: async () => ({
        user,
        authMode: "local-dev",
        isAdmin: true,
        accessToken: "test-token"
      })
    } as unknown as AppServices["auth"],
    catalog: {
      listProjects: async () => [project],
      createProject: async () => project,
      updateProject: async () => project,
      deactivateProject: async () => ({ ...project, isActive: false }),
      deleteProject: async () => project,
      listContributors: async () => [contributor],
      createContributor: async () => contributor,
      updateContributor: async () => contributor,
      deactivateContributor: async () => ({ ...contributor, isActive: false })
    } as unknown as AppServices["catalog"],
    exports: {
      listAcceptedSnapshots: async () => ({
        snapshots: [
          {
            acceptedSnapshotId: "snapshot-1",
            workItemId: "work-item-1",
            title: "Captured memo",
            project: { id: "project-1", slug: "memo-capture", name: "Memo Capture" },
            contributor: { id: "contributor-1", text: "Paul" },
            alreadyExported: false,
            defaultChecked: true,
            currentForWorkItem: true,
            snapshotCreatedAt: "2026-05-29T00:02:00.000Z"
          }
        ]
      }),
      listBatches: async () => ({ batches: [] }),
      createBatch: async () => ({
        exportBatchId: "export-batch-1",
        schemaVersion: "memo-capture-export.v1",
        status: "pending",
        jobId: "job-1"
      }),
      getBatch: async (exportBatchId: string) => ({
        batch: {
          id: exportBatchId,
          schemaVersion: "memo-capture-export.v1",
          status: "pending",
          createdBy: "user-1",
          filterContext: {},
          options: {},
          manifestArtifactId: null,
          jsonlArtifactId: null,
          combinedMarkdownArtifactId: null,
          bundleArtifactId: null,
          createdAt: "2026-05-29T00:03:00.000Z",
          completedAt: null,
          failedAt: null,
          errorCode: null,
          errorMessage: null,
          itemCount: 1
        },
        items: []
      }),
      downloadBundle: async () => ({
        filename: "export-export-batch-1.zip",
        contentType: "application/zip",
        body: Buffer.from("zip")
      }),
      generateBatch: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["exports"],
    diagnostics: {
      getWorkItemDiagnostics: async (workItemId: string) => ({
        workItemId,
        sourceMemo: { id: "source-memo-1", sourceType: "form" },
        importEvents: [],
        artifacts: [],
        jobs: [],
        possibleDuplicates: [],
        archiveWarnings: []
      }),
      listProviderHealth: async () => ({ providers: [] }),
      getSystemDiagnostics: async () => ({
        api: { service: "memo-capture-api", version: "0.1.0", commitSha: "test-sha" },
        database: { ok: true },
        worker: null,
        providers: { providers: [] },
        exportSchemaVersion: "memo-capture-export.v1"
      })
    } as unknown as AppServices["diagnostics"],
    formMemos: {
      createFromRequest: async () => ({
        sourceMemoId: "source-memo-1",
        workItem
      })
    } as unknown as AppServices["formMemos"],
    imports: {
      createUploadSession: async () => ({
        sessionId: "upload-session-1",
        status: "upload_required",
        upload: {
          method: "PUT",
          url: "/api/imports/upload-sessions/upload-session-1/artifact",
          headers: { "content-type": "application/octet-stream" }
        }
      }),
      uploadSessionArtifact: async () => ({ sessionId: "upload-session-1", status: "uploaded" }),
      finalizeUploadSession: async () => ({
        sourceMemoId: "source-memo-1",
        workItemId: "work-item-1",
        artifactId: "artifact-1",
        importEventId: "import-event-1",
        initialWorkflowState: "needs_review",
        processingJobs: ["job-1"]
      }),
      reportArchiveResult: async () => ({
        importEventId: "import-event-1",
        status: "imported",
        archivePath: "/archive/2026/05/30/uploaded.md"
      })
    } as unknown as AppServices["imports"],
    jobs: {
      list: async () => ({
        jobs: [
          {
            id: "job-1",
            jobKind: "generate_export_batch",
            status: "failed",
            attemptCount: 1,
            maxAttempts: 1,
            runAfter: "2026-05-29T00:00:00.000Z",
            sourceMemoId: null,
            workItemId: "work-item-1",
            exportBatchId: "export-batch-1",
            providerName: null,
            modelName: null,
            userSafeErrorMessage: "The job failed."
          }
        ]
      }),
      get: async (jobId: string) => ({
        job: {
          id: jobId,
          jobKind: "generate_export_batch",
          status: "failed",
          attemptCount: 1,
          maxAttempts: 1,
          runAfter: "2026-05-29T00:00:00.000Z",
          sourceMemoId: null,
          workItemId: "work-item-1",
          exportBatchId: "export-batch-1"
        }
      }),
      retry: async (jobId: string) => ({
        job: {
          id: jobId,
          jobKind: "generate_export_batch",
          status: "queued",
          attemptCount: 1,
          maxAttempts: 2
        }
      }),
      cancel: async (jobId: string) => ({
        job: {
          id: jobId,
          jobKind: "generate_export_batch",
          status: "cancelled",
          cancelRequestedAt: "2026-05-29T00:04:00.000Z"
        }
      })
    } as unknown as AppServices["jobs"],
    settings: {
      getSummary: async () => ({
        mediaTypes: [
          {
            id: "media-text",
            mediaKey: "text",
            displayName: "Text",
            description: "Text files",
            capabilityState: "active",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ],
        parserTypes: [
          {
            id: "parser-markdown",
            parserKey: "markdown",
            displayName: "Markdown",
            description: "Markdown parser",
            mediaKey: "text",
            capabilityState: "active",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ],
        fileTypes: [
          {
            id: "file-type-md",
            extension: ".md",
            mediaKind: "text",
            capabilityState: fileTypeCapabilityState,
            parserKey: "markdown",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ],
        extraction: {
          projectConfidenceThreshold: 0.7,
          contributorConfidenceThreshold: 0.7,
          tagConfidenceThreshold: 0.7,
          updatedAt: "2026-05-29T00:00:00.000Z"
        },
        transcription: {
          maxRetryAttempts: 3,
          runtimeProvider: "disabled",
          runtimeModelName: "memo-capture-local-dev-transcriber-v1",
          updatedAt: "2026-05-29T00:00:00.000Z"
        },
        providers: [
          {
            id: "provider-1",
            providerKind: "llm",
            providerName: "local-dev",
            displayName: "Local development",
            adapterKey: "local-dev",
            enabled: false,
            endpointConfigured: false,
            modelName: "memo-capture-local-dev-expander-v1",
            secretSource: "environment",
            requiredSecretEnv: null,
            externalSendEnabled: false,
            secretConfigured: true,
            healthStatus: "unknown",
            runtimeProvider: "local-dev",
            runtimeModelName: "memo-capture-local-dev-expander-v1",
            lastHealthCheckAt: null,
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ],
        taskKinds: [
          {
            id: "task-kind-llm",
            kindKey: "llm",
            displayName: "LLM generation",
            description: "Structured generation",
            providerKind: "llm",
            capabilityKey: "structured-generation",
            promptFieldsEnabled: true,
            enabled: true,
            active: true,
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ],
        aiTasks: [
          {
            id: "task-1",
            taskKey: "memo-expansion",
            displayName: "Memo expansion",
            description: "Expand one memo.",
            hookKey: "memo-expansion",
            taskKind: "llm",
            hookImplemented: true,
            routeEnabled: true,
            runtimeOptionId: "llm-runtime",
            runtimeOptionPurpose: "llm-runtime",
            runtimeProviderEnv: "LLM_PROVIDER",
            runtimeModelEnv: "LLM_MODEL",
            runtimeEndpointEnv: "LLM_ENDPOINT",
            selectedProviderId: "provider-1",
            selectedProviderName: "local-dev",
            selectedProviderDisplayName: "Local development",
            selectedModelName: "memo-capture-local-dev-expander-v1",
            providerAdapterKey: "local-dev",
            providerExternalSendEnabled: false,
            providerSecretEnv: null,
            runtimeProvider: "local-dev",
            runtimeModelName: "memo-capture-local-dev-expander-v1",
            runtimeEndpointConfigured: false,
            runtimeReady: true,
            unavailableReason: null,
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ],
        appLauncher: {
          manifestVersion: "1.2.0",
          minLauncherVersion: "1.2.0",
          runtimeOptionsPresent: true,
          nativeLaunchTarget: "executablePath",
          secretEnvironmentNames: [],
          llmRuntime: {
            provider: "local-dev",
            modelName: "memo-capture-local-dev-expander-v1",
            endpointConfigured: false,
            ready: true
          },
          restartRequiredAfterChange: true
        },
        prompts: [
          {
            id: "prompt-1",
            name: "work_item_expansion",
            purpose: "Expand work items.",
            activeVersion: promptActiveVersion,
            activePromptVersionId: "prompt-version-1",
            body: promptContextConfig.freeformText,
            outputSchema: {},
            contextConfig: promptContextConfig,
            retentionPolicy: "retain_active_and_referenced",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ],
        auth: { mode: "local-dev", oidcConfigured: false }
      }),
      createTaskKind: async (body: unknown) => {
        const record = body as {
          displayName: string;
          description?: string | null;
          providerKind: string;
          capabilityKey: string;
          promptFieldsEnabled: boolean;
          enabled: boolean;
        };
        return {
          taskKind: {
            id: "task-kind-image-enrichment",
            kindKey: "image-enrichment",
            displayName: record.displayName,
            description: record.description ?? null,
            providerKind: record.providerKind,
            capabilityKey: record.capabilityKey,
            promptFieldsEnabled: record.promptFieldsEnabled,
            enabled: record.enabled,
            active: true,
            updatedAt: "2026-05-29T00:06:00.000Z"
          }
        };
      },
      updateTaskKind: async (id: string, body: unknown) => {
        const record = body as { enabled?: boolean };
        return {
          taskKind: {
            id,
            kindKey: "image-enrichment",
            displayName: "Image enrichment",
            description: "Image enrichment tasks",
            providerKind: "llm",
            capabilityKey: "structured-generation",
            promptFieldsEnabled: true,
            enabled: record.enabled ?? true,
            active: true,
            updatedAt: "2026-05-29T00:07:00.000Z"
          }
        };
      },
      createMediaType: async (body: unknown) => ({ mediaType: body }),
      updateMediaType: async (_id: string, body: unknown) => ({ mediaType: body }),
      deleteMediaType: async (id: string) => ({ deleted: true, mediaType: { id } }),
      createParserType: async (body: unknown) => ({ parserType: body }),
      updateParserType: async (_id: string, body: unknown) => ({ parserType: body }),
      deleteParserType: async (id: string) => ({ deleted: true, parserType: { id } }),
      updateExtraction: async () => ({ extraction: { projectConfidenceThreshold: 0.8 } }),
      updateTranscription: async () => ({ transcription: { maxRetryAttempts: 4 } }),
      updateFileType: async () => {
        fileTypeCapabilityState = "inactive";
        return {
          fileType: {
            id: "file-type-md",
            extension: ".md",
            mediaKind: "text",
            capabilityState: fileTypeCapabilityState,
            parserKey: "markdown",
            updatedAt: "2026-05-29T00:06:00.000Z"
          }
        };
      },
      createFileType: async (body: unknown) => {
        const record = body as {
          extension: string;
          mediaKind: string;
          capabilityState: string;
          parserKey: string | null;
        };
        return {
          fileType: {
            id: "file-type-html",
            extension: record.extension,
            mediaKind: record.mediaKind,
            capabilityState: record.capabilityState,
            parserKey: record.parserKey,
            updatedAt: "2026-05-29T00:06:00.000Z"
          }
        };
      },
      deleteFileType: async (id: string) => ({ deleted: true, fileType: { id } }),
      updateProvider: async () => ({
        provider: {
          id: "provider-1",
          providerKind: "llm",
          providerName: "local-dev",
          enabled: true,
          endpointConfigured: false,
          modelName: "memo-capture-local-dev-expander-v1",
          secretSource: "environment",
          secretConfigured: true,
          healthStatus: "unknown",
          runtimeProvider: "local-dev",
          runtimeModelName: "memo-capture-local-dev-expander-v1",
          lastHealthCheckAt: null,
          updatedAt: "2026-05-29T00:06:00.000Z"
        }
      }),
      createProvider: async () => ({
        provider: {
          id: "provider-new",
          providerKind: "llm",
          providerName: "openai-compatible",
          displayName: "OpenAI-compatible",
          enabled: false
        }
      }),
      updateAiTaskDefinition: async () => ({
        aiTask: {
          id: "task-1",
          taskKey: "memo-expansion",
          displayName: "Memo expansion",
          runtimeReady: true
        }
      }),
      updateAiTaskRoute: async () => ({
        aiTask: {
          id: "task-1",
          taskKey: "memo-expansion",
          displayName: "Memo expansion",
          runtimeReady: true
        }
      }),
      createAiTaskDefinition: async () => ({
        aiTask: {
          id: "task-custom-summary",
          taskKey: "custom-summary",
          displayName: "Custom summary",
          hookKey: "custom-summary",
          hookImplemented: false,
          routeEnabled: false,
          runtimeReady: false,
          unavailableReason: "No app logic is registered for this hook."
        }
      }),
      createPromptVersion: async (_promptDefinitionId: string, body: unknown) => {
        const record = body as typeof promptContextConfig;
        promptActiveVersion = 2;
        promptContextConfig = {
          freeformText: record.freeformText,
          includeProjectSynopsis: record.includeProjectSynopsis,
          includeMemoMetadata: record.includeMemoMetadata,
          includeMemoTranscriptText: record.includeMemoTranscriptText
        };
        return {
          prompt: {
            id: "prompt-1",
            name: "work_item_expansion",
            activeVersion: promptActiveVersion,
            body: promptContextConfig.freeformText,
            outputSchema: {},
            contextConfig: promptContextConfig
          }
        };
      },
      updateCurrentPrompt: async (_promptDefinitionId: string, body: unknown) => {
        const record = body as typeof promptContextConfig;
        promptContextConfig = {
          freeformText: record.freeformText,
          includeProjectSynopsis: record.includeProjectSynopsis,
          includeMemoMetadata: record.includeMemoMetadata,
          includeMemoTranscriptText: record.includeMemoTranscriptText
        };
        return {
          prompt: {
            id: "prompt-1",
            name: "work_item_expansion",
            activeVersion: promptActiveVersion,
            body: promptContextConfig.freeformText,
            outputSchema: {},
            contextConfig: promptContextConfig
          }
        };
      }
    } as unknown as AppServices["settings"],
    tags: {
      listSuppressed: async () => ({ suppressedTags }),
      suppress: async (body: unknown) => {
        const record = body as { name?: string };
        const displayName = String(record.name ?? "").trim().replace(/\s+/g, " ");
        const normalizedName = displayName.toLowerCase();
        const existing = suppressedTags.find((tag) => tag.normalizedName === normalizedName);
        if (existing !== undefined) {
          return { suppressedTag: existing };
        }
        const suppressedTag = {
          normalizedName,
          displayName,
          createdAt: "2026-05-29T00:08:00.000Z",
          updatedAt: "2026-05-29T00:08:00.000Z"
        };
        suppressedTags = [...suppressedTags, suppressedTag].sort((left, right) =>
          left.displayName.localeCompare(right.displayName)
        );
        return { suppressedTag };
      },
      unsuppress: async (normalizedName: string) => {
        const index = suppressedTags.findIndex((tag) => tag.normalizedName === normalizedName);
        if (index === -1) {
          return { suppressedTag: null };
        }
        const [suppressedTag] = suppressedTags.splice(index, 1);
        return { suppressedTag };
      }
    } as unknown as AppServices["tags"],
    workflows: {
      getStatus: async () => ({
        active: {
          workflowId: "memo-capture_workflow",
          workflowVersion: "0.2.2",
          stateMachineVersion: "0.2.2",
          contentHash: "sha256:test",
          activatedAt: "2026-05-29T00:00:00.000Z"
        },
        supportedHookHandlers: ["create_accepted_snapshot"]
      }),
      getBuckets: async () => ({
        buckets: [{ id: "memos", label: "Memos", order: 20, states: ["memo"] }]
      }),
      getDebuggerSnapshot: () => ({
        state: "paused",
        stepMode: true,
        events: [
          {
            eventId: "debug-event-1",
            sequence: 1,
            eventType: "debug_start",
            severity: "debug",
            message: "Debugger started in step mode.",
            occurredAt: "2026-05-29T00:00:00.000Z"
          }
        ],
        views: {
          transitions: [],
          actions: [],
          handlers: [],
          handlerResponses: [],
          recordEvents: [],
          stateHooks: [],
          failures: [],
          debugSteps: [
            {
              eventId: "debug-event-1",
              sequence: 1,
              eventType: "debug_start",
              severity: "debug",
              message: "Debugger started in step mode.",
              occurredAt: "2026-05-29T00:00:00.000Z"
            }
          ]
        }
      }),
      startDebugger: async () => ({
        state: "paused",
        stepMode: true,
        events: [],
        views: {
          transitions: [],
          actions: [],
          handlers: [],
          handlerResponses: [],
          recordEvents: [],
          stateHooks: [],
          failures: [],
          debugSteps: []
        }
      }),
      resumeDebugger: async () => ({
        state: "running",
        stepMode: true,
        events: [],
        views: {
          transitions: [],
          actions: [],
          handlers: [],
          handlerResponses: [],
          recordEvents: [],
          stateHooks: [],
          failures: [],
          debugSteps: []
        }
      }),
      pauseDebugger: async () => ({
        state: "paused",
        stepMode: true,
        events: [],
        views: {
          transitions: [],
          actions: [],
          handlers: [],
          handlerResponses: [],
          recordEvents: [],
          stateHooks: [],
          failures: [],
          debugSteps: []
        }
      }),
      stepDebugger: async () => ({
        state: "paused",
        stepMode: true,
        events: [],
        views: {
          transitions: [],
          actions: [],
          handlers: [],
          handlerResponses: [],
          recordEvents: [],
          stateHooks: [],
          failures: [],
          debugSteps: []
        }
      }),
      stopDebugger: async () => ({
        state: "stopped",
        stepMode: true,
        events: [],
        views: {
          transitions: [],
          actions: [],
          handlers: [],
          handlerResponses: [],
          recordEvents: [],
          stateHooks: [],
          failures: [],
          debugSteps: []
        }
      }),
      getAllowedActions: async (workItemId: string) => ({
        workItemId,
        workflowState: "memo",
        actions: [
          {
            id: "memo.accepted",
            label: "Accept",
            visible: true,
            trigger: "user",
            requiresInput: false,
            confirmationRequired: false
          }
        ]
      }),
      executeAction: async (workItemId: string, actionId: string) => ({
        workItemId,
        actionId,
        previousState: "memo",
        newState: "accepted",
        newVersion: 2,
        createdSnapshotId: "snapshot-1",
        allowedActions: []
      }),
      importBundle: async () => ({
        stagedImportId: "workflow-import-1",
        status: "staged",
        validation: { ok: true, warnings: [], errors: [], identity: null },
        identity: null
      }),
      activateStagedImport: async () => ({
        activated: true,
        activeWorkflowVersion: "0.2.2",
        contentHash: "sha256:test"
      })
    } as unknown as AppServices["workflows"],
    workItems: {
      list: async () => [workItem],
      findById: async (workItemId: string) => (workItemId === workItem.id ? workItem : null),
      getTagSuggestions: async () => ({
        workItemId: workItem.id,
        suggestions: {
          strong: ["capture workflow"],
          related: ["review queue"],
          weak: ["local dev"]
        }
      }),
      update: async (_workItemId: string, body: unknown) => {
        const record = body as { expectedVersion?: number };
        if (record.expectedVersion !== workItem.workflowItemVersion) {
          throw new HttpError(409, "stale_work_item_version", "Work item version is stale.", {
            currentVersion: workItem.workflowItemVersion,
            workItem
          });
        }

        workItem = {
          ...workItem,
          title: "Captured memo updated",
          body: "Updated memo body",
          workflowItemVersion: 2,
          updatedAt: "2026-05-29T00:01:00.000Z"
        };
        return workItem;
      },
      recoverTranscript: async (_workItemId: string, body: unknown) => {
        const record = body as { transcriptText?: string };
        workItem = {
          ...workItem,
          body: record.transcriptText ?? workItem.body,
          workflowItemVersion: workItem.workflowItemVersion + 1,
          updatedAt: "2026-05-29T00:05:00.000Z"
        };
        return workItem;
      }
    } as unknown as AppServices["workItems"],
    close: async () => undefined
  };
}

async function authedJson(
  baseUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<{ response: Response; body: Record<string, any> }> {
  const headers = new Headers(init.headers);
  headers.set("authorization", "Bearer test-token");
  headers.set("content-type", "application/json");

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  });

  return {
    response,
    body: (await response.json()) as Record<string, any>
  };
}

class FakeDatabase implements Database {
  readonly users: FakeUserRow[] = [];
  readonly mediaTypes: Record<string, unknown>[] = [];
  readonly parserTypes: Record<string, unknown>[] = [];
  readonly fileTypes: Record<string, unknown>[] = [];
  readonly providers: Record<string, unknown>[] = [];
  readonly providerCapabilities: Record<string, unknown>[] = [];
  readonly taskKinds: Record<string, unknown>[] = [];
  readonly aiTaskDefinitions: Record<string, unknown>[] = [];
  readonly aiTaskRoutes: Record<string, unknown>[] = [];
  readonly promptDefinitions: Record<string, unknown>[] = [];
  readonly promptVersions: Record<string, unknown>[] = [];
  readonly importUploadSessions: Record<string, unknown>[] = [];
  readonly sourceMemos: Record<string, unknown>[] = [];
  readonly sourceMemoArtifacts: Record<string, unknown>[] = [];
  readonly artifacts: Record<string, unknown>[] = [];
  readonly workItems: Record<string, unknown>[] = [];
  readonly projects: Record<string, unknown>[] = [];
  readonly contributors: Record<string, unknown>[] = [];
  readonly importEvents: Record<string, unknown>[] = [];
  readonly processingJobs: Record<string, unknown>[] = [];
  readonly auditEvents: Record<string, unknown>[] = [];
  readonly tags: Record<string, unknown>[] = [];
  readonly workItemTags: Record<string, unknown>[] = [];
  readonly projectTags: Record<string, unknown>[] = [];
  readonly suppressedTags: Record<string, unknown>[] = [];
  readonly aiSuggestions: Record<string, unknown>[] = [];
  activeWorkflow: Record<string, unknown> | null = null;
  extractionSettings: Record<string, unknown> | null = {
    project_confidence_threshold: 0.65,
    contributor_confidence_threshold: 0.7,
    tag_confidence_threshold: 0.7,
    updated_at: "2026-05-29T00:00:00.000Z"
  };

  async transaction<Result>(operation: (client: Queryable) => Promise<Result>): Promise<Result> {
    return operation(this);
  }

  async close(): Promise<void> {
    return undefined;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: QueryParams = []
  ): Promise<QueryResult<Row>> {
    if (text.includes("insert into app_users")) {
      const existing = this.users.find(
        (user) => user.oidc_issuer === values[1] && user.oidc_subject === values[2]
      );
      const user =
        existing ??
        ({
          id: String(values[0]),
          oidc_issuer: String(values[1]),
          oidc_subject: String(values[2]),
          email: values[3] === null ? null : String(values[3]),
          display_name: values[4] === null ? null : String(values[4]),
          first_seen_at: "2026-05-29T00:00:00.000Z",
          last_seen_at: "2026-05-29T00:00:00.000Z",
          created_at: "2026-05-29T00:00:00.000Z",
          updated_at: "2026-05-29T00:00:00.000Z"
        } satisfies FakeUserRow);

      if (existing === undefined) {
        this.users.push(user);
      }

      return rows([user] as unknown as Row[]);
    }

    if (text.includes("from workflow_active_definition")) {
      return rows(this.activeWorkflow === null ? [] : [this.activeWorkflow as Row]);
    }

    if (text.includes("from extraction_settings")) {
      return rows(this.extractionSettings === null ? [] : [this.extractionSettings as Row]);
    }

    if (text.includes("from provider_capabilities") && text.includes("where provider_config_id =")) {
      const capability = this.providerCapabilities.find(
        (row) => row.provider_config_id === values[0] && row.capability_key === values[1] && row.enabled === true
      );
      return rows(capability === undefined ? [] : [capability as Row]);
    }

    if (text.includes("from provider_capabilities")) {
      return rows([...this.providerCapabilities] as Row[]);
    }

    if (text.includes("from task_kinds") && text.includes("where lower(kind_key)")) {
      const kindKey = String(values[0]).toLowerCase();
      const taskKind = this.taskKinds.find((row) => String(row.kind_key).toLowerCase() === kindKey);
      return rows(taskKind === undefined ? [] : [taskKind as Row]);
    }

    if (text.includes("from task_kinds") && text.includes("where id =")) {
      const taskKind = this.taskKinds.find((row) => row.id === values[0]);
      return rows(taskKind === undefined ? [] : [taskKind as Row]);
    }

    if (text.includes("from task_kinds")) {
      return rows([...this.taskKinds] as Row[]);
    }

    if (text.includes("insert into task_kinds")) {
      const row = {
        id: values[0],
        kind_key: values[1],
        display_name: values[2],
        description: values[3],
        provider_kind: values[4],
        capability_key: values[5],
        prompt_fields_enabled: values[6],
        enabled: values[7],
        active: true,
        created_by: values[8],
        updated_by: values[8],
        updated_at: "2026-05-29T00:00:00.000Z"
      };
      this.taskKinds.push(row);
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("update task_kinds")) {
      const row = this.taskKinds.find((taskKind) => taskKind.id === values[0]);
      if (row === undefined) {
        return rows([]);
      }
      if (values[1] === true) {
        row.display_name = values[2];
      }
      if (values[3] === true) {
        row.description = values[4];
      }
      if (values[5] === true) {
        row.provider_kind = values[6];
      }
      if (values[7] === true) {
        row.capability_key = values[8];
      }
      if (values[9] === true) {
        row.prompt_fields_enabled = values[10];
      }
      if (values[11] === true) {
        row.enabled = values[12];
      }
      if (values[13] === true) {
        row.active = values[14];
      }
      row.updated_by = values[15];
      row.updated_at = "2026-05-29T00:01:00.000Z";
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("select exists") && text.includes("from ai_task_definitions")) {
      const kindKey = String(values[0]).toLowerCase();
      const exists = this.aiTaskDefinitions.some(
        (definition) => String(definition.task_kind).toLowerCase() === kindKey && definition.implemented === true
      );
      return rows([{ exists }] as unknown as Row[]);
    }

    if (text.includes("insert into provider_configs")) {
      const row = {
        id: values[0],
        provider_kind: values[1],
        provider_name: values[2],
        display_name: values[3],
        adapter_key: values[4],
        enabled: values[5],
        endpoint: values[6],
        model_name: values[7],
        secret_source: "environment",
        required_secret_env: values[8],
        external_send_enabled: values[9],
        runtime_provider_env: null,
        runtime_model_env: null,
        runtime_endpoint_env: null,
        health_status: "unknown",
        last_health_check_at: null,
        created_by: values[10],
        updated_by: values[10],
        updated_at: "2026-05-29T00:00:00.000Z"
      };
      this.providers.push(row);
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("update provider_configs")) {
      const provider = this.providers.find((row) => row.id === values[0]);
      if (provider === undefined) {
        return rows([]);
      }
      if (values[1] === true) {
        provider.display_name = values[2];
      }
      if (values[3] !== null) {
        provider.enabled = values[3];
      }
      if (values[4] === true) {
        provider.endpoint = values[5];
      }
      if (values[6] === true) {
        provider.model_name = values[7];
      }
      if (values[8] === true) {
        provider.required_secret_env = values[9];
      }
      if (values[10] !== null) {
        provider.external_send_enabled = values[10];
      }
      provider.updated_by = values[11];
      provider.updated_at = "2026-05-29T00:01:00.000Z";
      return rows([provider] as unknown as Row[]);
    }

    if (text.includes("from provider_configs") && text.includes("where lower(provider_kind)")) {
      const providerKind = String(values[0]).toLowerCase();
      const providerName = String(values[1]).toLowerCase();
      const provider = this.providers.find(
        (row) =>
          String(row.provider_kind).toLowerCase() === providerKind &&
          String(row.provider_name).toLowerCase() === providerName
      );
      return rows(provider === undefined ? [] : [provider as Row]);
    }

    if (text.includes("from provider_configs") && text.includes("where id =")) {
      const provider = this.providers.find((row) => row.id === values[0]);
      return rows(provider === undefined ? [] : [provider as Row]);
    }

    if (text.includes("from provider_configs")) {
      return rows([...this.providers] as Row[]);
    }

    if (text.includes("delete from ai_task_definitions")) {
      const index = this.aiTaskDefinitions.findIndex((definition) => definition.id === values[0]);
      if (index === -1) {
        return rows([]);
      }
      const [definition] = this.aiTaskDefinitions.splice(index, 1);
      for (let routeIndex = this.aiTaskRoutes.length - 1; routeIndex >= 0; routeIndex -= 1) {
        if (this.aiTaskRoutes[routeIndex]?.task_definition_id === values[0]) {
          this.aiTaskRoutes.splice(routeIndex, 1);
        }
      }
      return rows([{ id: definition?.id }] as unknown as Row[]);
    }

    if (text.includes("from ai_task_definitions")) {
      const taskRows = this.aiTaskDefinitions.map((definition) =>
        buildFakeAiTaskRouteRow(this, definition)
      );
      if (text.includes("where ai_task_definitions.task_key =")) {
        return rows(taskRows.filter((row) => row.task_key === values[0]) as Row[]);
      }
      if (text.includes("where ai_task_definitions.id =")) {
        return rows(taskRows.filter((row) => row.id === values[0]) as Row[]);
      }
      return rows(taskRows as Row[]);
    }

    if (text.includes("insert into prompt_definitions")) {
      const row = {
        id: values[0],
        name: values[1],
        purpose: values[2],
        active_version: 1,
        retention_policy: "retain_active_and_referenced",
        created_by: values[3],
        updated_by: values[3],
        updated_at: "2026-05-29T00:00:00.000Z"
      };
      this.promptDefinitions.push(row);
      return rows([]);
    }

    if (text.includes("insert into prompt_versions")) {
      const initialVersionInsert = text.includes("values ($1, $2, 1, $3");
      this.promptVersions.push({
        id: values[0],
        prompt_definition_id: values[1],
        version: initialVersionInsert ? 1 : values[2] ?? 1,
        body: initialVersionInsert ? values[2] : values[3],
        output_schema: JSON.parse(String((initialVersionInsert ? values[3] : values[4]) ?? "{}")) as Record<
          string,
          unknown
        >,
        context_config: JSON.parse(String((initialVersionInsert ? values[4] : values[5]) ?? "{}")) as Record<
          string,
          unknown
        >,
        created_by: initialVersionInsert ? values[5] : values[6],
        created_at: "2026-05-29T00:00:00.000Z"
      });
      return rows([]);
    }

    if (text.includes("update prompt_versions")) {
      const version = this.promptVersions.find((row) => row.id === values[0]);
      if (version !== undefined) {
        version.body = values[1];
        version.output_schema = JSON.parse(String(values[2] ?? "{}")) as Record<string, unknown>;
        version.context_config = JSON.parse(String(values[3] ?? "{}")) as Record<string, unknown>;
      }
      return rows([]);
    }

    if (text.includes("from prompt_definitions") && text.includes("where prompt_definitions.id =")) {
      const definition = this.promptDefinitions.find((row) => row.id === values[0]);
      return rows(definition === undefined ? [] : [buildFakePromptRow(this, definition) as Row]);
    }

    if (text.includes("from prompt_definitions")) {
      return rows(this.promptDefinitions.map((definition) => buildFakePromptRow(this, definition)) as Row[]);
    }

    if (text.includes("insert into ai_task_definitions")) {
      this.aiTaskDefinitions.push({
        id: values[0],
        task_key: values[1],
        display_name: values[2],
        description: values[3],
        hook_key: values[4],
        task_kind: values[5],
        implemented: values[6],
        task_kind_id: values[7],
        prompt_definition_id: values[8],
        runtime_option_id: values[9],
        runtime_option_purpose: values[10],
        runtime_provider_env: values[11],
        runtime_model_env: values[12],
        runtime_endpoint_env: values[13],
        created_by: values[14],
        updated_by: values[14],
        updated_at: "2026-05-29T00:00:00.000Z"
      });
      return rows([]);
    }

    if (text.includes("update ai_task_definitions")) {
      const definition = this.aiTaskDefinitions.find((row) => row.id === values[0]);
      if (definition === undefined) {
        return rows([]);
      }
      if (values[1] === true) {
        definition.display_name = values[2];
      }
      if (values[3] === true) {
        definition.description = values[4];
      }
      if (values[5] === true) {
        definition.hook_key = values[6];
      }
      if (values[7] === true) {
        definition.task_kind = values[8];
      }
      if (values[9] === true) {
        definition.task_kind_id = values[10];
      }
      if (values[11] === true) {
        definition.implemented = values[12];
      }
      if (values[13] === true) {
        definition.prompt_definition_id = values[14];
      }
      definition.updated_by = values[15];
      definition.updated_at = "2026-05-29T00:01:00.000Z";
      return rows([]);
    }

    if (text.includes("insert into ai_task_routes")) {
      const existing = this.aiTaskRoutes.find((row) => row.task_definition_id === values[0]);
      const createDisabledRoute = text.includes("values ($1, null, null, false, $2");
      if (existing === undefined) {
        this.aiTaskRoutes.push({
          task_definition_id: values[0],
          provider_config_id: createDisabledRoute ? null : values[1],
          model_name: createDisabledRoute ? null : values[2],
          enabled: createDisabledRoute ? false : values[3] ?? false,
          updated_by: createDisabledRoute ? values[1] : values[4],
          updated_at: "2026-05-29T00:00:00.000Z"
        });
      } else {
        if (values[5] === true) {
          existing.provider_config_id = values[1];
        }
        if (values[6] === true) {
          existing.model_name = values[2] === "" ? null : values[2];
        }
        if (values[3] !== null) {
          existing.enabled = values[3];
        }
        existing.updated_by = values[4];
      }
      return rows([]);
    }

    if (text.includes("from ai_suggestions") && text.includes("where id = $1")) {
      return rows(
        this.aiSuggestions.filter((row) => row.id === values[0]).map((row) => row as Row)
      );
    }

    if (text.includes("update ai_suggestions") && text.includes("status = 'applied'")) {
      const suggestion = this.aiSuggestions.find((row) => row.id === values[0] && row.status === "pending");
      if (suggestion === undefined) {
        return rows<Row>([]);
      }
      suggestion.status = "applied";
      suggestion.applied_work_item_id = values[1];
      suggestion.applied_by = values[2];
      suggestion.applied_at = "2026-05-29T00:00:00.000Z";
      return rows([suggestion as Row]);
    }

    if (text.includes("insert into contributors")) {
      const contributorKey = values[2] === null ? null : String(values[2]);
      const existing =
        contributorKey === null ? undefined : this.contributors.find((row) => row.contributor_key === contributorKey);
      if (existing !== undefined) {
        return rows([existing as Row]);
      }
      const row = {
        id: values[0],
        display_name: values[1],
        contributor_key: values[2],
        is_active: true,
        merged_into_contributor_id: null,
        created_by: values[3],
        updated_by: values[3],
        created_at: "2026-05-29T00:00:00.000Z",
        updated_at: "2026-05-29T00:00:00.000Z"
      };
      this.contributors.push(row);
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("update contributors")) {
      const contributor = this.contributors.find((row) => row.id === values[0]);
      if (contributor !== undefined) {
        contributor.display_name = values[1];
        contributor.contributor_key = values[2];
        contributor.updated_by = values[3];
      }
      return rows(contributor === undefined ? [] : [contributor as Row]);
    }

    if (text.includes("from contributors")) {
      return rows([...this.contributors] as Row[]);
    }

    if (text.includes("insert into source_memos")) {
      this.sourceMemos.push({
        id: values[0],
        source_type: values[1],
        primary_artifact_id: values[2],
        original_text: values[3],
        extracted_text: values[4],
        current_transcript_text: values[5],
        content_hash: values[6],
        original_path: values[7],
        archive_path: values[8],
        original_file_modified_at: values[9],
        contributor_text: values[10],
        contributor_id: values[11]
      });
      return rows([]);
    }

    if (text.includes("insert into artifacts")) {
      this.artifacts.push({
        id: values[0],
        artifact_kind: values[1],
        object_key: values[2],
        bucket: values[3],
        original_filename: values[4],
        mime_type: values[5],
        byte_size: values[6],
        content_hash: values[7],
        layout_version: values[8],
        created_by: values[9],
        created_at: "2026-05-29T00:00:00.000Z"
      });
      return rows([]);
    }

    if (text.includes("insert into source_memo_artifacts")) {
      this.sourceMemoArtifacts.push({
        source_memo_id: values[0],
        artifact_id: values[1],
        relationship: values[2]
      });
      return rows([]);
    }

    if (text.includes("from source_memo_artifacts") && text.includes("join artifacts")) {
      const link = this.sourceMemoArtifacts.find(
        (row) => row.source_memo_id === values[0] && row.relationship === "primary_original"
      );
      const artifact = this.artifacts.find((row) => row.id === link?.artifact_id);
      return rows(artifact === undefined ? [] : [artifact as Row]);
    }

    if (text.includes("delete from projects")) {
      const projectId = String(values[0]);
      if (this.workItems.some((item) => item.project_id === projectId)) {
        const error = new Error("project still referenced") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      const index = this.projects.findIndex((project) => project.id === projectId);
      if (index === -1) {
        return rows([]);
      }
      const [project] = this.projects.splice(index, 1);
      return rows([project as Row]);
    }

    if (text.includes("from projects")) {
      return rows([...this.projects] as Row[]);
    }

    if (text.includes("from source_memos") && text.includes("where content_hash")) {
      const sourceMemo = this.sourceMemos.find((row) => row.content_hash === values[0]);
      return rows(sourceMemo === undefined ? [] : [sourceMemo as Row]);
    }

    if (text.includes("from source_memos") && text.includes("where id =")) {
      const sourceMemo = this.sourceMemos.find((row) => row.id === values[0]);
      return rows(sourceMemo === undefined ? [] : [sourceMemo as Row]);
    }

    if (text.includes("update source_memos") && text.includes("original_file_modified_at = $2")) {
      const sourceMemo = this.sourceMemos.find((row) => row.id === values[0]);
      if (
        sourceMemo !== undefined &&
        (sourceMemo.original_file_modified_at === null ||
          new Date(String(sourceMemo.original_file_modified_at)).getTime() > new Date(String(values[1])).getTime())
      ) {
        sourceMemo.original_file_modified_at = values[1];
      }
      return rows([]);
    }

    if (text.includes("from media_type_settings") && text.includes("where id =")) {
      const mediaType = this.mediaTypes.find((row) => row.id === values[0]);
      return rows(mediaType === undefined ? [] : [mediaType as Row]);
    }

    if (text.includes("from media_type_settings") && text.includes("where lower(media_key)")) {
      const mediaKey = String(values[0]).toLowerCase();
      const mediaType = this.mediaTypes.find((row) => String(row.media_key).toLowerCase() === mediaKey);
      return rows(mediaType === undefined ? [] : [mediaType as Row]);
    }

    if (text.includes("from file_type_settings") && text.includes("where media_kind =")) {
      const count = this.fileTypes.filter((row) => row.media_kind === values[0]).length;
      return rows([{ count }] as unknown as Row[]);
    }

    if (text.includes("from parser_type_settings") && text.includes("where media_key =")) {
      const count = this.parserTypes.filter((row) => row.media_key === values[0]).length;
      return rows([{ count }] as unknown as Row[]);
    }

    if (text.includes("delete from media_type_settings")) {
      const index = this.mediaTypes.findIndex((row) => row.id === values[0]);
      if (index === -1) {
        return rows([]);
      }
      const [row] = this.mediaTypes.splice(index, 1);
      return rows([row as Row]);
    }

    if (text.includes("from media_type_settings")) {
      return rows([...this.mediaTypes] as Row[]);
    }

    if (text.includes("insert into media_type_settings")) {
      const row = {
        id: values[0],
        media_key: values[1],
        display_name: values[2],
        description: values[3],
        capability_state: values[4],
        created_by: values[5],
        updated_by: values[5],
        updated_at: "2026-05-29T00:00:00.000Z"
      };
      this.mediaTypes.push(row);
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("update media_type_settings")) {
      const row = this.mediaTypes.find((mediaType) => mediaType.id === values[0]);
      if (row !== undefined) {
        row.media_key = values[1];
        row.display_name = values[2];
        row.description = values[3];
        row.capability_state = values[4];
        row.updated_by = values[5];
      }
      return rows(row === undefined ? [] : [row as Row]);
    }

    if (text.includes("from parser_type_settings") && text.includes("where id =")) {
      const parserType = this.parserTypes.find((row) => row.id === values[0]);
      return rows(parserType === undefined ? [] : [parserType as Row]);
    }

    if (text.includes("from parser_type_settings") && text.includes("where lower(parser_key)")) {
      const parserKey = String(values[0]).toLowerCase();
      const parserType = this.parserTypes.find((row) => String(row.parser_key).toLowerCase() === parserKey);
      return rows(parserType === undefined ? [] : [parserType as Row]);
    }

    if (text.includes("from file_type_settings") && text.includes("where parser_key =")) {
      const count = this.fileTypes.filter((row) => row.parser_key === values[0]).length;
      return rows([{ count }] as unknown as Row[]);
    }

    if (text.includes("delete from parser_type_settings")) {
      const index = this.parserTypes.findIndex((row) => row.id === values[0]);
      if (index === -1) {
        return rows([]);
      }
      const [row] = this.parserTypes.splice(index, 1);
      return rows([row as Row]);
    }

    if (text.includes("from parser_type_settings")) {
      return rows([...this.parserTypes] as Row[]);
    }

    if (text.includes("insert into parser_type_settings")) {
      const row = {
        id: values[0],
        parser_key: values[1],
        display_name: values[2],
        description: values[3],
        media_key: values[4],
        capability_state: values[5],
        created_by: values[6],
        updated_by: values[6],
        updated_at: "2026-05-29T00:00:00.000Z"
      };
      this.parserTypes.push(row);
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("update parser_type_settings")) {
      const row = this.parserTypes.find((parserType) => parserType.id === values[0]);
      if (row !== undefined) {
        row.parser_key = values[1];
        row.display_name = values[2];
        row.description = values[3];
        row.media_key = values[4];
        row.capability_state = values[5];
        row.updated_by = values[6];
      }
      return rows(row === undefined ? [] : [row as Row]);
    }

    if (text.includes("delete from file_type_settings")) {
      const index = this.fileTypes.findIndex((row) => row.id === values[0]);
      if (index === -1) {
        return rows([]);
      }
      const [row] = this.fileTypes.splice(index, 1);
      return rows([row as Row]);
    }

    if (text.includes("from file_type_settings") && text.includes("where lower(extension)")) {
      const extension = String(values[0]).toLowerCase();
      const fileType = this.fileTypes.find((row) => String(row.extension).toLowerCase() === extension);
      return rows(fileType === undefined ? [] : [fileType as Row]);
    }

    if (text.includes("from file_type_settings") && text.includes("where id =")) {
      const fileType = this.fileTypes.find((row) => row.id === values[0]);
      return rows(fileType === undefined ? [] : [fileType as Row]);
    }

    if (text.includes("from file_type_settings")) {
      return rows([...this.fileTypes] as Row[]);
    }

    if (text.includes("insert into file_type_settings")) {
      const row = {
        id: values[0],
        extension: values[1],
        media_kind: values[2],
        capability_state: values[3],
        parser_key: values[4],
        created_by: values[5],
        updated_by: values[5],
        updated_at: "2026-05-29T00:00:00.000Z"
      };
      this.fileTypes.push(row);
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("update file_type_settings")) {
      const row = this.fileTypes.find((fileType) => fileType.id === values[0]);
      if (row !== undefined) {
        row.media_kind = values[1];
        row.capability_state = values[2];
        row.parser_key = values[3];
        row.updated_by = values[4];
      }
      return rows(row === undefined ? [] : [row as Row]);
    }

    if (text.includes("insert into import_upload_sessions")) {
      const row = {
        id: values[0],
        status: values[1],
        machine_id: values[2],
        watch_folder_id: values[3],
        source_type: values[4],
        original_filename: values[5],
        original_path: values[6],
        original_file_modified_at: values[7],
        mime_type: values[8],
        byte_size: values[9],
        content_hash: values[10],
        contributor_text: values[11],
        object_key: values[12],
        bucket: values[13],
        artifact_id: values[14],
        reserved_source_memo_id: values[15],
        duplicate_of_source_memo_id: values[16],
        created_by: values[17],
        created_at: "2026-05-29T00:00:00.000Z",
        updated_at: "2026-05-29T00:00:00.000Z",
        uploaded_at: null,
        finalized_at: null
      };
      this.importUploadSessions.push(row);
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("from import_upload_sessions")) {
      const session = this.importUploadSessions.find((row) => row.id === values[0]);
      return rows(session === undefined ? [] : [session as Row]);
    }

    if (text.includes("update import_upload_sessions") && text.includes("status = 'uploaded'")) {
      const session = this.importUploadSessions.find((row) => row.id === values[0]);
      if (session !== undefined && session.status === "upload_required") {
        session.status = "uploaded";
        session.uploaded_at = "2026-05-29T00:00:00.000Z";
      }
      return rows(session === undefined ? [] : [session as Row]);
    }

    if (text.includes("update import_upload_sessions") && text.includes("status = 'finalized'")) {
      const session = this.importUploadSessions.find((row) => row.id === values[0]);
      if (session !== undefined) {
        session.status = "finalized";
        session.finalized_at = "2026-05-29T00:00:00.000Z";
      }
      return rows([]);
    }

    if (text.includes("from work_items") && text.includes("where work_items.source_memo_id =")) {
      const item = this.workItems.find((row) => row.source_memo_id === values[0]);
      return rows(item === undefined ? [] : [withTagAvailability(item) as Row]);
    }

    if (text.includes("where work_items.id <>")) {
      return rows(
        this.workItems
          .filter((row) => row.id !== values[0])
          .map((row) => {
            const sourceMemo = this.sourceMemos.find((source) => source.id === row.source_memo_id);
            return {
              corpus_text: [
                row.title,
                row.body,
                sourceMemo?.extracted_text,
                sourceMemo?.current_transcript_text
              ]
                .filter((value) => value !== undefined && value !== null)
                .join("\n")
            };
          }) as unknown as Row[]
      );
    }

    if (text.includes("insert into suppressed_tags")) {
      const existing = this.suppressedTags.find((row) => row.normalized_name === values[0]);
      if (existing !== undefined) {
        return rows([existing as Row]);
      }
      const row = {
        normalized_name: values[0],
        display_name: values[1],
        created_at: "2026-05-29T00:00:00.000Z",
        updated_at: "2026-05-29T00:00:00.000Z"
      };
      this.suppressedTags.push(row);
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("delete from suppressed_tags")) {
      const index = this.suppressedTags.findIndex((row) => row.normalized_name === values[0]);
      if (index === -1) {
        return rows([]);
      }
      const [row] = this.suppressedTags.splice(index, 1);
      return rows([row as Row]);
    }

    if (text.includes("select normalized_name, display_name, created_at, updated_at") && text.includes("from suppressed_tags")) {
      return rows([...this.suppressedTags] as Row[]);
    }

    if (
      text.includes("from project_tags") &&
      text.includes("where project_tags.project_id") &&
      text.includes("selected_co_document_count")
    ) {
      const projectId = values[0];
      const selectedNames = new Set(Array.isArray(values[1]) ? values[1] : []);
      return rows(
        this.projectTags
          .filter((row) => row.project_id === projectId)
          .map((row) => this.tags.find((tag) => tag.id === row.tag_id))
          .filter((tag): tag is Record<string, unknown> => tag !== undefined)
          .filter((tag) => !selectedNames.has(String(tag.normalized_name)))
          .map((tag) => ({
            name: tag.name,
            normalized_name: tag.normalized_name,
            document_count: 1,
            total_item_count: 1,
            project_document_count: 1,
            selected_co_document_count: 0
          })) as unknown as Row[]
      );
    }

    if (text.includes("from project_tags") && text.includes("where project_tags.project_id")) {
      const projectId = values[0];
      return rows(
        this.projectTags
          .filter((row) => row.project_id === projectId)
          .map((row) => this.tags.find((tag) => tag.id === row.tag_id))
          .filter((tag): tag is Record<string, unknown> => tag !== undefined)
          .map((tag) => ({ normalized_name: tag.normalized_name ?? String(tag.name).toLowerCase() })) as unknown as Row[]
      );
    }

    if (text.includes("from work_items") && text.includes("where work_items.id =")) {
      const item = this.workItems.find((row) => row.id === values[0]);
      return rows(item === undefined ? [] : [withTagAvailability(item) as Row]);
    }

    if (text.includes("update work_items") && text.includes("project_id = coalesce")) {
      const item = this.workItems.find((row) => row.id === values[0]);
      if (item === undefined) {
        return rows([]);
      }
      const changed =
        item.title !== values[1] ||
        item.body !== values[2] ||
        (item.contributor_text === null && values[3] !== null) ||
        (item.project_id === null && values[4] !== null);
      if (!changed) {
        return rows([]);
      }
      item.title = values[1];
      item.body = values[2];
      item.contributor_text = item.contributor_text ?? values[3];
      item.project_id = item.project_id ?? values[4];
      item.workflow_item_version = Number(item.workflow_item_version) + 1;
      return rows([item as Row]);
    }

    if (text.includes("update work_items") && text.includes("workflow_state = $3")) {
      const item = this.workItems.find((row) => row.id === values[0]);
      if (item === undefined || item.workflow_item_version !== values[1]) {
        return rows([]);
      }
      item.workflow_state = values[2];
      item.workflow_item_version = Number(item.workflow_item_version) + 1;
      return rows([item as Row]);
    }

    if (text.includes("update work_items") && text.includes("title = $3") && text.includes("project_id = $5")) {
      const item = this.workItems.find((row) => row.id === values[0]);
      if (item === undefined || item.workflow_item_version !== values[1]) {
        return rows([]);
      }
      item.title = values[2];
      item.body = values[3];
      item.project_id = values[4];
      item.contributor_id = values[5];
      item.contributor_text = values[6];
      item.workflow_item_version = Number(item.workflow_item_version) + 1;
      if (values[8] === true) {
        item.tag_nomination_completed_at = null;
        item.tag_nomination_project_id = null;
        item.tag_nomination_job_id = null;
      }
      return rows([withTagAvailability(item) as Row]);
    }

    if (text.includes("update work_items") && text.includes("tag_nomination_completed_at")) {
      const item = this.workItems.find((row) => row.id === values[0]);
      if (item === undefined) {
        return rows([]);
      }
      item.tag_nomination_completed_at = "2026-05-29T00:00:00.000Z";
      item.tag_nomination_project_id = values[1];
      item.tag_nomination_job_id = values[2];
      return rows([withTagAvailability(item) as Row]);
    }

    if (text.includes("insert into work_items")) {
      const row = {
        id: values[0],
        source_memo_id: values[1],
        project_id: values[2],
        contributor_text: values[3],
        contributor_id: values[4],
        title: values[5],
        body: values[6],
        body_format: values[7],
        workflow_state: values[8],
        tags: [],
        workflow_item_version: 1,
        accepted_snapshot_id: null,
        accepted_unexported_changes: false,
        tag_nomination_completed_at: null,
        tag_nomination_project_id: null,
        tag_nomination_job_id: null,
        original_file_modified_at:
          this.sourceMemos.find((sourceMemo) => sourceMemo.id === values[1])?.original_file_modified_at ?? null,
        created_at: "2026-05-29T00:00:00.000Z",
        updated_at: "2026-05-29T00:00:00.000Z"
      };
      this.workItems.push(row);
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("insert into processing_jobs")) {
      this.processingJobs.push({
        id: values[0],
        job_kind: values[1],
        status: values[2],
        source_memo_id: values[3],
        work_item_id: values[4],
        export_batch_id: values[5],
        max_attempts: values[6],
        initiated_by: values[7],
        run_after: values[8] ?? "2026-05-29T00:00:00.000Z",
        completed_at: null,
        claim_expires_at: null
      });
      return rows([]);
    }

    if (text.includes("from processing_jobs") && text.includes("processing_jobs.job_kind")) {
      return rows(
        this.processingJobs
          .filter(
            (job) =>
              ["queued", "claimed", "running", "retry_scheduled"].includes(String(job.status)) &&
              job.job_kind === "nominate_tags"
          )
          .map((job) => ({
            id: job.id,
            job_kind: job.job_kind,
            work_item_id: job.work_item_id,
            workflow_state:
              this.workItems.find((workItem) => workItem.id === job.work_item_id)?.workflow_state ?? null
          })) as unknown as Row[]
      );
    }

    if (text.includes("with cancelled as") && text.includes("update processing_jobs")) {
      let cancelled = 0;
      for (const job of this.processingJobs) {
        if (
          job.work_item_id === values[0] &&
          job.job_kind === values[1] &&
          ["queued", "retry_scheduled", "claimed"].includes(String(job.status))
        ) {
          job.status = "cancelled";
          job.completed_at = "2026-05-29T00:00:00.000Z";
          job.claim_expires_at = null;
          cancelled += 1;
        }
      }
      return rows([{ cancelled_count: cancelled }] as unknown as Row[]);
    }

    if (text.includes("delete from work_item_tags")) {
      const workItemId = values[0];
      for (let index = this.workItemTags.length - 1; index >= 0; index -= 1) {
        if (this.workItemTags[index]?.work_item_id === workItemId) {
          this.workItemTags.splice(index, 1);
        }
      }
      const item = this.workItems.find((row) => row.id === workItemId);
      if (item !== undefined) {
        item.tags = [];
      }
      return rows([]);
    }

    if (text.includes("insert into tags")) {
      const normalizedName = values[2];
      const existing = this.tags.find((row) => row.normalized_name === normalizedName);
      if (existing !== undefined) {
        return rows([existing as Row]);
      }
      const row = {
        id: values[0],
        name: values[1],
        normalized_name: normalizedName
      };
      this.tags.push(row);
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("insert into work_item_tags")) {
      const row = {
        work_item_id: values[0],
        tag_id: values[1],
        assignment_source: values[2],
        confidence: values[3],
        item_count: values[4]
      };
      this.workItemTags.push(row);
      const item = this.workItems.find((workItem) => workItem.id === values[0]);
      const tag = this.tags.find((candidate) => candidate.id === values[1]);
      if (item !== undefined && tag !== undefined) {
        item.tags = [...new Set([...(Array.isArray(item.tags) ? item.tags : []), tag.name])];
      }
      return rows([]);
    }

    if (text.includes("insert into project_tags")) {
      const existing = this.projectTags.find((row) => row.project_id === values[0] && row.tag_id === values[1]);
      if (existing === undefined) {
        this.projectTags.push({
          project_id: values[0],
          tag_id: values[1],
          first_seen_work_item_id: values[2],
          created_by: values[3]
        });
      }
      return rows([]);
    }

    if (text.includes("insert into tag_statistics") || text.includes("insert into tag_co_occurrences")) {
      return rows([]);
    }

    if (text.includes("insert into import_events")) {
      this.importEvents.push({
        id: values[0],
        source_memo_id: values[1],
        machine_id: values[3],
        original_file_modified_at: values[7],
        status: values[10]
      });
      return rows([]);
    }

    if (text.includes("select id, source_memo_id, machine_id, status") && text.includes("from import_events")) {
      const event = this.importEvents.find((row) => row.id === values[0]);
      return rows(event === undefined ? [] : [event as Row]);
    }

    if (text.includes("update import_events")) {
      const event = this.importEvents.find((row) => row.id === values[0]);
      if (event !== undefined) {
        event.archive_path = values[1];
        event.status = values[2] ?? event.status;
        event.warning_code = values[3];
        event.warning_message = values[4];
      }
      return rows(
        event === undefined ? [] : ([{ source_memo_id: event.source_memo_id, status: event.status }] as unknown as Row[])
      );
    }

    if (text.includes("update source_memos")) {
      return rows([]);
    }

    if (text.includes("insert into audit_events")) {
      this.auditEvents.push({
        id: values[0],
        event_name: values[1],
        actor_user_id: values[2],
        actor_email_snapshot: values[3],
        actor_display_name_snapshot: values[4],
        subject_type: values[5],
        subject_id: values[6],
        request_id: values[7],
        job_id: values[8],
        source_memo_id: values[9],
        work_item_id: values[10],
        metadata: JSON.parse(String(values[11] ?? "{}")) as Record<string, unknown>,
        redaction_applied: values[12],
        created_at: "2026-05-29T00:00:00.000Z"
      });
      return rows([]);
    }

    if (text.includes("from audit_events")) {
      const filtered = this.auditEvents.filter(
        (event) =>
          (values[0] === null || event.event_name === values[0]) &&
          (values[1] === null || event.actor_user_id === values[1]) &&
          (values[2] === null || event.subject_type === values[2]) &&
          (values[3] === null || event.subject_id === values[3]) &&
          (values[4] === null || event.work_item_id === values[4]) &&
          (values[5] === null || event.job_id === values[5])
      );
      const auditRows = filtered.slice(0, Number(values[8] ?? 100)).map((event) => {
        const linkedWorkItem = this.workItems.find((row) => row.id === event.work_item_id);
        const subjectWorkItem =
          event.subject_type === "work_item"
            ? this.workItems.find((row) => row.id === event.subject_id)
            : undefined;
        const sourceMemoId =
          event.source_memo_id ?? linkedWorkItem?.source_memo_id ?? subjectWorkItem?.source_memo_id ?? null;
        const sourceMemo = this.sourceMemos.find((row) => row.id === sourceMemoId);
        const artifact = this.artifacts.find((row) => row.id === sourceMemo?.primary_artifact_id);
        const linkedProject = this.projects.find(
          (row) => row.id === (linkedWorkItem?.project_id ?? subjectWorkItem?.project_id ?? null)
        );
        const subjectProject =
          event.subject_type === "project" ? this.projects.find((row) => row.id === event.subject_id) : undefined;
        return {
          ...event,
          display_title: linkedWorkItem?.title ?? subjectWorkItem?.title ?? null,
          display_original_filename: artifact?.original_filename ?? null,
          display_original_path: sourceMemo?.original_path ?? null,
          display_project_name: linkedProject?.name ?? subjectProject?.name ?? null
        };
      });
      return rows(auditRows as unknown as Row[]);
    }

    return rows([]);
  }
}

interface FakeUserRow extends Record<string, unknown> {
  id: string;
  oidc_issuer: string;
  oidc_subject: string;
  email: string | null;
  display_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

function buildFakePromptRow(db: FakeDatabase, definition: Record<string, unknown>): Record<string, unknown> {
  const activeVersion = Number(definition.active_version ?? 1);
  const version = db.promptVersions.find(
    (row) => row.prompt_definition_id === definition.id && Number(row.version) === activeVersion
  );
  return {
    id: definition.id,
    name: definition.name,
    purpose: definition.purpose,
    active_version: activeVersion,
    retention_policy: definition.retention_policy ?? "retain_active_and_referenced",
    active_prompt_version_id: version?.id ?? null,
    active_body: version?.body ?? null,
    active_output_schema: version?.output_schema ?? null,
    active_context_config: version?.context_config ?? null,
    updated_at: definition.updated_at ?? "2026-05-29T00:00:00.000Z"
  };
}

function buildFakeAiTaskRouteRow(
  db: FakeDatabase,
  definition: Record<string, unknown>
): Record<string, unknown> {
  const route = db.aiTaskRoutes.find((row) => row.task_definition_id === definition.id);
  const provider = db.providers.find((row) => row.id === route?.provider_config_id);
  const taskKind = db.taskKinds.find((row) => row.id === definition.task_kind_id);
  const prompt =
    definition.prompt_definition_id === null || definition.prompt_definition_id === undefined
      ? null
      : db.promptDefinitions.find((row) => row.id === definition.prompt_definition_id);
  const promptRow = prompt === undefined || prompt === null ? null : buildFakePromptRow(db, prompt);
  return {
    id: definition.id,
    task_key: definition.task_key,
    display_name: definition.display_name,
    description: definition.description ?? null,
    hook_key: definition.hook_key,
    task_kind: definition.task_kind,
    task_kind_id: definition.task_kind_id ?? null,
    task_kind_display_name: taskKind?.display_name ?? null,
    task_kind_description: taskKind?.description ?? null,
    task_kind_provider_kind: taskKind?.provider_kind ?? null,
    task_kind_capability_key: taskKind?.capability_key ?? null,
    prompt_fields_enabled: taskKind?.prompt_fields_enabled ?? null,
    implemented: definition.implemented ?? false,
    default_provider_name: definition.default_provider_name ?? null,
    default_model_name: definition.default_model_name ?? null,
    runtime_option_id: definition.runtime_option_id,
    runtime_option_purpose: definition.runtime_option_purpose,
    runtime_provider_env: definition.runtime_provider_env,
    runtime_model_env: definition.runtime_model_env,
    runtime_endpoint_env: definition.runtime_endpoint_env ?? null,
    route_enabled: route?.enabled ?? false,
    route_model_name: route?.model_name ?? null,
    provider_config_id: route?.provider_config_id ?? null,
    provider_kind: provider?.provider_kind ?? null,
    provider_name: provider?.provider_name ?? null,
    provider_display_name: provider?.display_name ?? null,
    adapter_key: provider?.adapter_key ?? null,
    provider_enabled: provider?.enabled ?? null,
    provider_model_name: provider?.model_name ?? null,
    endpoint: provider?.endpoint ?? null,
    secret_source: provider?.secret_source ?? null,
    required_secret_env: provider?.required_secret_env ?? null,
    external_send_enabled: provider?.external_send_enabled ?? null,
    health_status: provider?.health_status ?? null,
    prompt_definition_id: promptRow?.id ?? null,
    prompt_name: promptRow?.name ?? null,
    prompt_purpose: promptRow?.purpose ?? null,
    prompt_active_version: promptRow?.active_version ?? null,
    active_prompt_version_id: promptRow?.active_prompt_version_id ?? null,
    active_body: promptRow?.active_body ?? null,
    active_output_schema: promptRow?.active_output_schema ?? null,
    active_context_config: promptRow?.active_context_config ?? null,
    prompt_retention_policy: promptRow?.retention_policy ?? null,
    updated_at: route?.updated_at ?? definition.updated_at ?? "2026-05-29T00:00:00.000Z"
  };
}

function seedMediaParserRegistry(db: FakeDatabase): void {
  db.mediaTypes.push(
    {
      id: "media-text",
      media_key: "text",
      display_name: "Text",
      description: "Text files",
      capability_state: "active",
      updated_at: "2026-05-29T00:00:00.000Z"
    },
    {
      id: "media-audio",
      media_key: "audio",
      display_name: "Audio",
      description: "Audio files",
      capability_state: "active",
      updated_at: "2026-05-29T00:00:00.000Z"
    }
  );
  db.parserTypes.push(
    {
      id: "parser-markdown",
      parser_key: "markdown",
      display_name: "Markdown",
      description: "Markdown parser",
      media_key: "text",
      capability_state: "active",
      updated_at: "2026-05-29T00:00:00.000Z"
    },
    {
      id: "parser-plain-text",
      parser_key: "plain-text",
      display_name: "Plain text",
      description: "Plain text parser",
      media_key: "text",
      capability_state: "active",
      updated_at: "2026-05-29T00:00:00.000Z"
    },
    {
      id: "parser-audio-transcription",
      parser_key: "audio-transcription",
      display_name: "Audio transcription",
      description: "Audio transcription parser",
      media_key: "audio",
      capability_state: "active",
      updated_at: "2026-05-29T00:00:00.000Z"
    }
  );
}

function seedTaskSettings(db: FakeDatabase): void {
  db.taskKinds.push(
    {
      id: "task-kind-llm",
      kind_key: "llm",
      display_name: "LLM generation",
      description: "Structured generation",
      provider_kind: "llm",
      capability_key: "structured-generation",
      prompt_fields_enabled: true,
      enabled: true,
      active: true,
      updated_at: "2026-05-29T00:00:00.000Z"
    },
    {
      id: "task-kind-stt",
      kind_key: "stt",
      display_name: "Speech to text",
      description: "Audio transcription",
      provider_kind: "transcription",
      capability_key: "speech-to-text",
      prompt_fields_enabled: false,
      enabled: true,
      active: true,
      updated_at: "2026-05-29T00:00:00.000Z"
    }
  );
  db.providers.push(
    {
      id: "provider-local-dev",
      provider_kind: "llm",
      provider_name: "local-dev",
      display_name: "Local development",
      adapter_key: "local-dev",
      enabled: true,
      endpoint: null,
      model_name: "memo-capture-local-dev-expander-v1",
      secret_source: "environment",
      required_secret_env: null,
      external_send_enabled: false,
      runtime_provider_env: "LLM_PROVIDER",
      runtime_model_env: "LLM_MODEL",
      runtime_endpoint_env: "LLM_ENDPOINT",
      health_status: "healthy",
      last_health_check_at: null,
      updated_at: "2026-05-29T00:00:00.000Z"
    },
    {
      id: "provider-whisper",
      provider_kind: "transcription",
      provider_name: "whisper-cpp",
      display_name: "Whisper.cpp",
      adapter_key: "whisper-cpp",
      enabled: true,
      endpoint: null,
      model_name: "ggml-base.en",
      secret_source: "none",
      required_secret_env: null,
      external_send_enabled: false,
      runtime_provider_env: "TRANSCRIPTION_PROVIDER",
      runtime_model_env: "TRANSCRIPTION_MODEL",
      runtime_endpoint_env: null,
      health_status: "unknown",
      last_health_check_at: null,
      updated_at: "2026-05-29T00:00:00.000Z"
    }
  );
  db.providerCapabilities.push(
    {
      id: "cap-local-dev-generation",
      provider_config_id: "provider-local-dev",
      capability_key: "structured-generation",
      enabled: true,
      updated_at: "2026-05-29T00:00:00.000Z"
    },
    {
      id: "cap-whisper-stt",
      provider_config_id: "provider-whisper",
      capability_key: "speech-to-text",
      enabled: true,
      updated_at: "2026-05-29T00:00:00.000Z"
    }
  );
  db.promptDefinitions.push({
    id: "prompt-work-item-expansion",
    name: "work_item_expansion",
    purpose: "Expand work items.",
    active_version: 1,
    retention_policy: "retain_active_and_referenced",
    updated_at: "2026-05-29T00:00:00.000Z"
  });
  db.promptVersions.push({
    id: "prompt-version-work-item-expansion",
    prompt_definition_id: "prompt-work-item-expansion",
    version: 1,
    body: "Return strict JSON.",
    output_schema: {},
    context_config: {
      freeformText: "Return strict JSON.",
      includeProjectSynopsis: true,
      includeMemoMetadata: true,
      includeMemoTranscriptText: true
    },
    created_at: "2026-05-29T00:00:00.000Z"
  });
  db.aiTaskDefinitions.push(
    {
      id: "task-memo-expansion",
      task_key: "memo-expansion",
      display_name: "Memo expansion",
      description: "Expand one memo.",
      hook_key: "memo-expansion",
      task_kind: "llm",
      task_kind_id: "task-kind-llm",
      prompt_definition_id: "prompt-work-item-expansion",
      implemented: true,
      default_provider_name: "local-dev",
      default_model_name: "memo-capture-local-dev-expander-v1",
      runtime_option_id: "llm-runtime",
      runtime_option_purpose: "llm-runtime",
      runtime_provider_env: "LLM_PROVIDER",
      runtime_model_env: "LLM_MODEL",
      runtime_endpoint_env: "LLM_ENDPOINT",
      updated_at: "2026-05-29T00:00:00.000Z"
    },
    {
      id: "task-custom",
      task_key: "custom-summary",
      display_name: "Custom summary",
      description: "Unimplemented task.",
      hook_key: "custom-summary",
      task_kind: "llm",
      task_kind_id: "task-kind-llm",
      prompt_definition_id: null,
      implemented: false,
      default_provider_name: "local-dev",
      default_model_name: "memo-capture-local-dev-expander-v1",
      runtime_option_id: "llm-runtime",
      runtime_option_purpose: "llm-runtime",
      runtime_provider_env: "LLM_PROVIDER",
      runtime_model_env: "LLM_MODEL",
      runtime_endpoint_env: "LLM_ENDPOINT",
      updated_at: "2026-05-29T00:00:00.000Z"
    }
  );
  db.aiTaskRoutes.push(
    {
      task_definition_id: "task-memo-expansion",
      provider_config_id: "provider-local-dev",
      model_name: "memo-capture-local-dev-expander-v1",
      enabled: true,
      updated_at: "2026-05-29T00:00:00.000Z"
    },
    {
      task_definition_id: "task-custom",
      provider_config_id: null,
      model_name: null,
      enabled: false,
      updated_at: "2026-05-29T00:00:00.000Z"
    }
  );
}

function seedActiveClassifyWorkflow(db: FakeDatabase): void {
  db.activeWorkflow = {
    workflow_id: "memo-capture_workflow",
    workflow_version: "0.2.4",
    state_machine_version: "0.2.4",
    content_hash: "sha256:test-classify",
    required_app_capabilities: [],
    activated_by: null,
    activated_at: "2026-05-29T00:00:00.000Z",
    bundle: {
      schemaVersion: "0.7.0",
      appName: "memo-capture",
      workflowVersion: "0.2.4",
      id: "memo-capture_workflow",
      stateMachine: {
        id: "memo_capture_state",
        definitionVersion: "0.2.4"
      },
      states: [
        {
          id: "needs_review",
          visible: true
        },
        {
          id: "memo",
          visible: true
        },
        {
          id: "parked",
          visible: true
        }
      ],
      actions: [
        {
          id: "review.memo",
          label: "Mark as New Memo",
          from: "needs_review",
          to: "memo",
          trigger: "user",
          visible: true
        },
        {
          id: "memo.parked",
          label: "Park",
          from: "memo",
          to: "parked",
          trigger: "user",
          visible: true
        }
      ],
      hooks: [
        {
          id: "on_state_entry_needs_review",
          phase: "on_state_entry",
          targetType: "state",
          targetId: "needs_review",
          handlerKey: "classify_item"
        },
        {
          id: "while_in_state_memo",
          phase: "while_in_state",
          targetType: "state",
          targetId: "memo",
          schedule: {
            trigger: "every_interval",
            intervalMs: testNominateTagsIntervalMs
          },
          handlerKey: "nominate_tags"
        }
      ],
      buckets: [
        {
          id: "review",
          label: "Review",
          visible: true,
          states: ["needs_review"]
        },
        {
          id: "memos",
          label: "Memos",
          visible: true,
          states: ["memo"]
        },
        {
          id: "parked",
          label: "Parked",
          visible: true,
          states: ["parked"]
        }
      ],
      embeddedStateMachineDefinition: {
        schemaVersion: "0.3.0",
        appName: "memo-capture",
        definitionVersion: "0.2.4",
        version: "0.2.4",
        id: "memo_capture_state",
        initialState: "needs_review",
        states: ["needs_review", "memo", "parked"],
        entryStates: ["needs_review"],
        terminalStates: [],
        transitions: [
          {
            from: "needs_review",
            to: "memo",
            actionId: "review.memo"
          },
          {
            from: "memo",
            to: "parked",
            actionId: "memo.parked"
          }
        ]
      }
    }
  };
}

function projectRow(id: string, name: string): Record<string, unknown> {
  return {
    id,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    name,
    description: "",
    is_active: true,
    created_at: "2026-05-29T00:00:00.000Z",
    updated_at: "2026-05-29T00:00:00.000Z"
  };
}

function seedWorkItemRow(input: {
  db: FakeDatabase;
  sourceMemoId?: string;
  workItemId?: string;
  workflowState?: string;
  title?: string;
  body?: string;
  sourceText?: string;
}): void {
  const sourceMemoId = input.sourceMemoId ?? "00000000-0000-4000-8000-000000000101";
  const workItemId = input.workItemId ?? "00000000-0000-4000-8000-000000000201";
  input.db.sourceMemos.push({
    id: sourceMemoId,
    source_type: "watched_text_file",
    extracted_text: input.sourceText ?? input.body ?? "Memo Capture",
    current_transcript_text: null,
    original_file_modified_at: originalFileModifiedAt
  });
  input.db.workItems.push({
    id: workItemId,
    source_memo_id: sourceMemoId,
    project_id: "00000000-0000-4000-8000-000000000301",
    contributor_text: null,
    contributor_id: null,
    title: input.title ?? "Reviewed memo",
    body: input.body ?? "Ready for memo",
    body_format: "markdown",
    workflow_state: input.workflowState ?? "memo",
    tags: [],
    workflow_item_version: 1,
    accepted_snapshot_id: null,
    accepted_unexported_changes: false,
    tag_nomination_completed_at: null,
    tag_nomination_project_id: null,
    tag_nomination_job_id: null,
    original_file_modified_at: originalFileModifiedAt,
    created_at: "2026-05-29T00:00:00.000Z",
    updated_at: "2026-05-29T00:00:00.000Z"
  });
}

function seedProjectTag(db: FakeDatabase, name: string): void {
  const normalizedName = name.trim().toLowerCase();
  const tagId = `tag-${normalizedName.replaceAll(" ", "-")}`;
  db.tags.push({
    id: tagId,
    name,
    normalized_name: normalizedName
  });
  db.projectTags.push({
    project_id: "00000000-0000-4000-8000-000000000301",
    tag_id: tagId,
    first_seen_work_item_id: null,
    created_by: null
  });
}

function withTagAvailability(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    tags_available:
      row.tag_nomination_completed_at !== null &&
      row.tag_nomination_completed_at !== undefined &&
      row.project_id !== null &&
      row.tag_nomination_project_id === row.project_id,
    tags:
      row.tag_nomination_completed_at !== null &&
      row.tag_nomination_completed_at !== undefined &&
      row.project_id !== null &&
      row.tag_nomination_project_id === row.project_id
        ? row.tags
        : []
  };
}

function rows<Row extends Record<string, unknown>>(resultRows: Row[]): QueryResult<Row> {
  return {
    rows: resultRows,
    rowCount: resultRows.length
  };
}
