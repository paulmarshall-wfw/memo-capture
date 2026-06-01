import { MEMO_CAPTURE_EXPORT_SCHEMA_VERSION } from "@memo-capture/domain";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import type { ApiConfig } from "../config.js";
import type { Database } from "../db/types.js";
import { ProcessingJobRepository, type ProcessingJobRecord } from "../repositories/jobs.js";
import { WorkItemRepository } from "../repositories/work-items.js";
import { HttpError } from "./errors.js";
import { ObjectStorageService } from "./object-storage.js";

interface ImportEventDiagnosticRow extends Record<string, unknown> {
  id: string;
  source_memo_id: string | null;
  artifact_id: string | null;
  machine_id: string | null;
  watch_folder_id: string | null;
  original_path: string | null;
  archive_path: string | null;
  original_file_modified_at: Date | string | null;
  content_hash: string;
  duplicate_of_source_memo_id: string | null;
  status: string;
  warning_code: string | null;
  warning_message: string | null;
  created_at: Date | string;
}

interface SourceMemoDiagnosticRow extends Record<string, unknown> {
  id: string;
  source_type: string;
  primary_artifact_id: string | null;
  content_hash: string | null;
  original_path: string | null;
  archive_path: string | null;
  original_file_modified_at: Date | string | null;
  contributor_text: string | null;
  current_transcript_text: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ArtifactDiagnosticRow extends Record<string, unknown> {
  id: string;
  artifact_kind: string;
  object_key: string;
  bucket: string;
  mime_type: string;
  byte_size: number | string;
  content_hash: string;
  original_filename: string | null;
  relationship: string;
  created_at: Date | string;
}

interface DuplicateDiagnosticRow extends Record<string, unknown> {
  id: string;
  source_memo_id: string | null;
  work_item_id: string | null;
  possible_duplicate_source_memo_id: string | null;
  possible_duplicate_work_item_id: string | null;
  reason: string;
  score: string | number | null;
  status: string;
  created_at: Date | string;
  resolved_at: Date | string | null;
}

interface ProviderHealthRow extends Record<string, unknown> {
  id: string;
  provider_kind: string;
  provider_name: string;
  enabled: boolean;
  endpoint: string | null;
  model_name: string | null;
  secret_source: string;
  health_status: string;
  last_health_check_at: Date | string | null;
  updated_at: Date | string;
}

interface WorkerHeartbeatRow extends Record<string, unknown> {
  worker_id: string;
  service: string;
  supported_job_kinds: string[];
  version: string;
  commit_sha: string;
  started_at: Date | string;
  last_seen_at: Date | string;
}

export class DiagnosticsService {
  private readonly storage: ObjectStorageService;

  constructor(private readonly db: Database, private readonly config: ApiConfig) {
    this.storage = new ObjectStorageService(config.objectStorage);
  }

  async getWorkItemDiagnostics(workItemId: string): Promise<{
    workItemId: string;
    sourceMemo: Record<string, unknown> | null;
    importEvents: Record<string, unknown>[];
    artifacts: Record<string, unknown>[];
    jobs: ProcessingJobRecord[];
    possibleDuplicates: Record<string, unknown>[];
    archiveWarnings: Record<string, unknown>[];
  }> {
    const workItem = await new WorkItemRepository(this.db).findById(workItemId);
    if (workItem === null) {
      throw new HttpError(404, "not_found", "work_item was not found.");
    }

    const [sourceMemo, importEvents, artifacts, possibleDuplicates, jobs] = await Promise.all([
      this.findSourceMemo(workItem.sourceMemoId),
      this.listImportEvents(workItem.sourceMemoId),
      this.listArtifacts(workItem.sourceMemoId),
      this.listPossibleDuplicates(workItemId),
      new ProcessingJobRepository(this.db).listForWorkItemDiagnostics(workItemId)
    ]);

    return {
      workItemId,
      sourceMemo,
      importEvents,
      artifacts,
      jobs,
      possibleDuplicates,
      archiveWarnings: importEvents.filter(
        (event) => event.warningCode !== null || event.status === "archived_with_warning"
      )
    };
  }

  async listProviderHealth(): Promise<{ providers: Record<string, unknown>[] }> {
    const result = await this.db.query<ProviderHealthRow>(
      `select *
       from provider_configs
       order by provider_kind asc, provider_name asc`
    );
    const runtimeChecks = await Promise.all(result.rows.map((row) => this.checkRuntimeProvider(row)));
    return {
      providers: result.rows.map((row, index) => ({
        id: row.id,
        providerKind: row.provider_kind,
        providerName: row.provider_name,
        enabled: row.enabled,
        endpointConfigured: row.endpoint !== null && row.endpoint.trim() !== "",
        modelName: row.model_name,
        secretSource: row.secret_source,
        healthStatus: row.health_status,
        lastHealthCheckAt: row.last_health_check_at === null ? null : toIso(row.last_health_check_at),
        runtime: runtimeChecks[index] ?? null,
        updatedAt: toIso(row.updated_at)
      }))
    };
  }

