import { createHash, randomUUID } from "node:crypto";
import { INGESTION_REVIEW_WORK_ITEM_STATE, type ArtifactKind, type SourceMemoType } from "@memo-capture/domain";
import type { Database, Queryable } from "../db/types.js";
import { ArtifactRepository } from "../repositories/artifacts.js";
import { AuditRepository } from "../repositories/audit.js";
import {
  ImportUploadSessionRepository,
  type ImportUploadSessionRecord
} from "../repositories/import-upload-sessions.js";
import { ProcessingJobRepository } from "../repositories/jobs.js";
import type { AppUserRecord } from "../repositories/rows.js";
import {
  ImportEventRepository,
  SourceMemoArtifactRepository,
  SourceMemoRepository
} from "../repositories/source-memos.js";
import {
  SettingsRepository,
  type FileTypeSettingRow,
  type MediaTypeSettingRow,
  type ParserTypeSettingRow
} from "../repositories/settings.js";
import { WorkItemRepository } from "../repositories/work-items.js";
import type { ObjectStorageService } from "./object-storage.js";
import { assertNonEmptyString, HttpError, optionalString } from "./errors.js";

interface CreateUploadSessionRequest {
  machineId: string;
  watchFolderId: string;
  sourceType: SourceMemoType;
  originalFilename: string;
  originalPath: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
}

interface FinalizeUploadSessionRequest {
  machineId: string;
  archivePlanned: boolean;
}

interface ArchiveResultRequest {
  machineId: string;
  archivePath: string | null;
  status: "archived" | "archive_failed";
  warning: string | null;
}

export interface UploadSessionResponse {
  sessionId: string;
  status: "upload_required" | "duplicate_exact";
  importEventId?: string;
  duplicateOfSourceMemoId?: string;
  upload?: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
  };
}

export interface FinalizeUploadSessionResponse {
  sourceMemoId: string;
  workItemId: string;
  artifactId: string;
  importEventId: string;
  initialWorkflowState: string;
  processingJobs: string[];
}

export class ImportService {
  constructor(
    private readonly db: Database,
    private readonly objectStorage: ObjectStorageService
  ) {}

  async createUploadSession(
    requestBody: unknown,
    actor: AppUserRecord,
    _requestId: string
  ): Promise<UploadSessionResponse> {
    const input = parseCreateUploadSessionRequest(requestBody);
    await assertSupportedWatchedImport(this.db, input);

    return this.db.transaction(async (client) => {
      const sourceMemos = new SourceMemoRepository(client);
      const importEvents = new ImportEventRepository(client);
      const sessions = new ImportUploadSessionRepository(client);
      const duplicate = await sourceMemos.findByContentHash(input.contentHash);
      const sessionId = randomUUID();

      if (duplicate !== null) {
        const importEvent = await importEvents.create({
          sourceMemoId: duplicate.id,
          machineId: input.machineId,
          watchFolderId: input.watchFolderId,
          originalPath: input.originalPath,
          contentHash: input.contentHash,
          duplicateOfSourceMemoId: duplicate.id,
          status: "duplicate_exact"
        });
        await sessions.create({
          id: sessionId,
          status: "duplicate_exact",
          machineId: input.machineId,
          watchFolderId: input.watchFolderId,
          sourceType: input.sourceType,
          originalFilename: input.originalFilename,
          originalPath: input.originalPath,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          contentHash: input.contentHash,
          objectKey: null,
          bucket: null,
          artifactId: null,
          reservedSourceMemoId: null,
          duplicateOfSourceMemoId: duplicate.id,
          createdBy: actor.id
        });
        return {
          sessionId,
          status: "duplicate_exact",
          duplicateOfSourceMemoId: duplicate.id,
          importEventId: importEvent.id
        };
      }

      const sourceMemoId = randomUUID();
      const artifactId = randomUUID();
      const objectKey = buildOriginalObjectKey(sourceMemoId, artifactId, input.originalFilename);
      await sessions.create({
        id: sessionId,
        status: "upload_required",
        machineId: input.machineId,
        watchFolderId: input.watchFolderId,
        sourceType: input.sourceType,
        originalFilename: input.originalFilename,
        originalPath: input.originalPath,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        contentHash: input.contentHash,
        objectKey,
        bucket: this.objectStorage.bucket,
        artifactId,
        reservedSourceMemoId: sourceMemoId,
        duplicateOfSourceMemoId: null,
        createdBy: actor.id
      });

      return {
        sessionId,
        status: "upload_required",
        upload: {
          method: "PUT",
          url: `/api/imports/upload-sessions/${sessionId}/artifact`,
          headers: {
            "content-type": "application/octet-stream"
          }
        }
      };
    });
  }

