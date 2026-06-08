import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ApiConfig } from "./config.js";
import { createHealthPayload } from "./health.js";
import type { Logger } from "./logger.js";
import type { AppServices } from "./services/app.js";
import type { AuthenticatedSession } from "./services/auth.js";
import { HttpError } from "./services/errors.js";

interface RequestContext {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  requestId: string;
}

type RouteHandler = (context: RequestContext, session: AuthenticatedSession) => Promise<unknown>;

export function createApiServer(config: ApiConfig, logger: Logger, services: AppServices): Server {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    void handleRequest({ config, logger, services, request, response });
  });
}

async function handleRequest(input: {
  config: ApiConfig;
  logger: Logger;
  services: AppServices;
  request: IncomingMessage;
  response: ServerResponse;
}): Promise<void> {
  const url = new URL(input.request.url ?? "/", `http://${input.request.headers.host ?? "localhost"}`);
  const requestId = readRequestId(input.request);
  input.response.setHeader("x-request-id", requestId);

  const context: RequestContext = {
    request: input.request,
    response: input.response,
    url,
    requestId
  };

  input.logger.debug("request_received", {
    requestId,
    method: input.request.method,
    path: url.pathname
  });

  try {
    if (input.request.method === "OPTIONS") {
      sendNoContent(input.response);
      return;
    }

    const publicPayload = await handlePublicRoute(context, input.config, input.services);
    if (publicPayload.handled) {
      sendJson(input.response, publicPayload.statusCode, publicPayload.payload);
      return;
    }

    const protectedHandler = matchProtectedRoute(input.request.method ?? "GET", url.pathname, input.services);
    if (protectedHandler === null) {
      sendNotFound(input.response);
      return;
    }

    const session = await input.services.auth.authenticateAuthorizationHeader(
      normalizeHeader(input.request.headers.authorization)
    );
    const payload = await protectedHandler(context, session);
    if (input.response.writableEnded) {
      return;
    }
    sendJson(input.response, 200, payload);
  } catch (error) {
    input.logger.warn("request_failed", {
      requestId,
      method: input.request.method,
      path: url.pathname,
      error: error instanceof Error ? error.message : "unknown_error"
    });
    sendError(input.response, error);
  }
}

async function handlePublicRoute(
  context: RequestContext,
  config: ApiConfig,
  services: AppServices
): Promise<{ handled: false } | { handled: true; statusCode: number; payload: unknown }> {
  if (
    context.request.method === "GET" &&
    (context.url.pathname === "/health" || context.url.pathname === "/api/v1/health")
  ) {
    return {
      handled: true,
      statusCode: 200,
      payload: createHealthPayload(config, "memo-capture-api")
    };
  }

  if (context.request.method === "GET" && context.url.pathname === "/ready") {
    return {
      handled: true,
      statusCode: 200,
      payload: createHealthPayload(config, "memo-capture-api")
    };
  }

  if (context.request.method === "GET" && context.url.pathname === "/version") {
    return {
      handled: true,
      statusCode: 200,
      payload: {
        version: config.appVersion,
        commitSha: config.commitSha
      }
    };
  }

  if (context.request.method === "POST" && context.url.pathname === "/api/dev-auth/session") {
    const session = await services.auth.createLocalDevSession();
    return {
      handled: true,
      statusCode: 200,
      payload: serializeSession(session, session.accessToken)
    };
  }

  return { handled: false };
}

