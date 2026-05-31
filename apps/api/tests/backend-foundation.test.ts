import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readApiConfig } from "../src/config.js";
import type { Database, Queryable, QueryParams, QueryResult } from "../src/db/types.js";
import { createLogger } from "../src/logger.js";
import type { AiSuggestionRecord } from "../src/repositories/ai-suggestions.js";
import type { AppServices } from "../src/services/app.js";
import { createAppServicesFromDatabase } from "../src/services/app.js";
import { HttpError } from "../src/services/errors.js";
import { createApiServer } from "../src/server.js";

test("local-dev auth creates a fixed development session when explicitly enabled", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_EMAIL: "dev@example.test",
    MEMO_CAPTURE_APP_VERSION: "0.1.0",
    MEMO_CAPTURE_COMMIT_SHA: "test-sha"
  });
  const db = new FakeDatabase();
  const services = createAppServicesFromDatabase(config, db);

  const session = await services.auth.createLocalDevSession();

  assert.equal(session.authMode, "local-dev");
  assert.equal(session.user.email, "dev@example.test");
  assert.equal(session.accessToken, "local-dev:memo-capture-local-dev:local-dev-user");
  assert.equal(db.users.length, 1);
});

test("form memo service creates source memo, work item, import event, and audit rows", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  const result = await services.formMemos.createFromRequest(
    {
      projectId: "00000000-0000-4000-8000-000000000301",
      title: "Capture this",
      body: "Useful memo body",
      contributorText: "Paul"
    },
    session.user,
    "request-1"
  );

  assert.equal(db.sourceMemos.length, 1);
  assert.equal(db.workItems.length, 1);
  assert.equal(db.importEvents.length, 1);
  assert.equal(db.auditEvents.length, 2);
  assert.equal(result.workItem.workflowState, "memo");
  assert.equal(result.workItem.title, "Capture this");
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

    const featureGroupPatch = await authedJson(baseUrl, "/api/feature-groups/feature-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Capture API", slug: "capture-api" })
    });
    assert.equal(featureGroupPatch.response.status, 200);
    assert.equal(featureGroupPatch.body.featureGroup.slug, "capture-api");

    const featureGroupDeactivate = await authedJson(
      baseUrl,
      "/api/feature-groups/feature-1/deactivate",
      { method: "POST" }
    );
    assert.equal(featureGroupDeactivate.response.status, 200);
    assert.equal(featureGroupDeactivate.body.featureGroup.isActive, false);

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

    const workItemDetail = await authedJson(baseUrl, "/api/work-items/work-item-1");
    assert.equal(workItemDetail.response.status, 200);
    assert.equal(workItemDetail.body.workItem.title, "Captured memo");

    const workItemPatch = await authedJson(baseUrl, "/api/work-items/work-item-1", {
      method: "PATCH",
      body: JSON.stringify({
        expectedVersion: 1,
        title: "Captured memo updated",
        body: "Updated memo body",
        projectId: "project-1",
        featureGroupId: "feature-1",
        contributorId: "contributor-1",
        contributorText: "Paul"
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

    const providerPatch = await authedJson(baseUrl, "/api/settings/providers/provider-1", {
      method: "PATCH",
      body: JSON.stringify({ enabled: true, modelName: "memo-capture-local-dev-expander-v1" })
    });
    assert.equal(providerPatch.response.status, 200);
    assert.equal(providerPatch.body.provider.enabled, true);

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
      listProjects: async () => []
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
      getSummary: async () => ({ providers: [] }),
      updateExtraction: async () => {
        throw new Error("not used");
      },
      updateTranscription: async () => {
        throw new Error("not used");
      },
      updateProvider: async () => {
        throw new Error("not used");
      },
      createPromptVersion: async () => {
        throw new Error("not used");
      }
    } as unknown as AppServices["settings"],
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
    context: "",
    isActive: true,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  const featureGroup = {
    id: "feature-1",
    slug: "capture-api",
    name: "Capture API",
    description: "",
    isActive: true,
    mergedIntoFeatureGroupId: null,
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
    featureGroupId: "feature-1",
    contributorText: "Paul",
    contributorId: "contributor-1",
    title: "Captured memo",
    body: "Useful memo body",
    bodyFormat: "markdown",
    workflowState: "memo",
    workflowItemVersion: 1,
    acceptedSnapshotId: null,
    acceptedUnexportedChanges: false,
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
    featureGroup: null,
    featureGroupId: null,
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

  return {
    ai: {
      listSuggestions: async () => ({ suggestions: [suggestionOne, suggestionTwo] }),
      expandWorkItem: async () => ({
        expandedWorkItem: {
          title: `${workItem.title} expanded`,
          body: `${workItem.body}\n\nExpansion focus: clarify value.`,
          tags: ["ai-expanded"],
          featureGroup: null
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
      listFeatureGroups: async () => [featureGroup],
      createFeatureGroup: async () => featureGroup,
      updateFeatureGroup: async () => featureGroup,
      deactivateFeatureGroup: async () => ({ ...featureGroup, isActive: false }),
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
            featureGroup: { id: "feature-1", name: "Capture API" },
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
        fileTypes: [],
        extraction: {
          projectConfidenceThreshold: 0.7,
          featureGroupConfidenceThreshold: 0.7,
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
            enabled: false,
            endpointConfigured: false,
            modelName: "memo-capture-local-dev-expander-v1",
            secretSource: "environment",
            secretConfigured: true,
            healthStatus: "unknown",
            runtimeProvider: "local-dev",
            runtimeModelName: "memo-capture-local-dev-expander-v1",
            lastHealthCheckAt: null,
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ],
        prompts: [
          {
            id: "prompt-1",
            name: "work_item_expansion",
            purpose: "Expand work items.",
            activeVersion: 1,
            activePromptVersionId: "prompt-version-1",
            body: "Return strict JSON.",
            outputSchema: {},
            retentionPolicy: "retain_active_and_referenced",
            updatedAt: "2026-05-29T00:00:00.000Z"
          }
        ],
        auth: { mode: "local-dev", oidcConfigured: false }
      }),
      updateExtraction: async () => ({ extraction: { projectConfidenceThreshold: 0.8 } }),
      updateTranscription: async () => ({ transcription: { maxRetryAttempts: 4 } }),
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
      createPromptVersion: async () => ({ prompt: { id: "prompt-1", activeVersion: 2 } })
    } as unknown as AppServices["settings"],
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
  readonly sourceMemos: Record<string, unknown>[] = [];
  readonly workItems: Record<string, unknown>[] = [];
  readonly importEvents: Record<string, unknown>[] = [];
  readonly auditEvents: Record<string, unknown>[] = [];

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

    if (text.includes("insert into source_memos")) {
      this.sourceMemos.push({ id: values[0], source_type: values[1] });
      return rows([]);
    }

    if (text.includes("insert into work_items")) {
      const row = {
        id: values[0],
        source_memo_id: values[1],
        project_id: values[2],
        feature_group_id: values[3],
        contributor_text: values[4],
        contributor_id: values[5],
        title: values[6],
        body: values[7],
        body_format: values[8],
        workflow_state: values[9],
        workflow_item_version: 1,
        accepted_snapshot_id: null,
        accepted_unexported_changes: false,
        created_at: "2026-05-29T00:00:00.000Z",
        updated_at: "2026-05-29T00:00:00.000Z"
      };
      this.workItems.push(row);
      return rows([row] as unknown as Row[]);
    }

    if (text.includes("insert into import_events")) {
      this.importEvents.push({
        id: values[0],
        source_memo_id: values[1],
        machine_id: values[3],
        status: values[9]
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
      this.auditEvents.push({ id: values[0], event_name: values[1] });
      return rows([]);
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

function rows<Row extends Record<string, unknown>>(resultRows: Row[]): QueryResult<Row> {
  return {
    rows: resultRows,
    rowCount: resultRows.length
  };
}
