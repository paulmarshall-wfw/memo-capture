import type { Database } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import { ProcessingJobRepository, type ProcessingJobRecord } from "../repositories/jobs.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { HttpError, optionalString } from "./errors.js";

export class JobService {
  constructor(private readonly db: Database) {}

  async list(query: URLSearchParams): Promise<{ jobs: ProcessingJobRecord[] }> {
    return {
      jobs: await new ProcessingJobRepository(this.db).list({
        status: query.get("status"),
        jobKind: query.get("job_kind"),
        sourceMemoId: query.get("source_memo_id"),
        workItemId: query.get("work_item_id"),
        exportBatchId: query.get("export_batch_id"),
        providerName: query.get("provider_name"),
        createdFrom: query.get("created_from"),
        createdTo: query.get("created_to")
      })
    };
  }

  async get(jobId: string): Promise<{ job: ProcessingJobRecord }> {
    const job = await new ProcessingJobRepository(this.db).findById(jobId);
    if (job === null) {
      throw new HttpError(404, "not_found", "processing_job was not found.");
    }
    return { job };
  }

  async retry(
    jobId: string,
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ job: ProcessingJobRecord }> {
    const input = parseReasonBody(requestBody);
    return this.db.transaction(async (client) => {
      const jobs = new ProcessingJobRepository(client);
      const job = await jobs.scheduleManualRetry(jobId);
      if (job === null) {
        const existing = await jobs.findById(jobId);
        if (existing === null) {
          throw new HttpError(404, "not_found", "processing_job was not found.");
        }
        throw new HttpError(409, "job_retry_not_allowed", "Only failed or exhausted jobs can be retried.");
      }

      await new AuditRepository(client).record({
        eventName: "processing_job.retry_requested",
        actor,
        subjectType: "processing_job",
        subjectId: job.id,
        requestId,
        jobId: job.id,
        sourceMemoId: job.sourceMemoId,
        workItemId: job.workItemId,
        metadata: { reason: input.reason }
      });
      return { job };
    });
  }

  async cancel(
    jobId: string,
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ job: ProcessingJobRecord }> {
    const input = parseReasonBody(requestBody);
    return this.db.transaction(async (client) => {
      const jobs = new ProcessingJobRepository(client);
      const job = await jobs.requestCancel({ jobId, actorUserId: actor.id });
      if (job === null) {
        const existing = await jobs.findById(jobId);
        if (existing === null) {
          throw new HttpError(404, "not_found", "processing_job was not found.");
        }
        throw new HttpError(409, "job_cancel_not_allowed", "Only queued, claimed, retry scheduled, or running jobs can be cancelled.");
      }

      await new AuditRepository(client).record({
        eventName: "processing_job.cancel_requested",
        actor,
        subjectType: "processing_job",
        subjectId: job.id,
        requestId,
        jobId: job.id,
        sourceMemoId: job.sourceMemoId,
        workItemId: job.workItemId,
        metadata: {
          reason: input.reason,
          resultingStatus: job.status
        }
      });
      return { job };
    });
  }
}

function parseReasonBody(body: unknown): { reason: string | null } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Request body must be an object.");
  }

  return {
    reason: optionalString((body as { reason?: unknown }).reason, "reason")
  };
}
