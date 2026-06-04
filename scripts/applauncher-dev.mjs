#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeBin = process.execPath;
const nodeBinDir = path.dirname(nodeBin);
const npmBin = path.join(nodeBinDir, "npm");
const apiPort = process.env.MEMO_CAPTURE_API_PORT ?? "4788";
const desktopPort = process.env.MEMO_CAPTURE_DESKTOP_PORT ?? process.env.PORT ?? "5177";
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const desktopUrl = `http://127.0.0.1:${desktopPort}/`;
const workflowBundlePath = path.join(root, "docs/design/memo-capture-0.2.2-workflow-definition-bundled.json");
const requiredTaskHooks = ["memo-expansion", "revise-memo", "suggest-new-memos", "suggest-tags"];
const children = new Set();
let shuttingDown = false;

const baseEnv = {
  ...process.env,
  PATH: [
    nodeBinDir,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    process.env.PATH ?? ""
  ].filter(Boolean).join(":"),
  VITE_MEMO_CAPTURE_API_URL: apiBaseUrl,
  MEMO_CAPTURE_API_HOST: "127.0.0.1",
  MEMO_CAPTURE_API_PORT: apiPort,
  MEMO_CAPTURE_DESKTOP_PORT: desktopPort,
  MEMO_CAPTURE_LOG_LEVEL: "debug",
  MEMO_CAPTURE_APP_VERSION: "0.1.0",
  MEMO_CAPTURE_COMMIT_SHA: "dev",
  DATABASE_URL: "postgres://memo_capture:memo_capture@127.0.0.1:5432/memo_capture",
  OBJECT_STORAGE_BUCKET: "memo-capture",
  OBJECT_STORAGE_LOCAL_ROOT: ".memo-capture/object-storage",
  MEMO_CAPTURE_AUTH_MODE: "local-dev",
  MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
  MEMO_CAPTURE_LOCAL_DEV_AUTH_ISSUER: "memo-capture-local-dev",
  MEMO_CAPTURE_LOCAL_DEV_AUTH_SUBJECT: "local-dev-user",
  MEMO_CAPTURE_LOCAL_DEV_AUTH_EMAIL: "local-dev@example.invalid",
  MEMO_CAPTURE_LOCAL_DEV_AUTH_DISPLAY_NAME: "Local Dev User",
  LLM_PROVIDER: process.env.LLM_PROVIDER ?? "disabled",
  LLM_MODEL: process.env.LLM_MODEL ?? "memo-capture-local-dev-expander-v1",
  TRANSCRIPTION_PROVIDER: "whisper-cpp",
  TRANSCRIPTION_MODEL: "base.en",
  WHISPER_CPP_MODE: "cli",
  WHISPER_CPP_BINARY: "/opt/homebrew/bin/whisper-cpp",
  WHISPER_CPP_MODEL_PATH: "/Users/paulmarshall/Software Development/whisper.cpp/models/ggml-base.en.bin",
  WHISPER_CPP_FFMPEG_BINARY: "/opt/homebrew/bin/ffmpeg",
  WHISPER_CPP_LANGUAGE: "en",
  WHISPER_CPP_THREADS: "4",
  WHISPER_CPP_TIMEOUT_MS: "300000",
  WHISPER_CPP_SERVER_URL: ""
};

function log(message) {
  process.stdout.write(`[memo-capture] ${message}\n`);
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: baseEnv,
    stdio: "inherit",
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function tcpReachable(host, port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForTcp(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tcpReachable(host, port)) {
      return true;
    }
    await delay(500);
  }
  return false;
}

async function httpOk(url, timeoutMs = 1000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await httpOk(url, 1500)) {
      return true;
    }
    await delay(500);
  }
  return false;
}

