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

  async list(filters: {
    eventName?: string | null;
    actorUserId?: string | null;
    subjectType?: string | null;
    subjectId?: string | null;
    workItemId?: string | null;
    jobId?: string | null;
    createdFrom?: string | null;
    createdTo?: string | null;
    limit?: number;
  } = {}): Promise<AuditEventRecord[]> {
    const result = await this.db.query<AuditEventRow>(
      `select
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
       from audit_events
       where ($1::text is null or event_name = $1::text)
         and ($2::uuid is null or actor_user_id = $2::uuid)
         and ($3::text is null or subject_type = $3::text)
         and ($4::text is null or subject_id = $4::text)
         and ($5::uuid is null or work_item_id = $5::uuid)
         and ($6::uuid is null or job_id = $6::uuid)
         and ($7::timestamptz is null or created_at >= $7::timestamptz)
         and ($8::timestamptz is null or created_at <= $8::timestamptz)
       order by created_at desc
       limit $9`,
      [
        nullIfEmpty(filters.eventName),
        nullIfEmpty(filters.actorUserId),
        nullIfEmpty(filters.subjectType),
        nullIfEmpty(filters.subjectId),
        nullIfEmpty(filters.workItemId),
        nullIfEmpty(filters.jobId),
        nullIfEmpty(filters.createdFrom),
        nullIfEmpty(filters.createdTo),
        filters.limit ?? 100
      ]
    );
    return result.rows.map(mapAuditEvent);
  }
}

interface AuditEventRow extends Record<string, unknown> {
  id: string;
  event_name: string;
  actor_user_id: string | null;
  actor_email_snapshot: string | null;
  actor_display_name_snapshot: string | null;
  subject_type: string;
  subject_id: string | null;
  request_id: string | null;
  job_id: string | null;
  source_memo_id: string | null;
  work_item_id: string | null;
  metadata: Record<string, unknown>;
  redaction_applied: boolean;
  created_at: Date | string;
}

export interface AuditEventRecord {
  id: string;
  eventName: string;
  actorUserId: string | null;
  actorEmailSnapshot: string | null;
  actorDisplayNameSnapshot: string | null;
  subjectType: string;
  subjectId: string | null;
  requestId: string | null;
  jobId: string | null;
  sourceMemoId: string | null;
  workItemId: string | null;
  metadata: Record<string, unknown>;
  redactionApplied: boolean;
  createdAt: string;
}

function mapAuditEvent(row: AuditEventRow): AuditEventRecord {
  return {
    id: row.id,
    eventName: row.event_name,
    actorUserId: row.actor_user_id,
    actorEmailSnapshot: row.actor_email_snapshot,
    actorDisplayNameSnapshot: row.actor_display_name_snapshot,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    requestId: row.request_id,
    jobId: row.job_id,
    sourceMemoId: row.source_memo_id,
    workItemId: row.work_item_id,
    metadata: row.metadata,
    redactionApplied: row.redaction_applied,
    createdAt: toIso(row.created_at)
  };
}

function nullIfEmpty(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
