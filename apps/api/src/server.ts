import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { ApiConfig } from "./config.js";
import { createHealthPayload } from "./health.js";
import type { Logger } from "./logger.js";

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

export function createApiServer(config: ApiConfig, logger: Logger): Server {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const requestId = request.headers["x-request-id"] ?? randomUUID();

    logger.debug("request_received", {
      requestId,
      method: request.method,
      path: url.pathname
    });

    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/v1/health")) {
      sendJson(response, 200, createHealthPayload(config, "memo-capture-api"));
      return;
    }

    if (request.method === "GET" && url.pathname === "/ready") {
      sendJson(response, 200, createHealthPayload(config, "memo-capture-api"));
      return;
    }

    if (request.method === "GET" && url.pathname === "/version") {
      sendJson(response, 200, {
        version: config.appVersion,
        commitSha: config.commitSha
      });
      return;
    }

    sendNotFound(response);
  });
}
