import { randomUUID } from "node:crypto";
import type { Queryable } from "../db/types.js";
import type { AppUserRecord } from "./rows.js";

export interface AuditEventInput {
  eventName: string;
  actor: AppUserRecord | null;
  subjectType: string;
  subjectId: string | null;
  requestId: string | null;
  sourceMemoId?: string | null;
  workItemId?: string | null;
  jobId?: string | null;
  metadata?: Record<string, unknown>;
  redactionApplied?: boolean;
}

export class AuditRepository {
  constructor(private readonly db: Queryable) {}

  async record(input: AuditEventInput): Promise<void> {
    await this.db.query(
      `insert into audit_events (
         id,
         event_name,
         actor_user_id,
         actor_email_snapshot,
         actor_display_name_snapshot,
         subject_type,
         subject_id,
         request_id,
         job_id,
         source_memo_id,
         work_item_id,
         metadata,
         redaction_applied,
         created_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, now())`,
      [
        randomUUID(),
        input.eventName,
        input.actor?.id ?? null,
        input.actor?.email ?? null,
        input.actor?.displayName ?? null,
        input.subjectType,
        input.subjectId,
        input.requestId,
        input.jobId ?? null,
        input.sourceMemoId ?? null,
        input.workItemId ?? null,
        JSON.stringify(input.metadata ?? {}),
        input.redactionApplied ?? false
      ]
    );
  }
}
