import { randomUUID } from "node:crypto";
import { PROCESSING_JOB_KINDS, type ProcessingJobKind } from "@memo-capture/domain";
import { readApiConfig } from "@memo-capture/api/src/config.js";
import { createPgDatabase } from "@memo-capture/api/src/db/postgres.js";
import { createLogger } from "@memo-capture/api/src/logger.js";
import { ProcessingJobRepository } from "@memo-capture/api/src/repositories/jobs.js";
import { ExportService } from "@memo-capture/api/src/services/exports.js";

const config = readApiConfig(process.env);
const logger = createLogger(config.logLevel);
const workerId = `memo-capture-worker-${randomUUID()}`;
const pollIntervalMs = 2_000;
const leaseSeconds = 300;
const supportedJobKinds = ["generate_export_batch"] satisfies ProcessingJobKind[];
const db = createPgDatabase(config.databaseUrl, logger);
const exportsService = new ExportService(db, config);
let stopping = false;

logger.info("worker_started", {
  version: config.appVersion,
  commitSha: config.commitSha,
  workerId,
  supportedJobKinds: PROCESSING_JOB_KINDS
});

process.once("SIGINT", () => {
  stopping = true;
});

process.once("SIGTERM", () => {
  stopping = true;
});

try {
  while (!stopping) {
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
  exportBatchId: string | null;
}): Promise<void> {
  const jobs = new ProcessingJobRepository(db);
  await jobs.markRunning({ jobId: job.id, workerId, leaseSeconds });
  logger.info("job_started", { workerId, jobId: job.id, jobKind: job.jobKind });

  try {
    if (job.jobKind !== "generate_export_batch" || job.exportBatchId === null) {
      throw new Error(`Unsupported or malformed job ${job.jobKind}.`);
    }

    await exportsService.generateBatch(job.exportBatchId, job.id);
    await jobs.markSucceeded(job.id);
    logger.info("job_succeeded", { workerId, jobId: job.id, jobKind: job.jobKind });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed.";
    await jobs.markFailed({
      jobId: job.id,
      errorCode: "job_failed",
      userSafeErrorMessage: message,
      internalErrorDetail: message
    });
    logger.error("job_failed", {
      workerId,
      jobId: job.id,
      jobKind: job.jobKind,
      error: message
    });
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
