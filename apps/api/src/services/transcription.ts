import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ApiConfig, WhisperCppConfig } from "../config.js";
import type { Database, Queryable } from "../db/types.js";
import { ArtifactRepository } from "../repositories/artifacts.js";
import { ProcessingJobRepository } from "../repositories/jobs.js";
import { SourceMemoArtifactRepository, SourceMemoRepository } from "../repositories/source-memos.js";
import { WorkItemRepository } from "../repositories/work-items.js";
import { AuditRepository } from "../repositories/audit.js";
import { INGESTION_REVIEW_WORK_ITEM_STATE } from "@memo-capture/domain";
import { ClassificationService } from "./classification.js";
import type { ObjectStorageService } from "./object-storage.js";

export interface TranscriptionProvider {
  readonly providerName: string;
  readonly modelName: string;
  transcribe(input: {
    audio: Buffer;
    mimeType: string;
    filename: string | null;
  }): Promise<{ text: string; latencyMs: number }>;
}

export class TranscriptionService {
  private readonly provider: TranscriptionProvider;

  constructor(
    private readonly db: Database,
    private readonly objectStorage: ObjectStorageService,
    config: ApiConfig
  ) {
    this.provider = createTranscriptionProvider(config);
  }

  async runTranscriptionJob(input: {
    jobId: string;
    sourceMemoId: string;
    workItemId: string | null;
  }): Promise<void> {
    await this.db.transaction(async (client) => {
      const sourceMemo = await new SourceMemoRepository(client).findById(input.sourceMemoId);
      if (sourceMemo === null) {
        throw new TranscriptionJobError(
          "source_memo_not_found",
          "The source memo for this transcription job no longer exists.",
          false
        );
      }
      if (sourceMemo.sourceType !== "watched_audio_file") {
        throw new TranscriptionJobError(
          "source_memo_not_audio",
          "The transcription job is not linked to an audio source memo.",
          false
        );
      }

      const originalArtifact = await new ArtifactRepository(client).findPrimaryForSourceMemo(input.sourceMemoId);
      if (originalArtifact === null || originalArtifact.artifactKind !== "original_audio_file") {
        throw new TranscriptionJobError(
          "audio_artifact_missing",
          "The source audio artifact is missing.",
          false
        );
      }

      const audio = await this.objectStorage.getObject(originalArtifact.objectKey);
      const result = await this.provider.transcribe({
        audio,
        mimeType: originalArtifact.mimeType,
        filename: originalArtifact.originalFilename
      });
      const transcriptText = normalizeTranscript(result.text);
      const transcriptArtifact = await storeTranscriptArtifact({
        client,
        objectStorage: this.objectStorage,
        sourceMemoId: input.sourceMemoId,
        transcriptText,
        actorUserId: originalArtifact.createdBy
      });

      await new SourceMemoRepository(client).updateTranscript({
        sourceMemoId: input.sourceMemoId,
        transcriptText
      });
      await new SourceMemoArtifactRepository(client).link({
        sourceMemoId: input.sourceMemoId,
        artifactId: transcriptArtifact.id,
        relationship: "derived_transcript"
      });
      const workItem = await ensureAudioWorkItem({
        client,
        sourceMemo,
        sourceMemoId: input.sourceMemoId,
        transcriptText,
        actorUserId: originalArtifact.createdBy,
        originalFilename: originalArtifact.originalFilename,
        requestId: input.jobId,
        updateExistingWorkItemId: input.workItemId
      });
      await new ClassificationService(client).runInitialStateHooksForWorkItem({
        workItem,
        actor: null,
        requestId: input.jobId
      });

      await client.query(
        `update processing_jobs
         set provider_name = $2::text, model_name = $3::text, latency_ms = $4::integer
         where id = $1`,
        [input.jobId, this.provider.providerName, this.provider.modelName, result.latencyMs]
      );
    });
  }

  async ensureRecoverableAudioWorkItem(input: {
    sourceMemoId: string;
    actorUserId: string | null;
    requestId: string | null;
  }): Promise<void> {
    await this.db.transaction(async (client) => {
      const sourceMemo = await new SourceMemoRepository(client).findById(input.sourceMemoId);
      if (sourceMemo === null || sourceMemo.sourceType !== "watched_audio_file") {
        return;
      }

      const originalArtifact = await new ArtifactRepository(client).findPrimaryForSourceMemo(input.sourceMemoId);
      const workItem = await ensureAudioWorkItem({
        client,
        sourceMemo,
        sourceMemoId: input.sourceMemoId,
        transcriptText: "",
        actorUserId: input.actorUserId,
        originalFilename: originalArtifact?.originalFilename ?? null,
        requestId: input.requestId,
        updateExistingWorkItemId: null
      });
      await new ClassificationService(client).runInitialStateHooksForWorkItem({
        workItem,
        actor: null,
        requestId: input.requestId
      });
    });
  }
}

export class TranscriptionJobError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
  }
}

