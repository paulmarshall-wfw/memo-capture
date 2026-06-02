import { randomUUID } from "node:crypto";
import type { ProcessingJobKind } from "@memo-capture/domain";
import { readApiConfig } from "@memo-capture/api/src/config.js";
import { createPgDatabase } from "@memo-capture/api/src/db/postgres.js";
import { createLogger } from "@memo-capture/api/src/logger.js";
import { AuditRepository } from "@memo-capture/api/src/repositories/audit.js";
import {
  ProcessingJobRepository,
  WorkerHeartbeatRepository
} from "@memo-capture/api/src/repositories/jobs.js";
import { ExportService } from "@memo-capture/api/src/services/exports.js";
import { KeywordJobError, KeywordService } from "@memo-capture/api/src/services/keywords.js";
import { MetadataExtractionService } from "@memo-capture/api/src/services/metadata-extraction.js";
import { ObjectStorageService } from "@memo-capture/api/src/services/object-storage.js";
import {
  TranscriptionJobError,
  TranscriptionService
} from "@memo-capture/api/src/services/transcription.js";

const config = readApiConfig(process.env);
const logger = createLogger(config.logLevel);
const workerId = `memo-capture-worker-${randomUUID()}`;
const pollIntervalMs = 2_000;
const leaseSeconds = 300;
const heartbeatIntervalMs = 15_000;
const supportedJobKinds = [
  "transcribe_audio",
  "extract_memo_metadata",
  "generate_keywords",
  "nominate_tags",
  "generate_export_batch"
] satisfies ProcessingJobKind[];
const db = createPgDatabase(config.databaseUrl, logger);
const exportsService = new ExportService(db, config);
const keywordService = new KeywordService(db);
const metadataExtractionService = new MetadataExtractionService(db);
const transcriptionService = new TranscriptionService(db, new ObjectStorageService(config.objectStorage), config);
let stopping = false;
let lastHeartbeatAt = 0;

class JobCancelledError extends Error {
  constructor() {
    super("Job cancellation was requested.");
  }
}

class NonRetryableJobError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

logger.info("worker_started", {
  version: config.appVersion,
  commitSha: config.commitSha,
  workerId,
  supportedJobKinds
});

process.once("SIGINT", () => {
  stopping = true;
});

process.once("SIGTERM", () => {
  stopping = true;
});

try {
  while (!stopping) {
    await recordHeartbeatIfDue();
    const claimed = await new ProcessingJobRepository(db).claimNext({
      workerId,
      jobKinds: supportedJobKinds,
      leaseSeconds
    });

    if (claimed === null) {
      await delay(pollIntervalMs);
      continue;
    }

    await runClaimedJob(claimed);
  }
} finally {
  await db.close();
  logger.info("worker_stopped", { workerId });
}

