import pg from "pg";
import type { Logger } from "../logger.js";
import type { Database, QueryParams, QueryResult, Queryable } from "./types.js";

const { Pool } = pg;

export class PgDatabase implements Database {
  private readonly pool: pg.Pool;

  constructor(connectionString: string, private readonly logger: Logger) {
    if (connectionString.trim() === "") {
      throw new Error("DATABASE_URL is required for Postgres database access.");
    }

    this.pool = new Pool({ connectionString });
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: QueryParams = []
  ): Promise<QueryResult<Row>> {
    const result = await this.pool.query<Row>(text, [...values]);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length
    };
  }

  async transaction<Result>(operation: (client: Queryable) => Promise<Result>): Promise<Result> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const result = await operation({
        query: async <Row extends Record<string, unknown> = Record<string, unknown>>(
          text: string,
          values: QueryParams = []
        ): Promise<QueryResult<Row>> => {
          const queryResult = await client.query<Row>(text, [...values]);
          return {
            rows: queryResult.rows,
            rowCount: queryResult.rowCount ?? queryResult.rows.length
          };
        }
      });
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      this.logger.error("db_transaction_rolled_back", {
        error: error instanceof Error ? error.message : "unknown_error"
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createPgDatabase(connectionString: string, logger: Logger): Database {
  return new PgDatabase(connectionString, logger);
}