async function storeTranscriptArtifact(input: {
  client: Queryable;
  objectStorage: ObjectStorageService;
  sourceMemoId: string;
  transcriptText: string;
  actorUserId: string | null;
}): Promise<{ id: string }> {
  const artifactId = randomUUID();
  const objectKey = `artifacts/v1/source-memos/${input.sourceMemoId}/derived/transcript/${artifactId}.txt`;
  const stored = await input.objectStorage.putObject({ objectKey, body: input.transcriptText });
  return new ArtifactRepository(input.client).create({
    id: artifactId,
    artifactKind: "derived_transcript",
    objectKey,
    bucket: stored.bucket,
    originalFilename: "transcript.txt",
    mimeType: "text/plain; charset=utf-8",
    byteSize: stored.byteSize,
    contentHash: stored.contentHash,
    layoutVersion: "v1",
    createdBy: input.actorUserId
  });
}

async function ensureAudioWorkItem(input: {
  client: Queryable;
  sourceMemo: {
    contributorText?: string | null;
    contributorId?: string | null;
  };
  sourceMemoId: string;
  transcriptText: string;
  actorUserId: string | null;
  originalFilename: string | null;
  requestId: string | null;
  updateExistingWorkItemId: string | null;
}) {
  const workItems = new WorkItemRepository(input.client);
  const existing =
    input.updateExistingWorkItemId === null
      ? await workItems.findFirstBySourceMemoId(input.sourceMemoId)
      : await workItems.findById(input.updateExistingWorkItemId);
  if (existing !== null) {
    if (input.transcriptText.trim() === "") {
      return existing;
    }
    return (
      (await workItems.applyTranscriptIfBodyEmpty({
        workItemId: existing.id,
        transcriptText: input.transcriptText,
        actorUserId: input.actorUserId
      })) ?? existing
    );
  }

  const workItem = await workItems.create({
    sourceMemoId: input.sourceMemoId,
    projectId: null,
    contributorText: input.sourceMemo.contributorText ?? null,
    contributorId: input.sourceMemo.contributorId ?? null,
    title: deriveAudioTitle(input.originalFilename),
    body: input.transcriptText,
    bodyFormat: "markdown",
    workflowState: INGESTION_REVIEW_WORK_ITEM_STATE,
    actorUserId: input.actorUserId
  });
  await new AuditRepository(input.client).record({
    eventName: "work_item.created",
    actor: null,
    subjectType: "work_item",
    subjectId: workItem.id,
    requestId: input.requestId,
    sourceMemoId: input.sourceMemoId,
    workItemId: workItem.id,
    metadata: {
      workflowState: workItem.workflowState,
      source: input.transcriptText.trim() === "" ? "transcription_recovery" : "transcription_success"
    },
    redactionApplied: true
  });
  return workItem;
}

