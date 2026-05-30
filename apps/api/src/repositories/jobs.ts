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
}

export interface ClaimedProcessingJob {
  id: string;
  jobKind: ProcessingJobKind;
  exportBatchId: string | null;
  attemptCount: number;
  maxAttempts: number;
}

interface ClaimedProcessingJobRow extends Record<string, unknown> {
  id: string;
  job_kind: ProcessingJobKind;
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
       values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
      [
        id,
        input.jobKind,
        input.status ?? "queued",
        input.sourceMemoId ?? null,
        input.workItemId ?? null,
        input.exportBatchId ?? null,
        input.maxAttempts ?? 1,
        input.initiatedBy ?? null
      ]
    );
    return { id };
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
       where id = $1`,
      [input.jobId, input.workerId, `${input.leaseSeconds} seconds`]
    );
  }

  async markSucceeded(jobId: string): Promise<void> {
    await this.db.query(
      `update processing_jobs
       set status = 'succeeded', completed_at = now(), claim_expires_at = null
       where id = $1`,
      [jobId]
    );
  }

  async markFailed(input: {
    jobId: string;
    errorCode: string;
    userSafeErrorMessage: string;
    internalErrorDetail: string;
  }): Promise<void> {
    await this.db.query(
      `update processing_jobs
       set
         status = case when attempt_count >= max_attempts then 'exhausted' else 'failed' end,
         completed_at = now(),
         claim_expires_at = null,
         error_code = $2,
         user_safe_error_message = $3,
         internal_error_detail = $4
       where id = $1`,
      [input.jobId, input.errorCode, input.userSafeErrorMessage, input.internalErrorDetail]
    );
  }
}
