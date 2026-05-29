import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "../logger.js";
import type { Database, Queryable } from "./types.js";

export interface Migration {
  version: string;
  name: string;
  path: string;
  sql: string;
  checksum: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function runMigrations(
  db: Database,
  options: {
    migrationsDirectory?: string | null;
    logger: Logger;
  }
): Promise<MigrationResult> {
  const migrationsDirectory = options.migrationsDirectory ?? resolveDefaultMigrationsDirectory();
  const migrations = await readMigrations(migrationsDirectory);
  const applied: string[] = [];
  const skipped: string[] = [];

  await db.transaction(async (client) => {
    await ensureMigrationsTable(client);

    for (const migration of migrations) {
      const existing = await client.query<{ checksum: string }>(
        "select checksum from schema_migrations where version = $1",
        [migration.version]
      );

      if (existing.rows[0] !== undefined) {
        if (existing.rows[0].checksum !== migration.checksum) {
          throw new Error(`Migration ${migration.version} checksum changed after it was applied.`);
        }

        skipped.push(migration.version);
        continue;
      }

      options.logger.info("db_migration_applying", {
        version: migration.version,
        name: migration.name
      });

      await client.query(migration.sql);
      await client.query(
        `insert into schema_migrations (version, name, checksum)
         values ($1, $2, $3)`,
        [migration.version, migration.name, migration.checksum]
      );
      applied.push(migration.version);
    }
  });

  return { applied, skipped };
}

async function ensureMigrationsTable(client: Queryable): Promise<void> {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      name text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function readMigrations(migrationsDirectory: string): Promise<Migration[]> {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();

  const migrations: Migration[] = [];

  for (const filename of filenames) {
    const migrationPath = path.join(migrationsDirectory, filename);
    const sql = await readFile(migrationPath, "utf8");
    migrations.push({
      version: filename.replace(/\.sql$/, ""),
      name: filename,
      path: migrationPath,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex")
    });
  }

  return migrations;
}

function resolveDefaultMigrationsDirectory(): string {
  const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "apps/api/db/migrations"),
    path.resolve(process.cwd(), "db/migrations"),
    path.resolve(sourceDirectory, "../../db/migrations")
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? path.resolve(sourceDirectory, "../../db/migrations");
}