function deriveAudioTitle(filename: string | null): string {
  const base = (filename ?? "Audio memo")
    .replace(/\.[^.]+$/u, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base === "" ? "Audio memo" : base.slice(0, 120);
}

export function createTranscriptionProvider(config: ApiConfig): TranscriptionProvider {
  if (config.transcription.provider === "local-dev") {
    return new LocalDevTranscriptionProvider(config.transcription.modelName);
  }
  if (config.transcription.provider === "whisper-cpp") {
    return new WhisperCppCliTranscriptionProvider(config.transcription.modelName, config.whisperCpp);
  }

  return new DisabledTranscriptionProvider(config.transcription.modelName);
}

function normalizeTranscript(value: string): string {
  const transcriptText = value.trim();
  if (transcriptText === "") {
    throw new TranscriptionJobError(
      "empty_transcript",
      "The transcription provider returned an empty transcript.",
      true
    );
  }
  return transcriptText;
}

class DisabledTranscriptionProvider implements TranscriptionProvider {
  readonly providerName = "disabled";

  constructor(readonly modelName: string) {}

  async transcribe(): Promise<{ text: string; latencyMs: number }> {
    throw new TranscriptionJobError(
      "transcription_provider_disabled",
      "No transcription provider is enabled. Play the audio and enter the transcript manually, or enable a provider and retry the job.",
      false
    );
  }
}

class LocalDevTranscriptionProvider implements TranscriptionProvider {
  readonly providerName = "local-dev";

  constructor(readonly modelName: string) {}

  async transcribe(input: {
    audio: Buffer;
    mimeType: string;
    filename: string | null;
  }): Promise<{ text: string; latencyMs: number }> {
    const startedAt = Date.now();
    const filename = input.filename ?? "audio memo";
    const digest = createHash("sha256").update(input.audio).digest("hex").slice(0, 12);
    return {
      text: `Local development transcript for ${filename} (${input.mimeType}, sha256:${digest}).`,
      latencyMs: Math.max(1, Date.now() - startedAt)
    };
  }
}

class WhisperCppCliTranscriptionProvider implements TranscriptionProvider {
  readonly providerName = "whisper-cpp";

  constructor(
    readonly modelName: string,
    private readonly config: WhisperCppConfig
  ) {}

  async transcribe(input: {
    audio: Buffer;
    mimeType: string;
    filename: string | null;
  }): Promise<{ text: string; latencyMs: number }> {
    if (this.config.mode !== "cli") {
      throw new TranscriptionJobError(
        "whisper_cpp_mode_not_supported",
        "Whisper.cpp server mode is configured, but only CLI mode is implemented.",
        false
      );
    }
    if (this.config.modelPath.trim() === "") {
      throw new TranscriptionJobError(
        "whisper_cpp_model_not_configured",
        "Whisper.cpp model path is not configured.",
        false
      );
    }
    try {
      await access(this.config.modelPath);
    } catch (error) {
      throw new TranscriptionJobError(
        "whisper_cpp_model_not_found",
        `Whisper.cpp model path is not accessible. ${error instanceof Error ? error.message : ""}`.trim(),
        false
      );
    }

    const startedAt = Date.now();
    const workDir = await mkdtemp(path.join(tmpdir(), "memo-capture-whisper-"));
    const inputPath = path.join(workDir, `source${extensionForAudio(input.filename, input.mimeType)}`);
    const wavPath = path.join(workDir, "audio.wav");
    const outputBase = path.join(workDir, "transcript");

    try {
      await writeFile(inputPath, input.audio);
      await runProcess({
        command: this.config.ffmpegPath,
        args: [
          "-y",
          "-i",
          inputPath,
          "-ar",
          "16000",
          "-ac",
          "1",
          "-c:a",
          "pcm_s16le",
          wavPath
        ],
        timeoutMs: this.config.timeoutMs,
        timeoutCode: "whisper_cpp_ffmpeg_timeout",
        failureCode: "whisper_cpp_ffmpeg_failed",
        failureMessage: "Unable to prepare audio for Whisper.cpp."
      });
      await runProcess({
        command: this.config.binaryPath,
        args: whisperArgs({
          modelPath: this.config.modelPath,
          wavPath,
          outputBase,
          language: this.config.language,
          threads: this.config.threads
        }),
        timeoutMs: this.config.timeoutMs,
        timeoutCode: "whisper_cpp_timeout",
        failureCode: "whisper_cpp_failed",
        failureMessage: "Whisper.cpp transcription failed."
      });

      return {
        text: await readWhisperTranscript(outputBase),
        latencyMs: Math.max(1, Date.now() - startedAt)
      };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}

function whisperArgs(input: {
  modelPath: string;
  wavPath: string;
  outputBase: string;
  language: string;
  threads: number;
}): string[] {
  const args = [
    "-m",
    input.modelPath,
    "-f",
    input.wavPath,
    "-of",
    input.outputBase,
    "-otxt",
    "-oj",
    "-nt"
  ];
  if (input.language.trim() !== "") {
    args.push("-l", input.language.trim());
  }
  if (Number.isInteger(input.threads) && input.threads > 0) {
    args.push("-t", String(input.threads));
  }
  return args;
}

async function readWhisperTranscript(outputBase: string): Promise<string> {
  const jsonText = await readOptionalText(`${outputBase}.json`);
  const jsonTranscript = jsonText === null ? null : parseWhisperJsonTranscript(jsonText);
  if (jsonTranscript !== null) {
    return normalizeTranscript(jsonTranscript);
  }
  const textTranscript = await readOptionalText(`${outputBase}.txt`);
  if (textTranscript !== null) {
    return normalizeTranscript(textTranscript);
  }
  throw new TranscriptionJobError(
    "whisper_cpp_transcript_missing",
    "Whisper.cpp did not produce a transcript output file.",
    true
  );
}

async function readOptionalText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function parseWhisperJsonTranscript(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== "object") {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record.text === "string") {
      return record.text;
    }
    if (Array.isArray(record.transcription)) {
      const text = record.transcription
        .map((segment) =>
          segment !== null && typeof segment === "object" && typeof (segment as Record<string, unknown>).text === "string"
            ? String((segment as Record<string, unknown>).text)
            : ""
        )
        .join(" ")
        .trim();
      return text === "" ? null : text;
    }
    return null;
  } catch {
    return null;
  }
}

function extensionForAudio(filename: string | null, mimeType: string): string {
  const extension = filename === null ? "" : path.extname(filename).toLowerCase();
  if (/^\.[a-z0-9]{1,12}$/.test(extension)) {
    return extension;
  }
  if (mimeType === "audio/mpeg") {
    return ".mp3";
  }
  if (mimeType === "audio/wav" || mimeType === "audio/wave" || mimeType === "audio/x-wav") {
    return ".wav";
  }
  return ".m4a";
}

function runProcess(input: {
  command: string;
  args: string[];
  timeoutMs: number;
  timeoutCode: string;
  failureCode: string;
  failureMessage: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderr: Buffer[] = [];
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, Math.max(1000, input.timeoutMs));

    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        new TranscriptionJobError(
          input.failureCode,
          `${input.failureMessage} ${error.message}`,
          false
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(
          new TranscriptionJobError(
            input.timeoutCode,
            `${input.failureMessage} The process timed out.`,
            true
          )
        );
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new TranscriptionJobError(
          input.failureCode,
          `${input.failureMessage} ${Buffer.concat(stderr).toString("utf8").trim()}`.trim(),
          input.failureCode.includes("ffmpeg") ? false : true
        )
      );
    });
  });
}