async function apiSettingsContractOk() {
  try {
    const sessionResponse = await fetch(`${apiBaseUrl}/api/dev-auth/session`, { method: "POST" });
    if (!sessionResponse.ok) {
      return false;
    }
    const session = await sessionResponse.json();
    const settingsResponse = await fetch(`${apiBaseUrl}/api/settings`, {
      headers: {
        authorization: `Bearer ${session.accessToken}`
      }
    });
    if (!settingsResponse.ok) {
      return false;
    }
    const settings = await settingsResponse.json();
    const hookKeys = Array.isArray(settings.registeredTaskHooks)
      ? settings.registeredTaskHooks.map((hook) => hook?.hookKey)
      : [];
    return Array.isArray(settings.aiTasks) && requiredTaskHooks.every((hookKey) => hookKeys.includes(hookKey));
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePostgres() {
  if (await waitForTcp("127.0.0.1", 5432, 1000)) {
    log("Postgres is already reachable on 127.0.0.1:5432.");
    return;
  }

  log("Starting local Postgres container memo-capture-postgres-16-8.");
  const started = spawnSync("docker", ["start", "memo-capture-postgres-16-8"], {
    cwd: root,
    env: baseEnv,
    stdio: "inherit"
  });

  if (started.status !== 0) {
    runChecked("docker", [
      "run",
      "--name",
      "memo-capture-postgres-16-8",
      "-e",
      "POSTGRES_USER=memo_capture",
      "-e",
      "POSTGRES_PASSWORD=memo_capture",
      "-e",
      "POSTGRES_DB=memo_capture",
      "-p",
      "5432:5432",
      "-d",
      "postgres:16.8-alpine"
    ]);
  }

  if (!(await waitForTcp("127.0.0.1", 5432, 30_000))) {
    throw new Error("Postgres did not become reachable on 127.0.0.1:5432.");
  }
}

function spawnService(label, args, env = {}) {
  log(`Starting ${label}.`);
  const child = spawn(npmBin, args, {
    cwd: root,
    env: { ...baseEnv, ...env },
    stdio: "inherit"
  });
  children.add(child);
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      shutdown(code ?? (signal === null ? 1 : 0), `${label} exited.`);
    }
  });
  return child;
}

async function ensureWorkflowActive() {
  const sessionResponse = await fetch(`${apiBaseUrl}/api/dev-auth/session`, { method: "POST" });
  if (!sessionResponse.ok) {
    throw new Error(`Could not create local-dev session: HTTP ${sessionResponse.status}.`);
  }
  const session = await sessionResponse.json();
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${session.accessToken}`
  };

  const statusResponse = await fetch(`${apiBaseUrl}/api/workflow/status`, { headers });
  if (statusResponse.ok) {
    const status = await statusResponse.json();
    if (status.active !== null) {
      log(`Workflow ${status.active.workflowVersion} is already active.`);
      return;
    }
  }

  log("Activating workflow bundle 0.2.2 for local development.");
  const bundle = JSON.parse(await readFile(workflowBundlePath, "utf8"));
  const importResponse = await fetch(`${apiBaseUrl}/api/workflow/imports`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      bundle,
      notes: "Seeded by AppLauncher local development bootstrap."
    })
  });
  if (!importResponse.ok) {
    throw new Error(`Workflow import failed: HTTP ${importResponse.status} ${await importResponse.text()}`);
  }
  const imported = await importResponse.json();

  const activationResponse = await fetch(`${apiBaseUrl}/api/workflow/imports/${imported.stagedImportId}/activate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      confirmActivation: true,
      activationNotes: "Activated by AppLauncher local development bootstrap."
    })
  });
  if (!activationResponse.ok) {
    throw new Error(`Workflow activation failed: HTTP ${activationResponse.status} ${await activationResponse.text()}`);
  }
}

function shutdown(exitCode, reason) {
  shuttingDown = true;
  log(reason);
  for (const child of children) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 500).unref();
}

process.once("SIGINT", () => shutdown(0, "Received SIGINT."));
process.once("SIGTERM", () => shutdown(0, "Received SIGTERM."));

try {
  await ensurePostgres();
  log("Applying database migrations.");
  runChecked(npmBin, ["run", "db:migrate"]);

  if ((await httpOk(`${apiBaseUrl}/health`)) && (await apiSettingsContractOk())) {
    log("API is already running.");
  } else if (await tcpReachable("127.0.0.1", Number(apiPort), 1000)) {
    throw new Error(
      `Port ${apiPort} is occupied by a Memo Capture API that does not expose the current Settings contract. Stop that process and relaunch.`
    );
  } else {
    spawnService("API", ["run", "dev", "-w", "@memo-capture/api"]);
    if (!(await waitForHttp(`${apiBaseUrl}/health`, 30_000))) {
      throw new Error("API did not become healthy.");
    }
  }

  await ensureWorkflowActive();
  spawnService("worker", ["run", "dev", "-w", "@memo-capture/worker"]);

  if (await httpOk(desktopUrl)) {
    log("Desktop web UI is already running.");
  } else {
    spawnService("desktop web UI", [
      "run",
      "dev",
      "-w",
      "@memo-capture/desktop",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      desktopPort,
      "--strictPort"
    ]);
    if (!(await waitForHttp(desktopUrl, 30_000))) {
      throw new Error("Desktop web UI did not become ready.");
    }
  }

  log(`Ready: ${desktopUrl}`);
  await new Promise(() => {});
} catch (error) {
  shutdown(1, error instanceof Error ? error.message : String(error));
}