  async uploadSessionArtifact(sessionId: string, body: Buffer): Promise<{ sessionId: string; status: "uploaded" }> {
    const sessions = new ImportUploadSessionRepository(this.db);
    const session = await sessions.findById(sessionId);
    if (session === null) {
      throw new HttpError(404, "upload_session_not_found", "Upload session was not found.");
    }
    if (session.status !== "upload_required" || session.objectKey === null) {
      throw new HttpError(409, "upload_session_not_uploadable", "Upload session is not awaiting an artifact upload.");
    }
    if (body.byteLength !== session.byteSize) {
      throw new HttpError(400, "byte_size_mismatch", "Uploaded artifact byte size does not match the session.");
    }

    const contentHash = `sha256:${createHash("sha256").update(body).digest("hex")}`;
    if (contentHash !== session.contentHash) {
      throw new HttpError(400, "content_hash_mismatch", "Uploaded artifact content hash does not match the session.");
    }

    await this.objectStorage.putObject({ objectKey: session.objectKey, body });
    await sessions.markUploaded(sessionId);
    return { sessionId, status: "uploaded" };
  }

  async finalizeUploadSession(
    sessionId: string,
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<FinalizeUploadSessionResponse> {
    const input = parseFinalizeUploadSessionRequest(requestBody);
    return this.db.transaction(async (client) => {
      const sessions = new ImportUploadSessionRepository(client);
      const session = await sessions.findById(sessionId);
      if (session === null) {
        throw new HttpError(404, "upload_session_not_found", "Upload session was not found.");
      }
      if (session.machineId !== input.machineId) {
        throw new HttpError(409, "machine_id_mismatch", "Upload session belongs to a different machine.");
      }
      if (
        session.status !== "uploaded" ||
        session.objectKey === null ||
        session.bucket === null ||
        session.artifactId === null ||
        session.reservedSourceMemoId === null
      ) {
        throw new HttpError(409, "upload_session_not_finalizable", "Upload session is not ready to finalize.");
      }

      const support = await assertActiveWatchedFileType(client, {
        sourceType: session.sourceType,
        originalFilename: session.originalFilename
      });
      const finalize = hasImplementedParser(support)
        ? session.sourceType === "watched_audio_file"
          ? finalizeWatchedAudioImport
          : finalizeWatchedTextImport
        : finalizeUnsupportedWatchedImport;

      return finalize({
        client,
        objectStorage: this.objectStorage,
        session,
        fileType: support.fileType,
        actor,
        requestId,
        archivePlanned: input.archivePlanned
      });
    });
  }

  async reportArchiveResult(
    importEventId: string,
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ importEventId: string; status: string; archivePath: string | null }> {
    const input = parseArchiveResultRequest(requestBody);
    return this.db.transaction(async (client) => {
      const importEvents = new ImportEventRepository(client);
      const sourceMemos = new SourceMemoRepository(client);
      const audit = new AuditRepository(client);
      const importEvent = await importEvents.findById(importEventId);
      if (importEvent === null) {
        throw new HttpError(404, "import_event_not_found", "Import event was not found.");
      }
      if (importEvent.machineId !== null && importEvent.machineId !== input.machineId) {
        throw new HttpError(409, "machine_id_mismatch", "Import event belongs to a different machine.");
      }
      const nextStatus = input.status === "archived" ? null : "archived_with_warning";
      const updated = await importEvents.updateArchiveResult({
        importEventId,
        archivePath: input.archivePath,
        status: nextStatus,
        warningCode: input.status === "archived" ? null : "archive_move_failed",
        warningMessage: input.warning
      });
      if (updated === null) {
        throw new HttpError(404, "import_event_not_found", "Import event was not found.");
      }
      if (updated.sourceMemoId !== null && input.archivePath !== null) {
        await sourceMemos.updateArchivePath({
          sourceMemoId: updated.sourceMemoId,
          archivePath: input.archivePath
        });
      }
      await audit.record({
        eventName: "source_memo.archive_result_recorded",
        actor,
        subjectType: "import_event",
        subjectId: importEventId,
        requestId,
        sourceMemoId: updated.sourceMemoId,
        metadata: {
          archiveStatus: input.status,
          machineId: input.machineId,
          archivePath: input.archivePath,
          warning: input.warning
        }
      });

      return {
        importEventId,
        status: updated.status,
        archivePath: input.archivePath
      };
    });
  }
}

async function finalizeWatchedAudioImport(input: {
  client: Queryable;
  objectStorage: ObjectStorageService;
  session: ImportUploadSessionRecord;
  fileType?: FileTypeSettingRow;
  actor: AppUserRecord;
  requestId: string;
  archivePlanned: boolean;
}): Promise<FinalizeUploadSessionResponse> {
  const session = input.session;
  if (
    session === null ||
    session.objectKey === null ||
    session.bucket === null ||
    session.artifactId === null ||
    session.reservedSourceMemoId === null
  ) {
    throw new Error("Invalid upload session state.");
  }

  const artifacts = new ArtifactRepository(input.client);
  const sourceMemos = new SourceMemoRepository(input.client);
  const sourceMemoArtifacts = new SourceMemoArtifactRepository(input.client);
  const importEvents = new ImportEventRepository(input.client);
  const workItems = new WorkItemRepository(input.client);
  const jobs = new ProcessingJobRepository(input.client);
  const audit = new AuditRepository(input.client);
  const title = deriveTitle("", session.originalFilename);

  await artifacts.create({
    id: session.artifactId,
    artifactKind: "original_audio_file",
    objectKey: session.objectKey,
    bucket: session.bucket,
    originalFilename: session.originalFilename,
    mimeType: session.mimeType,
    byteSize: session.byteSize,
    contentHash: session.contentHash,
    layoutVersion: "v1",
    createdBy: input.actor.id
  });

  const sourceMemo = await sourceMemos.create({
    id: session.reservedSourceMemoId,
    sourceType: session.sourceType,
    primaryArtifactId: session.artifactId,
    contentHash: session.contentHash,
    originalPath: session.originalPath,
    createdBy: input.actor.id
  });
  await sourceMemoArtifacts.link({
    sourceMemoId: sourceMemo.id,
    artifactId: session.artifactId,
    relationship: "primary_original"
  });

  const workItem = await workItems.create({
    sourceMemoId: sourceMemo.id,
    projectId: null,
    contributorText: null,
    contributorId: null,
    title,
    body: "",
    bodyFormat: "markdown",
    workflowState: INGESTION_REVIEW_WORK_ITEM_STATE,
    actorUserId: input.actor.id
  });

  const importEvent = await importEvents.create({
    sourceMemoId: sourceMemo.id,
    artifactId: session.artifactId,
    machineId: session.machineId,
    watchFolderId: session.watchFolderId,
    originalPath: session.originalPath,
    contentHash: session.contentHash,
    status: "imported"
  });
  const transcriptionJob = await jobs.create({
    jobKind: "transcribe_audio",
    sourceMemoId: sourceMemo.id,
    workItemId: workItem.id,
    maxAttempts: await readTranscriptionMaxAttempts(input.client),
    initiatedBy: input.actor.id
  });
  await new ImportUploadSessionRepository(input.client).markFinalized(session.id);
  await audit.record({
    eventName: "source_memo.created",
    actor: input.actor,
    subjectType: "source_memo",
    subjectId: sourceMemo.id,
    requestId: input.requestId,
    sourceMemoId: sourceMemo.id,
    metadata: {
      sourceType: session.sourceType,
      archivePlanned: input.archivePlanned,
      importEventId: importEvent.id
    }
  });
  await audit.record({
    eventName: "work_item.created",
    actor: input.actor,
    subjectType: "work_item",
    subjectId: workItem.id,
    requestId: input.requestId,
    sourceMemoId: sourceMemo.id,
    workItemId: workItem.id,
    metadata: { workflowState: workItem.workflowState }
  });

  return {
    sourceMemoId: sourceMemo.id,
    workItemId: workItem.id,
    artifactId: session.artifactId,
    importEventId: importEvent.id,
    initialWorkflowState: workItem.workflowState,
    processingJobs: [transcriptionJob.id]
  };
}

async function finalizeWatchedTextImport(input: {
  client: Queryable;
  objectStorage: ObjectStorageService;
  session: ImportUploadSessionRecord;
  fileType?: FileTypeSettingRow;
  actor: AppUserRecord;
  requestId: string;
  archivePlanned: boolean;
}): Promise<FinalizeUploadSessionResponse> {
  const session = input.session;
  if (
    session === null ||
    session.objectKey === null ||
    session.bucket === null ||
    session.artifactId === null ||
    session.reservedSourceMemoId === null
  ) {
    throw new Error("Invalid upload session state.");
  }

  const artifacts = new ArtifactRepository(input.client);
  const sourceMemos = new SourceMemoRepository(input.client);
  const sourceMemoArtifacts = new SourceMemoArtifactRepository(input.client);
  const importEvents = new ImportEventRepository(input.client);
  const workItems = new WorkItemRepository(input.client);
  const jobs = new ProcessingJobRepository(input.client);
  const audit = new AuditRepository(input.client);

  const objectBody = await input.objectStorage.getObject(session.objectKey);
  const extractedText = decodeTextArtifact(objectBody);
  const title = deriveTitle(extractedText, session.originalFilename);

  await artifacts.create({
    id: session.artifactId,
    artifactKind: artifactKindForSourceType(session.sourceType),
    objectKey: session.objectKey,
    bucket: session.bucket,
    originalFilename: session.originalFilename,
    mimeType: session.mimeType,
    byteSize: session.byteSize,
    contentHash: session.contentHash,
    layoutVersion: "v1",
    createdBy: input.actor.id
  });

  const sourceMemo = await sourceMemos.create({
    id: session.reservedSourceMemoId,
    sourceType: session.sourceType,
    primaryArtifactId: session.artifactId,
    originalText: extractedText,
    extractedText,
    contentHash: session.contentHash,
    originalPath: session.originalPath,
    createdBy: input.actor.id
  });
  await sourceMemoArtifacts.link({
    sourceMemoId: sourceMemo.id,
    artifactId: session.artifactId,
    relationship: "primary_original"
  });

  const workItem = await workItems.create({
    sourceMemoId: sourceMemo.id,
    projectId: null,
    contributorText: null,
    contributorId: null,
    title,
    body: extractedText,
    bodyFormat: "markdown",
    workflowState: INGESTION_REVIEW_WORK_ITEM_STATE,
    actorUserId: input.actor.id
  });

  const importEvent = await importEvents.create({
    sourceMemoId: sourceMemo.id,
    artifactId: session.artifactId,
    machineId: session.machineId,
    watchFolderId: session.watchFolderId,
    originalPath: session.originalPath,
    contentHash: session.contentHash,
    status: "imported"
  });
  const extractionJob = await jobs.create({
    jobKind: "extract_memo_metadata",
    sourceMemoId: sourceMemo.id,
    workItemId: workItem.id,
    maxAttempts: 3,
    initiatedBy: input.actor.id
  });
  await new ImportUploadSessionRepository(input.client).markFinalized(session.id);
  await audit.record({
    eventName: "source_memo.created",
    actor: input.actor,
    subjectType: "source_memo",
    subjectId: sourceMemo.id,
    requestId: input.requestId,
    sourceMemoId: sourceMemo.id,
    metadata: {
      sourceType: session.sourceType,
      archivePlanned: input.archivePlanned,
      importEventId: importEvent.id
    }
  });
  await audit.record({
    eventName: "work_item.created",
    actor: input.actor,
    subjectType: "work_item",
    subjectId: workItem.id,
    requestId: input.requestId,
    sourceMemoId: sourceMemo.id,
    workItemId: workItem.id,
    metadata: { workflowState: workItem.workflowState }
  });

  return {
    sourceMemoId: sourceMemo.id,
    workItemId: workItem.id,
    artifactId: session.artifactId,
    importEventId: importEvent.id,
    initialWorkflowState: workItem.workflowState,
    processingJobs: [extractionJob.id]
  };
}

async function finalizeUnsupportedWatchedImport(input: {
  client: Queryable;
  objectStorage: ObjectStorageService;
  session: ImportUploadSessionRecord;
  fileType?: FileTypeSettingRow;
  actor: AppUserRecord;
  requestId: string;
  archivePlanned: boolean;
}): Promise<FinalizeUploadSessionResponse> {
  const session = input.session;
  if (
    session === null ||
    session.objectKey === null ||
    session.bucket === null ||
    session.artifactId === null ||
    session.reservedSourceMemoId === null
  ) {
    throw new Error("Invalid upload session state.");
  }
  const fileType = requireValue(input.fileType, "File type settings are required for unsupported imports.");

  const artifacts = new ArtifactRepository(input.client);
  const sourceMemos = new SourceMemoRepository(input.client);
  const sourceMemoArtifacts = new SourceMemoArtifactRepository(input.client);
  const importEvents = new ImportEventRepository(input.client);
  const workItems = new WorkItemRepository(input.client);
  const audit = new AuditRepository(input.client);
  const title = `Add file type support for ${fileType.extension}`;

  await artifacts.create({
    id: session.artifactId,
    artifactKind: artifactKindForSourceType(session.sourceType),
    objectKey: session.objectKey,
    bucket: session.bucket,
    originalFilename: session.originalFilename,
    mimeType: session.mimeType,
    byteSize: session.byteSize,
    contentHash: session.contentHash,
    layoutVersion: "v1",
    createdBy: input.actor.id
  });

  const sourceMemo = await sourceMemos.create({
    id: session.reservedSourceMemoId,
    sourceType: session.sourceType,
    primaryArtifactId: session.artifactId,
    contentHash: session.contentHash,
    originalPath: session.originalPath,
    createdBy: input.actor.id
  });
  await sourceMemoArtifacts.link({
    sourceMemoId: sourceMemo.id,
    artifactId: session.artifactId,
    relationship: "primary_original"
  });

  const workItem = await workItems.create({
    sourceMemoId: sourceMemo.id,
    projectId: null,
    contributorText: null,
    contributorId: null,
    title,
    body: buildUnsupportedFileTypeBody(session, fileType),
    bodyFormat: "markdown",
    workflowState: INGESTION_REVIEW_WORK_ITEM_STATE,
    actorUserId: input.actor.id
  });

  const importEvent = await importEvents.create({
    sourceMemoId: sourceMemo.id,
    artifactId: session.artifactId,
    machineId: session.machineId,
    watchFolderId: session.watchFolderId,
    originalPath: session.originalPath,
    contentHash: session.contentHash,
    status: "imported"
  });
  await new ImportUploadSessionRepository(input.client).markFinalized(session.id);
  await audit.record({
    eventName: "source_memo.created",
    actor: input.actor,
    subjectType: "source_memo",
    subjectId: sourceMemo.id,
    requestId: input.requestId,
    sourceMemoId: sourceMemo.id,
    metadata: {
      sourceType: session.sourceType,
      archivePlanned: input.archivePlanned,
      importEventId: importEvent.id,
      fileTypeSupport: "parser_not_available",
      extension: fileType.extension,
      mediaKind: fileType.media_kind,
      parserKey: fileType.parser_key
    }
  });
  await audit.record({
    eventName: "work_item.created",
    actor: input.actor,
    subjectType: "work_item",
    subjectId: workItem.id,
    requestId: input.requestId,
    sourceMemoId: sourceMemo.id,
    workItemId: workItem.id,
    metadata: {
      workflowState: workItem.workflowState,
      fileTypeSupport: "parser_not_available",
      extension: fileType.extension
    }
  });

  return {
    sourceMemoId: sourceMemo.id,
    workItemId: workItem.id,
    artifactId: session.artifactId,
    importEventId: importEvent.id,
    initialWorkflowState: workItem.workflowState,
    processingJobs: []
  };
}

function parseCreateUploadSessionRequest(body: unknown): CreateUploadSessionRequest {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Upload session request body must be an object.");
  }