function matchProtectedRoute(
  method: string,
  pathname: string,
  services: AppServices
): RouteHandler | null {
  if (method === "GET" && (pathname === "/api/auth/session" || pathname === "/api/current-session")) {
    return async (_context, session) => serializeSession(session);
  }

  if (method === "GET" && pathname === "/api/projects") {
    return async () => ({ projects: await services.catalog.listProjects() });
  }

  if (method === "POST" && pathname === "/api/projects") {
    return async (context, session) => ({
      project: await services.catalog.createProject(
        await readJsonBody(context.request),
        session.user,
        context.requestId
      )
    });
  }

  const projectDeactivateMatch = /^\/api\/projects\/([^/]+)\/deactivate$/.exec(pathname);
  if (method === "POST" && projectDeactivateMatch !== null) {
    return async (context, session) => ({
      project: requireFound(
        await services.catalog.deactivateProject(
          projectDeactivateMatch[1] ?? "",
          session.user,
          context.requestId
        ),
        "project"
      )
    });
  }

  const projectPatchMatch = /^\/api\/projects\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && projectPatchMatch !== null) {
    return async (context, session) => ({
      project: requireFound(
        await services.catalog.deleteProject(
          projectPatchMatch[1] ?? "",
          session.user,
          context.requestId
        ),
        "project"
      )
    });
  }

  if (method === "PATCH" && projectPatchMatch !== null) {
    return async (context, session) => ({
      project: requireFound(
        await services.catalog.updateProject(
          projectPatchMatch[1] ?? "",
          await readJsonBody(context.request),
          session.user,
          context.requestId
        ),
        "project"
      )
    });
  }

  if (method === "GET" && pathname === "/api/contributors") {
    return async () => ({ contributors: await services.catalog.listContributors() });
  }

  if (method === "POST" && pathname === "/api/contributors") {
    return async (context, session) => ({
      contributor: await services.catalog.createContributor(
        await readJsonBody(context.request),
        session.user,
        context.requestId
      )
    });
  }

  const contributorDeactivateMatch = /^\/api\/contributors\/([^/]+)\/deactivate$/.exec(pathname);
  if (method === "POST" && contributorDeactivateMatch !== null) {
    return async (context, session) => ({
      contributor: requireFound(
        await services.catalog.deactivateContributor(
          contributorDeactivateMatch[1] ?? "",
          session.user,
          context.requestId
        ),
        "contributor"
      )
    });
  }

  const contributorPatchMatch = /^\/api\/contributors\/([^/]+)$/.exec(pathname);
  if (method === "PATCH" && contributorPatchMatch !== null) {
    return async (context, session) => ({
      contributor: requireFound(
        await services.catalog.updateContributor(
          contributorPatchMatch[1] ?? "",
          await readJsonBody(context.request),
          session.user,
          context.requestId
        ),
        "contributor"
      )
    });
  }

  if (method === "GET" && pathname === "/api/work-items") {
    return async (context) => ({
      workItems: await services.workItems.list({
        bucketId: context.url.searchParams.get("bucketId")
      })
    });
  }

  if (method === "GET" && pathname === "/api/tags/suppressed") {
    return async () => services.tags.listSuppressed();
  }

  if (method === "POST" && pathname === "/api/tags/suppressed") {
    return async (context, session) =>
      services.tags.suppress(await readJsonBody(context.request), session.user, context.requestId);
  }

  const suppressedTagMatch = /^\/api\/tags\/suppressed\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && suppressedTagMatch !== null) {
    return async (context, session) =>
      services.tags.unsuppress(
        decodeURIComponent(suppressedTagMatch[1] ?? ""),
        session.user,
        context.requestId
      );
  }

  if (method === "GET" && pathname === "/api/jobs") {
    return async (context) => services.jobs.list(context.url.searchParams);
  }

  if (method === "GET" && pathname === "/api/settings") {
    return async () => services.settings.getSummary();
  }

  if (method === "POST" && pathname === "/api/settings/file-types") {
    return async (context, session) =>
      services.settings.createFileType(await readJsonBody(context.request), session.user, context.requestId);
  }

  if (method === "POST" && pathname === "/api/settings/media-types") {
    return async (context, session) =>
      services.settings.createMediaType(await readJsonBody(context.request), session.user, context.requestId);
  }

  if (method === "POST" && pathname === "/api/settings/parser-types") {
    return async (context, session) =>
      services.settings.createParserType(await readJsonBody(context.request), session.user, context.requestId);
  }

  if (method === "PATCH" && pathname === "/api/settings/extraction") {
    return async (context, session) =>
      services.settings.updateExtraction(await readJsonBody(context.request), session.user, context.requestId);
  }

  if (method === "PATCH" && pathname === "/api/settings/transcription") {
    return async (context, session) =>
      services.settings.updateTranscription(await readJsonBody(context.request), session.user, context.requestId);
  }

  if (method === "GET" && pathname === "/api/settings/registry/status") {
    return async () => services.settings.getRegistryStatus();
  }

  if (method === "POST" && pathname === "/api/settings/providers/refresh") {
    return async () => services.settings.getRegistryStatus();
  }

  if (method === "GET" && pathname === "/api/settings/readiness") {
    return async () => services.settings.getReadinessDiagnostics();
  }

  if (method === "POST" && pathname === "/api/settings/provider-diagnostics") {
    return async (context) => services.settings.diagnoseProviderAdapter(await readJsonBody(context.request));
  }

  if (method === "GET" && pathname === "/api/settings/render-slots") {
    return async () => services.settings.listRenderSlots();
  }

  const renderSlotActionsMatch = /^\/api\/settings\/render-slots\/([^/]+)\/actions$/.exec(pathname);
  if (method === "GET" && renderSlotActionsMatch !== null) {
    return async () => services.settings.getRenderSlotActions(decodeURIComponent(renderSlotActionsMatch[1] ?? ""));
  }

  if (method === "GET" && pathname === "/api/settings/task-runs") {
    return async (context) => services.settings.listTaskRuns(context.url.searchParams);
  }

  if (method === "GET" && pathname === "/api/settings/task-runs/grouped") {
    return async (context) => services.settings.groupTaskRuns(context.url.searchParams);
  }

  if (method === "POST" && pathname === "/api/settings/task-kinds") {
    return async (context, session) =>
      services.settings.createTaskKind(await readJsonBody(context.request), session.user, context.requestId);
  }

  if (method === "POST" && pathname === "/api/settings/processing-hooks") {
    return async (context, session) =>
      services.settings.createProcessingHook(await readJsonBody(context.request), session.user, context.requestId);
  }

  const processingHookDeleteMatch = /^\/api\/settings\/processing-hooks\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && processingHookDeleteMatch !== null) {
    return async (context, session) =>
      services.settings.deleteProcessingHook(
        decodeURIComponent(processingHookDeleteMatch[1] ?? ""),
        session.user,
        context.requestId
      );
  }

  const taskKindPatchMatch = /^\/api\/settings\/task-kinds\/([^/]+)$/.exec(pathname);
  if (method === "PATCH" && taskKindPatchMatch !== null) {
    return async (context, session) =>
      services.settings.updateTaskKind(
        decodeURIComponent(taskKindPatchMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  if (method === "POST" && pathname === "/api/settings/ai-tasks") {
    return async (context, session) =>
      services.settings.createAiTaskDefinition(await readJsonBody(context.request), session.user, context.requestId);
  }

  const aiTaskPatchMatch = /^\/api\/settings\/ai-tasks\/([^/]+)$/.exec(pathname);
  if (method === "PATCH" && aiTaskPatchMatch !== null) {
    return async (context, session) =>
      services.settings.updateAiTaskDefinition(
        decodeURIComponent(aiTaskPatchMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }
  if (method === "DELETE" && aiTaskPatchMatch !== null) {
    return async (context, session) =>
      services.settings.deleteAiTaskDefinition(
        decodeURIComponent(aiTaskPatchMatch[1] ?? ""),
        session.user,
        context.requestId
      );
  }

  const aiTaskRoutePatchMatch = /^\/api\/settings\/ai-tasks\/([^/]+)\/route$/.exec(pathname);
  if (method === "PATCH" && aiTaskRoutePatchMatch !== null) {
    return async (context, session) =>
      services.settings.updateAiTaskRoute(
        decodeURIComponent(aiTaskRoutePatchMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  const fileTypePatchMatch = /^\/api\/settings\/file-types\/([^/]+)$/.exec(pathname);
  if (method === "PATCH" && fileTypePatchMatch !== null) {
    return async (context, session) =>
      services.settings.updateFileType(
        decodeURIComponent(fileTypePatchMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }
  if (method === "DELETE" && fileTypePatchMatch !== null) {
    return async (context, session) =>
      services.settings.deleteFileType(
        decodeURIComponent(fileTypePatchMatch[1] ?? ""),
        session.user,
        context.requestId
      );
  }

  const mediaTypePatchMatch = /^\/api\/settings\/media-types\/([^/]+)$/.exec(pathname);
  if (method === "PATCH" && mediaTypePatchMatch !== null) {
    return async (context, session) =>
      services.settings.updateMediaType(
        decodeURIComponent(mediaTypePatchMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }
  if (method === "DELETE" && mediaTypePatchMatch !== null) {
    return async (context, session) =>
      services.settings.deleteMediaType(
        decodeURIComponent(mediaTypePatchMatch[1] ?? ""),
        session.user,
        context.requestId
      );
  }

  const parserTypePatchMatch = /^\/api\/settings\/parser-types\/([^/]+)$/.exec(pathname);
  if (method === "PATCH" && parserTypePatchMatch !== null) {
    return async (context, session) =>
      services.settings.updateParserType(
        decodeURIComponent(parserTypePatchMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }
  if (method === "DELETE" && parserTypePatchMatch !== null) {
    return async (context, session) =>
      services.settings.deleteParserType(
        decodeURIComponent(parserTypePatchMatch[1] ?? ""),
        session.user,
        context.requestId
      );
  }

  const promptVersionMatch = /^\/api\/settings\/prompts\/([^/]+)\/versions$/.exec(pathname);
  if (method === "POST" && promptVersionMatch !== null) {
    return async (context, session) =>
      services.settings.createPromptVersion(
        decodeURIComponent(promptVersionMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  const promptCurrentMatch = /^\/api\/settings\/prompts\/([^/]+)\/current$/.exec(pathname);
  if (method === "PATCH" && promptCurrentMatch !== null) {
    return async (context, session) =>
      services.settings.updateCurrentPrompt(
        decodeURIComponent(promptCurrentMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  if (method === "GET" && pathname === "/api/audit-events") {
    return async (context) => ({
      auditEvents: await services.audit.list(context.url.searchParams)
    });
  }

  const jobRetryMatch = /^\/api\/jobs\/([^/]+)\/retry$/.exec(pathname);
  if (method === "POST" && jobRetryMatch !== null) {
    return async (context, session) =>
      services.jobs.retry(
        decodeURIComponent(jobRetryMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  const jobCancelMatch = /^\/api\/jobs\/([^/]+)\/cancel$/.exec(pathname);
  if (method === "POST" && jobCancelMatch !== null) {
    return async (context, session) =>
      services.jobs.cancel(
        decodeURIComponent(jobCancelMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  const jobDetailMatch = /^\/api\/jobs\/([^/]+)$/.exec(pathname);
  if (method === "GET" && jobDetailMatch !== null) {
    return async () => services.jobs.get(decodeURIComponent(jobDetailMatch[1] ?? ""));
  }

  if (method === "GET" && pathname === "/api/diagnostics/system") {
    return async () => services.diagnostics.getSystemDiagnostics();
  }

  if (method === "GET" && pathname === "/api/diagnostics/providers") {
    return async () => services.diagnostics.listProviderHealth();
  }

  if (method === "GET" && pathname === "/api/exports/accepted-snapshots") {
    return async (context) => services.exports.listAcceptedSnapshots(context.url.searchParams);
  }

  if (method === "GET" && pathname === "/api/exports/batches") {
    return async () => services.exports.listBatches();
  }

  if (method === "POST" && pathname === "/api/exports/batches") {
    return async (context, session) =>
      services.exports.createBatch(await readJsonBody(context.request), session.user, context.requestId);
  }

  const exportBatchDownloadMatch = /^\/api\/exports\/batches\/([^/]+)\/download$/.exec(pathname);
  if (method === "GET" && exportBatchDownloadMatch !== null) {
    return async (context, session) => {
      const download = await services.exports.downloadBundle(
        decodeURIComponent(exportBatchDownloadMatch[1] ?? ""),
        session.user,
        context.requestId
      );
      sendBinary(context.response, 200, download.body, {
        "content-type": download.contentType,
        "content-disposition": `attachment; filename="${download.filename.replaceAll('"', "")}"`,
        "cache-control": "no-store"
      });
      return undefined;
    };
  }

  const exportBatchMatch = /^\/api\/exports\/batches\/([^/]+)$/.exec(pathname);
  if (method === "GET" && exportBatchMatch !== null) {
    return async () => services.exports.getBatch(decodeURIComponent(exportBatchMatch[1] ?? ""));
  }

  const artifactDownloadMatch = /^\/api\/artifacts\/([^/]+)\/download$/.exec(pathname);
  if (method === "GET" && artifactDownloadMatch !== null) {
    return async (context) => {
      const download = await services.artifacts.download(decodeURIComponent(artifactDownloadMatch[1] ?? ""));
      sendBinary(context.response, 200, download.body, {
        "content-type": download.contentType,
        "content-disposition": `attachment; filename="${download.filename.replaceAll('"', "")}"`,
        "cache-control": "no-store"
      });
      return undefined;
    };
  }

  if (method === "GET" && pathname === "/api/workflow/status") {
    return async () => services.workflows.getStatus();
  }

  if (method === "POST" && pathname === "/api/workflow/imports") {
    return async (context, session) =>
      services.workflows.importBundle(await readJsonBody(context.request), session.user, context.requestId);
  }

  const workflowActivateMatch = /^\/api\/workflow\/imports\/([^/]+)\/activate$/.exec(pathname);
  if (method === "POST" && workflowActivateMatch !== null) {
    return async (context, session) =>
      services.workflows.activateStagedImport(
        decodeURIComponent(workflowActivateMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  if (method === "GET" && pathname === "/api/workflow/buckets") {
    return async () => services.workflows.getBuckets();
  }

  if (method === "GET" && pathname === "/api/workflow/debugger/snapshot") {
    return async (context) =>
      services.workflows.getDebuggerSnapshot(readDebuggerItemRef(context.url.searchParams));
  }

  if (method === "POST" && pathname === "/api/workflow/debugger/start") {
    return async (context, session) =>
      services.workflows.startDebugger(await readJsonBody(context.request), session.user, context.requestId);
  }

  if (method === "POST" && pathname === "/api/workflow/debugger/pause") {
    return async (context, session) =>
      services.workflows.pauseDebugger(await readJsonBody(context.request), session.user, context.requestId);
  }

  if (method === "POST" && pathname === "/api/workflow/debugger/resume") {
    return async (context, session) =>
      services.workflows.resumeDebugger(await readJsonBody(context.request), session.user, context.requestId);
  }

  if (method === "POST" && pathname === "/api/workflow/debugger/step") {
    return async (context, session) =>
      services.workflows.stepDebugger(await readJsonBody(context.request), session.user, context.requestId);
  }

  if (method === "POST" && pathname === "/api/workflow/debugger/stop") {
    return async (context, session) =>
      services.workflows.stopDebugger(await readJsonBody(context.request), session.user, context.requestId);
  }

  const workItemDetailMatch = /^\/api\/work-items\/([^/]+)$/.exec(pathname);
  if (method === "GET" && workItemDetailMatch !== null) {
    return async () => ({
      workItem: requireFound(
        await services.workItems.findById(workItemDetailMatch[1] ?? ""),
        "work_item"
      )
    });
  }

  const workItemDiagnosticsMatch = /^\/api\/work-items\/([^/]+)\/diagnostics$/.exec(pathname);
  if (method === "GET" && workItemDiagnosticsMatch !== null) {
    return async () =>
      services.diagnostics.getWorkItemDiagnostics(decodeURIComponent(workItemDiagnosticsMatch[1] ?? ""));
  }

  const workItemPhotoAttachmentsMatch = /^\/api\/work-items\/([^/]+)\/photo-attachments$/.exec(pathname);
  if (method === "GET" && workItemPhotoAttachmentsMatch !== null) {
    return async () =>
      services.workItems.listPhotoAttachments(decodeURIComponent(workItemPhotoAttachmentsMatch[1] ?? ""));
  }

  const workItemTagSuggestionsMatch = /^\/api\/work-items\/([^/]+)\/tag-suggestions$/.exec(pathname);
  if (method === "GET" && workItemTagSuggestionsMatch !== null) {
    return async () =>
      services.workItems.getTagSuggestions(decodeURIComponent(workItemTagSuggestionsMatch[1] ?? ""));
  }

  if (method === "PATCH" && workItemDetailMatch !== null) {
    return async (context, session) => ({
      workItem: await services.workItems.update(
        decodeURIComponent(workItemDetailMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      )
    });
  }

  const workItemManualTranscriptMatch = /^\/api\/work-items\/([^/]+)\/manual-transcript$/.exec(pathname);
  if (method === "POST" && workItemManualTranscriptMatch !== null) {
    return async (context, session) => ({
      workItem: await services.workItems.recoverTranscript(
        decodeURIComponent(workItemManualTranscriptMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      )
    });
  }

  const workItemAiSuggestionsMatch = /^\/api\/work-items\/([^/]+)\/ai-suggestions$/.exec(pathname);
  if (method === "GET" && workItemAiSuggestionsMatch !== null) {
    return async () => services.ai.listSuggestions(decodeURIComponent(workItemAiSuggestionsMatch[1] ?? ""));
  }

  const workItemAiExpandMatch = /^\/api\/work-items\/([^/]+)\/ai-expansions$/.exec(pathname);
  if (method === "POST" && workItemAiExpandMatch !== null) {
    return async (context, session) =>
      services.ai.expandWorkItem(
        decodeURIComponent(workItemAiExpandMatch[1] ?? ""),
        session.user,
        context.requestId
      );
  }

  const workItemTaskRunMatch = /^\/api\/work-items\/([^/]+)\/tasks\/([^/]+)\/run$/.exec(pathname);
  if (method === "POST" && workItemTaskRunMatch !== null) {
    return async (context, session) =>
      services.ai.runWorkItemTask(
        decodeURIComponent(workItemTaskRunMatch[1] ?? ""),
        decodeURIComponent(workItemTaskRunMatch[2] ?? ""),
        session.user,
        context.requestId
      );
  }

  const aiSuggestionAcceptMatch = /^\/api\/ai-suggestions\/([^/]+)\/accept$/.exec(pathname);
  if (method === "POST" && aiSuggestionAcceptMatch !== null) {
    return async (context, session) =>
      services.ai.acceptSuggestion(
        decodeURIComponent(aiSuggestionAcceptMatch[1] ?? ""),
        session.user,
        context.requestId
      );
  }

  const aiSuggestionDismissMatch = /^\/api\/ai-suggestions\/([^/]+)\/dismiss$/.exec(pathname);
  if (method === "POST" && aiSuggestionDismissMatch !== null) {
    return async (context, session) =>
      services.ai.dismissSuggestion(
        decodeURIComponent(aiSuggestionDismissMatch[1] ?? ""),
        session.user,
        context.requestId
      );
  }

  const workItemEphemeralSuggestionAcceptMatch = /^\/api\/work-items\/([^/]+)\/suggested-work-items\/accept$/.exec(pathname);
  if (method === "POST" && workItemEphemeralSuggestionAcceptMatch !== null) {
    return async (context, session) =>
      services.ai.acceptEphemeralSuggestedWorkItem(
        decodeURIComponent(workItemEphemeralSuggestionAcceptMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  const workItemActionsMatch = /^\/api\/work-items\/([^/]+)\/actions$/.exec(pathname);
  if (method === "GET" && workItemActionsMatch !== null) {
    return async () => services.workflows.getAllowedActions(decodeURIComponent(workItemActionsMatch[1] ?? ""));
  }

  const workItemExecuteActionMatch = /^\/api\/work-items\/([^/]+)\/actions\/([^/]+)$/.exec(pathname);
  if (method === "POST" && workItemExecuteActionMatch !== null) {
    return async (context, session) =>
      services.workflows.executeAction(
        decodeURIComponent(workItemExecuteActionMatch[1] ?? ""),
        decodeURIComponent(workItemExecuteActionMatch[2] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  if (method === "POST" && pathname === "/api/source-memos/form") {
    return async (context, session) => ({
      result: await services.formMemos.createFromRequest(
        await readJsonBody(context.request),
        session.user,
        context.requestId
      )
    });
  }

  if (method === "GET" && pathname === "/api/photo-imports") {
    return async () => services.photoImports.list();
  }

  if (method === "POST" && pathname === "/api/photo-imports/create-memo") {
    return async (context, session) =>
      services.photoImports.createMemoFromPhotos(
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  if (method === "POST" && pathname === "/api/imports/upload-sessions") {
    return async (context, session) =>
      services.imports.createUploadSession(await readJsonBody(context.request), session.user, context.requestId);
  }

  const importUploadArtifactMatch = /^\/api\/imports\/upload-sessions\/([^/]+)\/artifact$/.exec(pathname);
  if (method === "PUT" && importUploadArtifactMatch !== null) {
    return async (context) =>
      services.imports.uploadSessionArtifact(
        decodeURIComponent(importUploadArtifactMatch[1] ?? ""),
        await readBinaryBody(context.request)
      );
  }

  const importFinalizeMatch = /^\/api\/imports\/upload-sessions\/([^/]+)\/finalize$/.exec(pathname);
  if (method === "POST" && importFinalizeMatch !== null) {
    return async (context, session) =>
      services.imports.finalizeUploadSession(
        decodeURIComponent(importFinalizeMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  const archiveResultMatch = /^\/api\/imports\/([^/]+)\/archive-result$/.exec(pathname);
  if (method === "POST" && archiveResultMatch !== null) {
    return async (context, session) =>
      services.imports.reportArchiveResult(
        decodeURIComponent(archiveResultMatch[1] ?? ""),
        await readJsonBody(context.request),
        session.user,
        context.requestId
      );
  }

  if (pathname.startsWith("/api/feature-groups")) {
    return null;
  }

  if (pathname.startsWith("/api/")) {
    return async () => {
      throw new HttpError(501, "not_implemented", "Protected API route is not implemented yet.");
    };
  }

  return null;
}

function requireFound<Record>(record: Record | null, subjectType: string): Record {
  if (record === null) {
    throw new HttpError(404, "not_found", `${subjectType} was not found.`);
  }

  return record;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders()
  });
  response.end(JSON.stringify(payload));
}

function sendNoContent(response: ServerResponse): void {
  response.writeHead(204, corsHeaders());
  response.end();
}

function sendBinary(
  response: ServerResponse,
  statusCode: number,
  body: Buffer,
  headers: Record<string, string>
): void {
  response.writeHead(statusCode, {
    ...headers,
    ...corsHeaders()
  });
  response.end(body);
}

function sendNotFound(response: ServerResponse): void {
  sendJson(response, 404, {
    error: {
      code: "not_found",
      message: "Route not found."
    }
  });
}

function sendError(response: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(response, error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  sendJson(response, 500, {
    error: {
      code: "internal_error",
      message: "Internal server error."
    }
  });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (body === "") {
    return {};
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

async function readBinaryBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function readRequestId(request: IncomingMessage): string {
  const header = request.headers["x-request-id"];
  if (Array.isArray(header)) {
    return header[0] ?? randomUUID();
  }

  return typeof header === "string" && header.trim() !== "" ? header : randomUUID();
}

function normalizeHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readDebuggerItemRef(searchParams: URLSearchParams):
  | { resourceType: string; resourceId: string }
  | undefined {
  const resourceType = searchParams.get("resourceType")?.trim();
  const resourceId = searchParams.get("resourceId")?.trim();
  if (resourceType === undefined || resourceId === undefined || resourceType === "" || resourceId === "") {
    return undefined;
  }
  return { resourceType, resourceId };
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-request-id",
    "access-control-expose-headers": "content-disposition,x-request-id"
  };
}

function serializeSession(session: AuthenticatedSession, accessToken?: string) {
  return {
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      isAdmin: session.isAdmin
    },
    authMode: session.authMode,
    ...(accessToken === undefined ? {} : { accessToken })
  };
}
