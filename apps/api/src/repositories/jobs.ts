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
}