  const record = body as Record<string, unknown>;
  const sourceType = assertNonEmptyString(record.sourceType, "sourceType") as SourceMemoType;
  if (sourceType !== "watched_text_file" && sourceType !== "watched_audio_file") {
    throw new HttpError(400, "invalid_request", "sourceType must be a watched file source type.");
  }

  return {
    machineId: assertNonEmptyString(record.machineId, "machineId"),
    watchFolderId: assertNonEmptyString(record.watchFolderId, "watchFolderId"),
    sourceType,
    originalFilename: assertNonEmptyString(record.originalFilename, "originalFilename"),
    originalPath: assertNonEmptyString(record.originalPath, "originalPath"),
    mimeType: assertNonEmptyString(record.mimeType, "mimeType"),
    byteSize: parseByteSize(record.byteSize),
    contentHash: assertContentHash(record.contentHash)
  };
}

function parseFinalizeUploadSessionRequest(body: unknown): FinalizeUploadSessionRequest {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Finalize request body must be an object.");
  }

  const record = body as Record<string, unknown>;
  return {
    machineId: assertNonEmptyString(record.machineId, "machineId"),
    archivePlanned: record.archivePlanned === true
  };
}

function parseArchiveResultRequest(body: unknown): ArchiveResultRequest {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Archive result request body must be an object.");
  }

  const record = body as Record<string, unknown>;
  const status = assertNonEmptyString(record.status, "status");
  if (status !== "archived" && status !== "archive_failed") {
    throw new HttpError(400, "invalid_request", "status must be archived or archive_failed.");
  }
  return {
    machineId: assertNonEmptyString(record.machineId, "machineId"),
    archivePath: optionalString(record.archivePath, "archivePath"),
    status,
    warning: optionalString(record.warning, "warning")
  };
}

function parseByteSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpError(400, "invalid_request", "byteSize must be a non-negative integer.");
  }
  return value;
}

function assertContentHash(value: unknown): string {
  const contentHash = assertNonEmptyString(value, "contentHash");
  if (!/^sha256:[a-f0-9]{64}$/.test(contentHash)) {
    throw new HttpError(400, "invalid_request", "contentHash must be a sha256 digest.");
  }
  return contentHash;
}

async function assertSupportedWatchedImport(db: Queryable, input: CreateUploadSessionRequest): Promise<void> {
  await assertActiveWatchedFileType(db, input);
}

interface ActiveWatchedFileType {
  fileType: FileTypeSettingRow;
  mediaType: MediaTypeSettingRow;
  parserType: ParserTypeSettingRow | null;
}

async function assertActiveWatchedFileType(
  db: Queryable,
  input: Pick<CreateUploadSessionRequest, "sourceType" | "originalFilename">
): Promise<ActiveWatchedFileType> {
  const extension = extensionFromFilename(input.originalFilename);
  const settings = new SettingsRepository(db);
  const fileType = extension === null ? null : await settings.findFileTypeByExtension(extension);
  const expectedMediaKind = input.sourceType === "watched_audio_file" ? "audio" : "text";
  if (
    fileType === null ||
    fileType.media_kind !== expectedMediaKind ||
    fileType.capability_state !== "active"
  ) {
    throw new HttpError(400, "unsupported_file_type", "Watched import does not support this file extension.");
  }
  const mediaType = await settings.findMediaTypeByKey(fileType.media_kind);
  if (mediaType === null || mediaType.capability_state !== "active") {
    throw new HttpError(400, "unsupported_file_type", "Watched import does not support this media type.");
  }
  const parserType =
    fileType.parser_key === null ? null : await settings.findParserTypeByKey(fileType.parser_key);
  if (parserType !== null && parserType.media_key !== fileType.media_kind) {
    throw new HttpError(400, "unsupported_file_type", "Watched import parser is not compatible with this media type.");
  }
  return { fileType, mediaType, parserType };
}

