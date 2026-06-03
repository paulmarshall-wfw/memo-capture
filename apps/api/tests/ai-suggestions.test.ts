import assert from "node:assert/strict";
import test from "node:test";
import { AiSuggestionRepository } from "../src/repositories/ai-suggestions.js";
import type { QueryParams, QueryResult } from "../src/db/types.js";

test("AI suggestion active review list includes pending suggestions only", async () => {
  let capturedSql = "";
  let capturedValues: QueryParams | undefined;
  const db = {
    async query<Row extends Record<string, unknown>>(text: string, values?: QueryParams): Promise<QueryResult<Row>> {
      capturedSql = text;
      capturedValues = values;
      return { rows: [], rowCount: 0 };
    }
  };

  await new AiSuggestionRepository(db).listForWorkItem("work-item-1");

  assert.match(capturedSql, /where parent_work_item_id = \$1\s+and status = 'pending'/);
  assert.deepEqual(capturedValues, ["work-item-1"]);
});
