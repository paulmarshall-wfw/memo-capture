import { readApiConfig } from "./config.js";
import { createPgDatabase } from "./db/postgres.js";
import { runMigrations } from "./db/migrations.js";
import { createLogger } from "./logger.js";

const config = readApiConfig();
const logger = createLogger(config.logLevel);
const db = createPgDatabase(config.databaseUrl, logger);

try {
  const result = await runMigrations(db, {
    migrationsDirectory: config.migrationsDirectory,
    logger
  });

  logger.info("db_migrations_complete", result);
} finally {
  await db.close();
}