function hasImplementedParser(input: ActiveWatchedFileType): boolean {
  if (input.parserType === null || input.parserType.capability_state !== "active") {
    return false;
  }
  if (input.fileType.media_kind === "audio") {
    return input.parserType.parser_key === "audio-transcription";
  }
  return input.fileType.media_kind === "text" && ["markdown", "plain-text"].includes(input.parserType.parser_key);
}

function buildUnsupportedFileTypeBody(
  session: ImportUploadSessionRecord,
  fileType: FileTypeSettingRow
): string {
  return [
    `${session.originalFilename} was imported from a watched folder, but Memo Capture does not have processing support for ${fileType.extension} yet.`,
    "",
    "Add or select a parser before expecting automatic extraction for this file type.",
    "",
    `- Extension: ${fileType.extension}`,
    `- Media kind: ${fileType.media_kind}`,
    `- Parser key: ${fileType.parser_key ?? "none"}`,
    `- Original path: ${session.originalPath}`
  ].join("\n");
}

function requireValue<Value>(value: Value | null | undefined, message: string): Value {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

function extensionFromFilename(filename: string): string | null {
  const index = filename.lastIndexOf(".");
  if (index <= 0 || index === filename.length - 1) {
    return null;
  }
  return filename.slice(index).toLowerCase();
}

function buildOriginalObjectKey(sourceMemoId: string, artifactId: string, filename: string): string {
  return `artifacts/v1/source-memos/${sourceMemoId}/original/${artifactId}-${sanitizeFilename(filename)}`;
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return sanitized === "" ? "artifact.txt" : sanitized;
}

function artifactKindForSourceType(sourceType: SourceMemoType): ArtifactKind {
  return sourceType === "watched_audio_file" ? "original_audio_file" : "original_text_file";
}

function decodeTextArtifact(body: Buffer): string {
  const text = body.toString("utf8").replace(/^\uFEFF/, "");
  if (text.trim() === "") {
    throw new HttpError(400, "empty_text_artifact", "Text artifact must not be empty.");
  }
  return text;
}

function deriveTitle(text: string, filename: string): string {
  const firstContentLine = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line !== "");
  if (firstContentLine !== undefined) {
    return firstContentLine.slice(0, 120);
  }
  return filename.replace(/\.[^.]+$/, "").slice(0, 120);
}

async function readTranscriptionMaxAttempts(client: Queryable): Promise<number> {
  const result = await client.query<{ max_retry_attempts: number }>(
    `select max_retry_attempts
     from transcription_settings
     where singleton_id = true
     limit 1`
  );
  const value = result.rows[0]?.max_retry_attempts;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 3;
}