  async getSystemDiagnostics(): Promise<Record<string, unknown>> {
    const [database, schema, worker, providers, storage, workflow] = await Promise.all([
      this.checkDatabase(),
      this.getSchemaVersion(),
      this.getLatestWorkerHeartbeat(),
      this.listProviderHealth(),
      this.storage.checkHealth(),
      this.getActiveWorkflow()
    ]);

    return {
      api: {
        service: "memo-capture-api",
        version: this.config.appVersion,
        commitSha: this.config.commitSha,
        timestamp: new Date().toISOString()
      },
      database,
      objectStorage: storage,
      auth: {
        mode: this.config.authMode,
        oidcConfigured:
          this.config.oidc.issuerUrl.trim() !== "" &&
          this.config.oidc.audience.trim() !== "" &&
          this.config.oidc.clientId.trim() !== "" &&
          this.config.oidc.jwksUrl.trim() !== ""
      },
      providers,
      worker,
      schema,
      workflow,
      exportSchemaVersion: MEMO_CAPTURE_EXPORT_SCHEMA_VERSION
    };
  }

  private async checkDatabase(): Promise<Record<string, unknown>> {
    const result = await this.db.query<{ ok: number; checked_at: Date | string }>(
      "select 1 as ok, now() as checked_at"
    );
    return {
      ok: result.rows[0]?.ok === 1,
      checkedAt: result.rows[0] === undefined ? null : toIso(result.rows[0].checked_at)
    };
  }

  private async getSchemaVersion(): Promise<Record<string, unknown>> {
    const result = await this.db.query<{ version: string; applied_at: Date | string }>(
      `select version, applied_at
       from schema_migrations
       order by version desc
       limit 1`
    );
    const row = result.rows[0];
    return row === undefined
      ? { currentVersion: null, appliedAt: null }
      : { currentVersion: row.version, appliedAt: toIso(row.applied_at) };
  }

  private async getLatestWorkerHeartbeat(): Promise<Record<string, unknown> | null> {
    const result = await this.db.query<WorkerHeartbeatRow>(
      `select *
       from worker_heartbeats
       order by last_seen_at desc
       limit 1`
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          workerId: row.worker_id,
          service: row.service,
          supportedJobKinds: row.supported_job_kinds,
          version: row.version,
          commitSha: row.commit_sha,
          startedAt: toIso(row.started_at),
          lastSeenAt: toIso(row.last_seen_at)
        };
  }

  private async getActiveWorkflow(): Promise<Record<string, unknown> | null> {
    const result = await this.db.query<{
      workflow_id: string;
      workflow_version: string;
      state_machine_version: string;
      content_hash: string;
      activated_at: Date | string;
    }>(
      `select workflow_id, workflow_version, state_machine_version, content_hash, activated_at
       from workflow_active_definition
       where singleton_id = true`
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          workflowId: row.workflow_id,
          workflowVersion: row.workflow_version,
          stateMachineVersion: row.state_machine_version,
          contentHash: row.content_hash,
          activatedAt: toIso(row.activated_at)
        };
  }

  private async checkRuntimeProvider(row: ProviderHealthRow): Promise<Record<string, unknown> | null> {
    if (row.provider_kind !== "transcription" || row.provider_name !== "whisper-cpp") {
      return null;
    }

    const [binary, ffmpeg, model] = await Promise.all([
      checkCommand(this.config.whisperCpp.binaryPath, ["-h"]),
      checkCommand(this.config.whisperCpp.ffmpegPath, ["-version"]),
      this.config.whisperCpp.modelPath.trim() === ""
        ? Promise.resolve({ ok: false, message: "WHISPER_CPP_MODEL_PATH is not configured." })
        : checkPath(this.config.whisperCpp.modelPath)
    ]);
    const ok =
      this.config.transcription.provider === "whisper-cpp" &&
      this.config.whisperCpp.mode === "cli" &&
      binary.ok &&
      ffmpeg.ok &&
      model.ok;

    return {
      ok,
      runtimeProvider: this.config.transcription.provider,
      mode: this.config.whisperCpp.mode,
      modelName: this.config.transcription.modelName,
      binaryPath: this.config.whisperCpp.binaryPath,
      modelPathConfigured: this.config.whisperCpp.modelPath.trim() !== "",
      ffmpegPath: this.config.whisperCpp.ffmpegPath,
      language: this.config.whisperCpp.language,
      threads: this.config.whisperCpp.threads,
      timeoutMs: this.config.whisperCpp.timeoutMs,
      checks: { binary, ffmpeg, model }
    };
  }

