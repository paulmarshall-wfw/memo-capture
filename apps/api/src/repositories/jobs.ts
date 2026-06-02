import { randomUUID } from "node:crypto";
import type { ProcessingJobKind, ProcessingJobStatus } from "@memo-capture/domain";
import type { Queryable } from "../db/types.js";

export interface ProcessingJobInput {
  jobKind: ProcessingJobKind;
  status?: ProcessingJobStatus;
  sourceMemoId?: string | null;
  workItemId?: string | null;
  exportBatchId?: string | null;
  maxAttempts?: number;
  initiatedBy?: string | null;
  runAfter?: Date | string | null;
}

export interface ProcessingJobFilters {
  status?: string | null;
  jobKind?: string | null;
  sourceMemoId?: string | null;
  workItemId?: string | null;
  exportBatchId?: string | null;
  providerName?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  limit?: number;
}

export interface ProcessingJobRecord {
  id: string;
  jobKind: ProcessingJobKind;
  status: ProcessingJobStatus;
  sourceMemoId: string | null;
  workItemId: string | null;
  exportBatchId: string | null;
  attemptCount: number;
  maxAttempts: number;
  runAfter: string;
  claimedBy: string | null;
  claimExpiresAt: string | null;
  cancelRequestedAt: string | null;
  cancelRequestedBy: string | null;
  errorCode: string | null;
  userSafeErrorMessage: string | null;
  internalErrorDetail: string | null;
  providerName: string | null;
  modelName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMinorUnits: number | null;
  estimatedCostCurrency: string | null;
  latencyMs: number | null;
  initiatedBy: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ClaimedProcessingJob {
  id: string;
  jobKind: ProcessingJobKind;
  sourceMemoId: string | null;
  workItemId: string | null;
  exportBatchId: string | null;
  attemptCount: number;
  maxAttempts: number;
}

interface ProcessingJobRow extends Record<string, unknown> {
  id: string;
  job_kind: ProcessingJobKind;
  status: ProcessingJobStatus;
  source_memo_id: string | null;
  work_item_id: string | null;
  export_batch_id: string | null;
  attempt_count: number;
  max_attempts: number;
  run_after: Date | string;
  claimed_by: string | null;
  claim_expires_at: Date | string | null;
  cancel_requested_at: Date | string | null;
  cancel_requested_by: string | null;
  error_code: string | null;
  user_safe_error_message: string | null;
  internal_error_detail: string | null;
  provider_name: string | null;
  model_name: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_minor_units: number | null;
  estimated_cost_currency: string | null;
  latency_ms: number | null;
  initiated_by: string | null;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
}

interface ClaimedProcessingJobRow extends Record<string, unknown> {
  id: string;
  job_kind: ProcessingJobKind;
  source_memo_id: string | null;
  work_item_id: string | null;
  export_batch_id: string | null;
  attempt_count: number;
  max_attempts: number;
}

export class ProcessingJobRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: ProcessingJobInput): Promise<{ id: string }> {
    const id = randomUUID();
    await this.db.query(
      `insert into processing_jobs (
         id,
         job_kind,
         status,
         source_memo_id,
         work_item_id,
         export_batch_id,
         max_attempts,
         initiated_by,
         created_at,
         run_after
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, now(), coalesce($9::timestamptz, now()))`,
      [
        id,
        input.jobKind,
        input.status ?? "queued",
        input.sourceMemoId ?? null,
        input.workItemId ?? null,
        input.exportBatchId ?? null,
        input.maxAttempts ?? 1,
        input.initiatedBy ?? null,
        input.runAfter ?? null
      ]
    );
    return { id };
  }

  async cancelPendingWorkItemJobs(input: {
    workItemId: string;
    jobKind: ProcessingJobKind;
  }): Promise<number> {
    const result = await this.db.query<{ cancelled_count: number | string }>(
      `with cancelled as (
         update processing_jobs
         set
           status = 'cancelled',
           completed_at = now(),
           claim_expires_at = null
         where work_item_id = $1
           and job_kind = $2
           and status in ('queued', 'retry_scheduled', 'claimed')
         returning id
       )
       select count(*) as cancelled_count
       from cancelled`,
      [input.workItemId, input.jobKind]
    );
    const count = result.rows[0]?.cancelled_count ?? 0;
    return typeof count === "number" ? count : Number.parseInt(count, 10);
  }

  async list(filters: ProcessingJobFilters = {}): Promise<ProcessingJobRecord[]> {
    const result = await this.db.query<ProcessingJobRow>(
      `select *
       from processing_jobs
       where ($1::text is null or status = $1::text)
         and ($2::text is null or job_kind = $2::text)
         and ($3::uuid is null or source_memo_id = $3::uuid)
         and ($4::uuid is null or work_item_id = $4::uuid)
         and ($5::uuid is null or export_batch_id = $5::uuid)
         and ($6::text is null or provider_name = $6::text)
         and ($7::timestamptz is null or created_at >= $7::timestamptz)
         and ($8::timestamptz is null or created_at <= $8::timestamptz)
       order by created_at desc
       limit $9`,
      [
        nullIfEmpty(filters.status),
        nullIfEmpty(filters.jobKind),
        nullIfEmpty(filters.sourceMemoId),
        nullIfEmpty(filters.workItemId),
        nullIfEmpty(filters.exportBatchId),
        nullIfEmpty(filters.providerName),
        nullIfEmpty(filters.createdFrom),
        nullIfEmpty(filters.createdTo),
        filters.limit ?? 100
      ]
    );
    return result.rows.map(mapProcessingJob);
  }

  async findById(jobId: string): Promise<ProcessingJobRecord | null> {
    const result = await this.db.query<ProcessingJobRow>(
      `select *
       from processing_jobs
       where id = $1`,
      [jobId]
    );
    return result.rows[0] === undefined ? null : mapProcessingJob(result.rows[0]);
  }

  async listForWorkItemDiagnostics(workItemId: string): Promise<ProcessingJobRecord[]> {
    const result = await this.db.query<ProcessingJobRow>(
      `select distinct processing_jobs.*
       from processing_jobs
       left join source_memos on source_memos.id = processing_jobs.source_memo_id
       left join work_items on work_items.source_memo_id = source_memos.id
       where processing_jobs.work_item_id = $1
          or work_items.id = $1
       order by processing_jobs.created_at desc`,
      [workItemId]
    );
    return result.rows.map(mapProcessingJob);
  }

  async claimNext(input: {
    workerId: string;
    jobKinds: ProcessingJobKind[];
    leaseSeconds: number;
  }): Promise<ClaimedProcessingJob | null> {
    const result = await this.db.query<ClaimedProcessingJobRow>(
      `with next_job as (
         select id
         from processing_jobs
         where job_kind = any($1::text[])
           and (
             (status in ('queued', 'retry_scheduled') and run_after <= now())
             or (status in ('claimed', 'running') and claim_expires_at < now())
           )
           and cancel_requested_at is null
         order by run_after asc, created_at asc
         for update skip locked
         limit 1
       )
       update processing_jobs
       set
         status = 'claimed',
         claimed_by = $2,
         claim_expires_at = now() + ($3::text)::interval
       from next_job
       where processing_jobs.id = next_job.id
       returning
         processing_jobs.id,
         processing_jobs.job_kind,
         processing_jobs.source_memo_id,
         processing_jobs.work_item_id,
         processing_jobs.export_batch_id,
         processing_jobs.attempt_count,
         processing_jobs.max_attempts`,
      [input.jobKinds, input.workerId, `${input.leaseSeconds} seconds`]
    );

    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          jobKind: row.job_kind,
          sourceMemoId: row.source_memo_id,
          workItemId: row.work_item_id,
          exportBatchId: row.export_batch_id,
          attemptCount: row.attempt_count,
          maxAttempts: row.max_attempts
        };
  }

  async markRunning(input: { jobId: string; workerId: string; leaseSeconds: number }): Promise<void> {
    await this.db.query(
      `update processing_jobs
       set
         status = 'running',
         claimed_by = $2,
         claim_expires_at = now() + ($3::text)::interval,
         attempt_count = attempt_count + 1,
         started_at = coalesce(started_at, now())
       where id = $1 and status = 'claimed'`,
      [input.jobId, input.workerId, `${input.leaseSeconds} seconds`]
    );
  }

  async extendLease(input: { jobId: string; workerId: string; leaseSeconds: number }): Promise<void> {
    await this.db.query(
      `update processing_jobs
       set claim_expires_at = now() + ($3::text)::interval
       where id = $1
         and claimed_by = $2
         and status in ('claimed', 'running')`,
      [input.jobId, input.workerId, `${input.leaseSeconds} seconds`]
    );
  }

  async isCancelRequested(jobId: string): Promise<boolean> {
    const result = await this.db.query<{ cancel_requested: boolean }>(
      `select cancel_requested_at is not null as cancel_requested
       from processing_jobs
       where id = $1`,
      [jobId]
    );
    return result.rows[0]?.cancel_requested ?? false;
  }

  async requestCancel(input: { jobId: string; actorUserId: string }): Promise<ProcessingJobRecord | null> {
    const result = await this.db.query<ProcessingJobRow>(
      `update processing_jobs
       set
         status = case
           when status in ('queued', 'retry_scheduled', 'claimed') then 'cancelled'
           else status
         end,
         cancel_requested_at = coalesce(cancel_requested_at, now()),
         cancel_requested_by = $2,
         completed_at = case
           when status in ('queued', 'retry_scheduled', 'claimed') then now()
           else completed_at
         end,
         claim_expires_at = case
           when status in ('queued', 'retry_scheduled', 'claimed') then null
           else claim_expires_at
         end
       where id = $1
         and status in ('queued', 'retry_scheduled', 'claimed', 'running')
       returning *`,
      [input.jobId, input.actorUserId]
    );
    return result.rows[0] === undefined ? null : mapProcessingJob(result.rows[0]);
  }

  async scheduleManualRetry(jobId: string): Promise<ProcessingJobRecord | null> {
    const result = await this.db.query<ProcessingJobRow>(
      `update processing_jobs
       set
         status = 'queued',
         run_after = now(),
         max_attempts = greatest(max_attempts, attempt_count + 1),
         claimed_by = null,
         claim_expires_at = null,
         cancel_requested_at = null,
         cancel_requested_by = null,
         completed_at = null
       where id = $1
         and status in ('failed', 'exhausted')
       returning *`,
      [jobId]
    );
    return result.rows[0] === undefined ? null : mapProcessingJob(result.rows[0]);
  }

  async markSucceeded(jobId: string): Promise<void> {
    await this.db.query(
      `update processing_jobs
       set
         status = 'succeeded',
         completed_at = now(),
         claim_expires_at = null,
         error_code = null,
         user_safe_error_message = null,
         internal_error_detail = null
       where id = $1`,
      [jobId]
    );
  }

  async markCancelled(jobId: string): Promise<void> {
    await this.db.query(
      `update processing_jobs
       set
         status = 'cancelled',
         completed_at = now(),
         claim_expires_at = null
       where id = $1
         and status <> 'succeeded'`,
      [jobId]
    );
  }

  async markFailed(input: {
    jobId: string;
    errorCode: string;
    userSafeErrorMessage: string;
    internalErrorDetail: string;
    retryable: boolean;
    retryDelaySeconds?: number;
    providerName?: string | null;
    modelName?: string | null;
    latencyMs?: number | null;
  }): Promise<ProcessingJobRecord | null> {
    const retryDelaySeconds = input.retryDelaySeconds ?? 30;
    const result = await this.db.query<ProcessingJobRow>(
      `update processing_jobs
       set
         status = case
           when $5::boolean and attempt_count < max_attempts then 'retry_scheduled'
           when attempt_count >= max_attempts then 'exhausted'
           else 'failed'
         end,
         run_after = case
           when $5::boolean and attempt_count < max_attempts then now() + ($6::text)::interval
           else run_after
         end,
         completed_at = case
           when $5::boolean and attempt_count < max_attempts then null
           else now()
         end,
         claim_expires_at = null,
         error_code = $2,
         user_safe_error_message = $3,
         internal_error_detail = $4,
         provider_name = coalesce($7::text, provider_name),
         model_name = coalesce($8::text, model_name),
         latency_ms = coalesce($9::integer, latency_ms)
       where id = $1
       returning *`,
      [
        input.jobId,
        input.errorCode,
        input.userSafeErrorMessage,
        input.internalErrorDetail,
        input.retryable,
        `${retryDelaySeconds} seconds`,
        input.providerName ?? null,
        input.modelName ?? null,
        input.latencyMs ?? null
      ]
    );
    return result.rows[0] === undefined ? null : mapProcessingJob(result.rows[0]);
  }
}

