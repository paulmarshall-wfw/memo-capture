import { createHash, randomUUID } from "node:crypto";
import type { ApiConfig } from "../config.js";
import type { Database, Queryable } from "../db/types.js";
import { ArtifactRepository } from "../repositories/artifacts.js";
import { ProcessingJobRepository } from "../repositories/jobs.js";
import { SourceMemoArtifactRepository, SourceMemoRepository } from "../repositories/source-memos.js";
import { WorkItemRepository } from "../repositories/work-items.js";
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
      if (input.workItemId !== null) {
        await new WorkItemRepository(client).applyTranscriptIfBodyEmpty({
          workItemId: input.workItemId,
          transcriptText,
          actorUserId: originalArtifact.createdBy
        });
        await new ProcessingJobRepository(client).create({
          jobKind: "extract_memo_metadata",
          sourceMemoId: input.sourceMemoId,
          workItemId: input.workItemId,
          maxAttempts: 3,
          initiatedBy: originalArtifact.createdBy
        });
      }

      await client.query(
        `update processing_jobs
         set provider_name = $2, model_name = $3, latency_ms = $4
         where id = $1`,
        [input.jobId, this.provider.providerName, this.provider.modelName, result.latencyMs]
      );
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

function createTranscriptionProvider(config: ApiConfig): TranscriptionProvider {
  if (config.transcription.provider === "local-dev") {
    return new LocalDevTranscriptionProvider(config.transcription.modelName);
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