  private async findSourceMemo(sourceMemoId: string): Promise<Record<string, unknown> | null> {
    const result = await this.db.query<SourceMemoDiagnosticRow>(
      `select id, source_type, primary_artifact_id, content_hash, original_path, archive_path,
              contributor_text, current_transcript_text, created_at, updated_at
       from source_memos
       where id = $1`,
      [sourceMemoId]
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          sourceType: row.source_type,
          primaryArtifactId: row.primary_artifact_id,
          contentHash: row.content_hash,
          originalPath: row.original_path,
          archivePath: row.archive_path,
          originalFileModifiedAt:
            row.original_file_modified_at === null ? null : toIso(row.original_file_modified_at),
          contributorText: row.contributor_text,
          currentTranscriptText: row.current_transcript_text,
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at)
        };
  }

  private async listImportEvents(sourceMemoId: string): Promise<Record<string, unknown>[]> {
    const result = await this.db.query<ImportEventDiagnosticRow>(
      `select *
       from import_events
       where source_memo_id = $1
       order by created_at desc`,
      [sourceMemoId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      sourceMemoId: row.source_memo_id,
      artifactId: row.artifact_id,
      machineId: row.machine_id,
      watchFolderId: row.watch_folder_id,
      originalPath: row.original_path,
      archivePath: row.archive_path,
      originalFileModifiedAt: row.original_file_modified_at === null ? null : toIso(row.original_file_modified_at),
      contentHash: row.content_hash,
      duplicateOfSourceMemoId: row.duplicate_of_source_memo_id,
      status: row.status,
      warningCode: row.warning_code,
      warningMessage: row.warning_message,
      createdAt: toIso(row.created_at)
    }));
  }

  private async listArtifacts(sourceMemoId: string): Promise<Record<string, unknown>[]> {
    const result = await this.db.query<ArtifactDiagnosticRow>(
      `select
         artifacts.id,
         artifacts.artifact_kind,
         artifacts.object_key,
         artifacts.bucket,
         artifacts.mime_type,
         artifacts.byte_size,
         artifacts.content_hash,
         artifacts.original_filename,
         source_memo_artifacts.relationship,
         artifacts.created_at
       from source_memo_artifacts
       join artifacts on artifacts.id = source_memo_artifacts.artifact_id
       where source_memo_artifacts.source_memo_id = $1
       order by artifacts.created_at desc`,
      [sourceMemoId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      artifactKind: row.artifact_kind,
      objectKey: row.object_key,
      bucket: row.bucket,
      mimeType: row.mime_type,
      byteSize: typeof row.byte_size === "number" ? row.byte_size : Number.parseInt(row.byte_size, 10),
      contentHash: row.content_hash,
      originalFilename: row.original_filename,
      relationship: row.relationship,
      createdAt: toIso(row.created_at)
    }));
  }

  private async listPossibleDuplicates(workItemId: string): Promise<Record<string, unknown>[]> {
    const result = await this.db.query<DuplicateDiagnosticRow>(
      `select *
       from possible_duplicates
       where work_item_id = $1
          or possible_duplicate_work_item_id = $1
       order by created_at desc`,
      [workItemId]
    );
    return result.rows.map((row) => ({
      id: row.id,
      sourceMemoId: row.source_memo_id,
      workItemId: row.work_item_id,
      possibleDuplicateSourceMemoId: row.possible_duplicate_source_memo_id,
      possibleDuplicateWorkItemId: row.possible_duplicate_work_item_id,
      reason: row.reason,
      score: row.score === null ? null : Number(row.score),
      status: row.status,
      createdAt: toIso(row.created_at),
      resolvedAt: row.resolved_at === null ? null : toIso(row.resolved_at)
    }));
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

async function checkPath(filePath: string): Promise<{ ok: boolean; message: string }> {
  try {
    await access(filePath);
    return { ok: true, message: "Path is accessible." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Path is not accessible."
    };
  }
}

function checkCommand(command: string, args: string[]): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderr: Buffer[] = [];
    let settled = false;
    const finish = (result: { ok: boolean; message: string }) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, message: "Command timed out." });
    }, 3000);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      finish({ ok: false, message: error.message });
    });
    child.on("close", (code) => {
      finish({
        ok: code === 0,
        message: code === 0 ? "Command is available." : Buffer.concat(stderr).toString("utf8").trim()
      });
    });
  });
}
