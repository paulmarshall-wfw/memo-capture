import assert from "node:assert/strict";
import test from "node:test";
import { createPgDatabase } from "../../src/db/postgres.js";
import type { Logger } from "../../src/logger.js";
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
