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
