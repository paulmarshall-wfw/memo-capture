#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const containerName = process.env.MEMO_CAPTURE_POSTGRES_CONTAINER ?? "memo-capture-postgres-16-8";
const postgresUser = process.env.MEMO_CAPTURE_POSTGRES_USER ?? "memo_capture";
const postgresPassword = process.env.MEMO_CAPTURE_POSTGRES_PASSWORD ?? "memo_capture";
const devDatabase = process.env.MEMO_CAPTURE_DEV_DATABASE ?? "memo_capture";
const testDatabase = process.env.MEMO_CAPTURE_TEST_DATABASE ?? "memo_capture_test";
const testDatabaseUrl =
  process.env.MEMO_CAPTURE_TEST_DATABASE_URL ??
  `postgres://memo_capture:memo_capture@127.0.0.1:5432/${testDatabase}`;

validateIdentifier("MEMO_CAPTURE_POSTGRES_USER", postgresUser);
validateIdentifier("MEMO_CAPTURE_DEV_DATABASE", devDatabase);
validateIdentifier("MEMO_CAPTURE_TEST_DATABASE", testDatabase);

ensurePostgresContainer();

run("docker", [
  "exec",
  containerName,
  "psql",
  "-U",
  postgresUser,
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${testDatabase}';`
]);

run("docker", [
  "exec",
  containerName,
  "psql",
  "-U",
  postgresUser,
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  `drop database if exists ${testDatabase};`
]);

run("docker", [
  "exec",
  containerName,
  "psql",
  "-U",
  postgresUser,
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  `create database ${testDatabase} owner ${postgresUser};`
]);

run("npm", ["run", "db:migrate"], {
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl
  }
});

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    env: options.env ?? process.env,
    stdio: "inherit"
  });

  if (result.status === 0 || options.allowFailure === true) {
    return;
  }

  throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}.`);
}

function ensurePostgresContainer() {
  const started = spawnSync("docker", ["start", containerName], {
    cwd: new URL("..", import.meta.url),
    env: process.env,
    stdio: "inherit"
  });

  if (started.status === 0) {
    return;
  }

  run("docker", [
    "run",
    "--name",
    containerName,
    "-e",
    `POSTGRES_USER=${postgresUser}`,
    "-e",
    `POSTGRES_PASSWORD=${postgresPassword}`,
    "-e",
    `POSTGRES_DB=${devDatabase}`,
    "-p",
    "5432:5432",
    "-d",
    "postgres:16.8-alpine"
  ]);
}

function validateIdentifier(name, value) {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    return;
  }

  throw new Error(`${name} must be a simple Postgres identifier.`);
}