export class WorkerHeartbeatRepository {
  constructor(private readonly db: Queryable) {}

  async record(input: {
    workerId: string;
    service: string;
    supportedJobKinds: readonly ProcessingJobKind[];
    version: string;
    commitSha: string;
  }): Promise<void> {
    await this.db.query(
      `insert into worker_heartbeats (
         worker_id,
         service,
         supported_job_kinds,
         version,
         commit_sha,
         started_at,
         last_seen_at
       )
       values ($1, $2, $3::text[], $4, $5, now(), now())
       on conflict (worker_id) do update
       set
         service = excluded.service,
         supported_job_kinds = excluded.supported_job_kinds,
         version = excluded.version,
         commit_sha = excluded.commit_sha,
         last_seen_at = now()`,
      [input.workerId, input.service, [...input.supportedJobKinds], input.version, input.commitSha]
    );
  }
}

function mapProcessingJob(row: ProcessingJobRow): ProcessingJobRecord {
  return {
    id: row.id,
    jobKind: row.job_kind,
    status: row.status,
    sourceMemoId: row.source_memo_id,
    workItemId: row.work_item_id,
    exportBatchId: row.export_batch_id,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    runAfter: toIso(row.run_after),
    claimedBy: row.claimed_by,
    claimExpiresAt: row.claim_expires_at === null ? null : toIso(row.claim_expires_at),
    cancelRequestedAt: row.cancel_requested_at === null ? null : toIso(row.cancel_requested_at),
    cancelRequestedBy: row.cancel_requested_by,
    errorCode: row.error_code,
    userSafeErrorMessage: row.user_safe_error_message,
    internalErrorDetail: row.internal_error_detail,
    providerName: row.provider_name,
    modelName: row.model_name,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    estimatedCostMinorUnits: row.estimated_cost_minor_units,
    estimatedCostCurrency: row.estimated_cost_currency,
    latencyMs: row.latency_ms,
    initiatedBy: row.initiated_by,
    createdAt: toIso(row.created_at),
    startedAt: row.started_at === null ? null : toIso(row.started_at),
    completedAt: row.completed_at === null ? null : toIso(row.completed_at)
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