async function runClaimedJob(job: {
  id: string;
  jobKind: ProcessingJobKind;
  sourceMemoId: string | null;
  workItemId: string | null;
  exportBatchId: string | null;
}): Promise<void> {
  const jobs = new ProcessingJobRepository(db);
  await jobs.markRunning({ jobId: job.id, workerId, leaseSeconds });
  logger.info("job_started", { workerId, jobId: job.id, jobKind: job.jobKind });
  const leaseTimer = startLeaseRenewal(job.id);

  try {
    await assertNotCancelled(job.id);
    if (job.jobKind === "transcribe_audio" && job.sourceMemoId !== null) {
      await transcriptionService.runTranscriptionJob({
        jobId: job.id,
        sourceMemoId: job.sourceMemoId,
        workItemId: job.workItemId
      });
    } else if (job.jobKind === "generate_export_batch" && job.exportBatchId !== null) {
      await exportsService.generateBatch(job.exportBatchId, job.id);
    } else if (job.jobKind === "extract_memo_metadata" && job.workItemId !== null) {
      await metadataExtractionService.runExtractionJob({
        jobId: job.id,
        workItemId: job.workItemId,
        sourceMemoId: job.sourceMemoId
      });
    } else if (job.jobKind === "generate_keywords" && job.workItemId !== null) {
      await keywordService.runNominateTagsJob({
        jobId: job.id,
        workItemId: job.workItemId,
        sourceMemoId: job.sourceMemoId
      });
    } else if (job.jobKind === "nominate_tags" && job.workItemId !== null) {
      await keywordService.runNominateTagsJob({
        jobId: job.id,
        workItemId: job.workItemId,
        sourceMemoId: job.sourceMemoId
      });
    } else {
      throw new NonRetryableJobError("unsupported_job", `Unsupported or malformed job ${job.jobKind}.`);
    }
    await assertNotCancelled(job.id);
    await jobs.markSucceeded(job.id);
    logger.info("job_succeeded", { workerId, jobId: job.id, jobKind: job.jobKind });
  } catch (error) {
    if (error instanceof JobCancelledError) {
      await jobs.markCancelled(job.id);
      logger.info("job_cancelled", { workerId, jobId: job.id, jobKind: job.jobKind });
      return;
    }

    const message = error instanceof Error ? error.message : "Job failed.";
    const failure = classifyFailure(error);
    const failedJob = await jobs.markFailed({
      jobId: job.id,
      errorCode: failure.errorCode,
      userSafeErrorMessage: failure.userSafeErrorMessage,
      internalErrorDetail: message,
      retryable: failure.retryable,
      retryDelaySeconds: failure.retryDelaySeconds
    });
    if (
      job.jobKind === "transcribe_audio" &&
      job.sourceMemoId !== null &&
      (failedJob?.status === "failed" || failedJob?.status === "exhausted")
    ) {
      await transcriptionService.ensureRecoverableAudioWorkItem({
        sourceMemoId: job.sourceMemoId,
        actorUserId: failedJob.initiatedBy,
        requestId: job.id
      });
    }
    await new AuditRepository(db).record({
      eventName: failedJob?.status === "exhausted" ? "processing_job.exhausted" : "processing_job.failed",
      actor: null,
      subjectType: "processing_job",
      subjectId: job.id,
      requestId: null,
      jobId: job.id,
      sourceMemoId: failedJob?.sourceMemoId ?? null,
      workItemId: failedJob?.workItemId ?? null,
      metadata: {
        errorCode: failure.errorCode,
        retryable: failure.retryable,
        resultingStatus: failedJob?.status ?? null
      },
      redactionApplied: true
    });
    logger.error("job_failed", {
      workerId,
      jobId: job.id,
      jobKind: job.jobKind,
      errorCode: failure.errorCode,
      retryable: failure.retryable,
      resultingStatus: failedJob?.status ?? null,
      error: message
    });
  } finally {
    clearInterval(leaseTimer);
  }
}

async function recordHeartbeatIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastHeartbeatAt < heartbeatIntervalMs) {
    return;
  }

  await new WorkerHeartbeatRepository(db).record({
    workerId,
    service: "memo-capture-worker",
    supportedJobKinds,
    version: config.appVersion,
    commitSha: config.commitSha
  });
  lastHeartbeatAt = now;
}

function startLeaseRenewal(jobId: string): NodeJS.Timeout {
  return setInterval(() => {
    void new ProcessingJobRepository(db)
      .extendLease({ jobId, workerId, leaseSeconds })
      .catch((error: unknown) => {
        logger.warn("job_lease_renewal_failed", {
          workerId,
          jobId,
          error: error instanceof Error ? error.message : "unknown_error"
        });
      });
  }, Math.max(1_000, Math.floor((leaseSeconds * 1_000) / 3)));
}

async function assertNotCancelled(jobId: string): Promise<void> {
  if (await new ProcessingJobRepository(db).isCancelRequested(jobId)) {
    throw new JobCancelledError();
  }
}

function classifyFailure(error: unknown): {
  errorCode: string;
  userSafeErrorMessage: string;
  retryable: boolean;
  retryDelaySeconds: number;
} {
  if (error instanceof NonRetryableJobError) {
    return {
      errorCode: error.code,
      userSafeErrorMessage: "The job cannot run because its input or job type is not supported.",
      retryable: false,
      retryDelaySeconds: 0
    };
  }

  if (error instanceof TranscriptionJobError) {
    return {
      errorCode: error.code,
      userSafeErrorMessage: error.message,
      retryable: error.retryable,
      retryDelaySeconds: error.retryable ? 30 : 0
    };
  }

  if (error instanceof KeywordJobError) {
    return {
      errorCode: error.code,
      userSafeErrorMessage: error.message,
      retryable: error.retryable,
      retryDelaySeconds: error.retryable ? 30 : 0
    };
  }

  const message = error instanceof Error ? error.message : "Job failed.";
  const normalized = message.toLowerCase();
  const retryable =
    normalized.includes("timeout") ||
    normalized.includes("rate limit") ||
    normalized.includes("network") ||
    normalized.includes("temporar") ||
    normalized.includes("storage") ||
    normalized.includes("structured output") ||
    normalized.includes("export generation");

  return {
    errorCode: retryable ? "transient_job_failure" : "job_failed",
    userSafeErrorMessage: retryable
      ? "The job hit a temporary processing failure and will retry if attempts remain."
      : "The job failed. Review diagnostics before retrying.",
    retryable,
    retryDelaySeconds: 30
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
