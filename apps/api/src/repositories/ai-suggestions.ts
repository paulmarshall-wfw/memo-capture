import { randomUUID } from "node:crypto";
import type { AiSuggestionStatus } from "@memo-capture/domain";
import type { Queryable } from "../db/types.js";

export interface AiSuggestionRecord {
  id: string;
  parentWorkItemId: string;
  status: AiSuggestionStatus;
  title: string;
  body: string;
  tags: string[];
  rationale: string | null;
  promptVersionId: string | null;
  providerName: string | null;
  modelName: string | null;
  validationResult: Record<string, unknown> | null;
  appliedWorkItemId: string | null;
  createdAt: string;
  appliedAt: string | null;
  dismissedAt: string | null;
}

interface AiSuggestionRow extends Record<string, unknown> {
  id: string;
  parent_work_item_id: string;
  status: AiSuggestionStatus;
  title: string;
  body: string;
  tags: string[];
  rationale: string | null;
  prompt_version_id: string | null;
  provider_name: string | null;
  model_name: string | null;
  validation_result: Record<string, unknown> | null;
  applied_work_item_id: string | null;
  created_at: Date | string;
  applied_at: Date | string | null;
  dismissed_at: Date | string | null;
}

export class AiSuggestionRepository {
  constructor(private readonly db: Queryable) {}

  async listForWorkItem(parentWorkItemId: string): Promise<AiSuggestionRecord[]> {
    const result = await this.db.query<AiSuggestionRow>(
      `select *
       from ai_suggestions
       where parent_work_item_id = $1
         and status = 'pending'
       order by created_at desc`,
      [parentWorkItemId]
    );
    return result.rows.map(mapAiSuggestion);
  }

  async create(input: {
    parentWorkItemId: string;
    title: string;
    body: string;
    tags: string[];
    rationale: string | null;
    promptVersionId: string;
    providerName: string;
    modelName: string;
    validationResult: Record<string, unknown>;
    actorUserId: string;
  }): Promise<AiSuggestionRecord> {
    const result = await this.db.query<AiSuggestionRow>(
      `insert into ai_suggestions (
         id,
         parent_work_item_id,
         status,
         title,
         body,
         tags,
         rationale,
         prompt_version_id,
         provider_name,
         model_name,
         validation_result,
         created_by,
         created_at
       )
       values ($1, $2, 'pending', $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb, $11, now())
       returning *`,
      [
        randomUUID(),
        input.parentWorkItemId,
        input.title,
        input.body,
        JSON.stringify(input.tags),
        input.rationale,
        input.promptVersionId,
        input.providerName,
        input.modelName,
        JSON.stringify(input.validationResult),
        input.actorUserId
      ]
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("Failed to create AI suggestion.");
    }
    return mapAiSuggestion(row);
  }

  async findById(suggestionId: string): Promise<AiSuggestionRecord | null> {
    const result = await this.db.query<AiSuggestionRow>(
      `select *
       from ai_suggestions
       where id = $1`,
      [suggestionId]
    );
    return result.rows[0] === undefined ? null : mapAiSuggestion(result.rows[0]);
  }

  async markApplied(input: {
    suggestionId: string;
    appliedWorkItemId: string;
    actorUserId: string;
  }): Promise<AiSuggestionRecord | null> {
    const result = await this.db.query<AiSuggestionRow>(
      `update ai_suggestions
       set
         status = 'applied',
         applied_work_item_id = $2,
         applied_by = $3,
         applied_at = now()
       where id = $1 and status = 'pending'
       returning *`,
      [input.suggestionId, input.appliedWorkItemId, input.actorUserId]
    );
    return result.rows[0] === undefined ? null : mapAiSuggestion(result.rows[0]);
  }

  async markDismissed(input: {
    suggestionId: string;
    actorUserId: string;
  }): Promise<AiSuggestionRecord | null> {
    const result = await this.db.query<AiSuggestionRow>(
      `update ai_suggestions
       set
         status = 'dismissed',
         dismissed_by = $2,
         dismissed_at = now()
       where id = $1 and status = 'pending'
       returning *`,
      [input.suggestionId, input.actorUserId]
    );
    return result.rows[0] === undefined ? null : mapAiSuggestion(result.rows[0]);
  }
}

function mapAiSuggestion(row: AiSuggestionRow): AiSuggestionRecord {
  return {
    id: row.id,
    parentWorkItemId: row.parent_work_item_id,
    status: row.status,
    title: row.title,
    body: row.body,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    rationale: row.rationale,
    promptVersionId: row.prompt_version_id,
    providerName: row.provider_name,
    modelName: row.model_name,
    validationResult: row.validation_result,
    appliedWorkItemId: row.applied_work_item_id,
    createdAt: toIso(row.created_at),
    appliedAt: row.applied_at === null ? null : toIso(row.applied_at),
    dismissedAt: row.dismissed_at === null ? null : toIso(row.dismissed_at)
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
