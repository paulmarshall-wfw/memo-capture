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

  if (method === "GET" && pathname === "/api/feature-groups") {
    return async () => ({ featureGroups: await services.catalog.listFeatureGroups() });
  }

  if (method === "POST" && pathname === "/api/feature-groups") {
    return async (context, session) => ({
      featureGroup: await services.catalog.createFeatureGroup(
        await readJsonBody(context.request),
        session.user,
        context.requestId
      )
    });
  }

  const featureGroupDeactivateMatch = /^\/api\/feature-groups\/([^/]+)\/deactivate$/.exec(pathname);
  if (method === "POST" && featureGroupDeactivateMatch !== null) {
    return async (context, session) => ({
      featureGroup: requireFound(
        await services.catalog.deactivateFeatureGroup(
          featureGroupDeactivateMatch[1] ?? "",
          session.user,
          context.requestId
        ),
        "feature_group"
      )
    });
  }

  const featureGroupPatchMatch = /^\/api\/feature-groups\/([^/]+)$/.exec(pathname);
  if (method === "PATCH" && featureGroupPatchMatch !== null) {
    return async (context, session) => ({
      featureGroup: requireFound(
        await services.catalog.updateFeatureGroup(
          featureGroupPatchMatch[1] ?? "",
          await readJsonBody(context.request),
          session.user,
          context.requestId
        ),
        "feature_group"
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
    return async () => ({ workItems: await services.workItems.list() });
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

  const workItemDetailMatch = /^\/api\/work-items\/([^/]+)$/.exec(pathname);
  if (method === "GET" && workItemDetailMatch !== null) {
    return async () => ({
      workItem: requireFound(
        await services.workItems.findById(workItemDetailMatch[1] ?? ""),
        "work_item"
      )
    });
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
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
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
