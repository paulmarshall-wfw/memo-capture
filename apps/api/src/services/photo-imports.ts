import { createHash } from "node:crypto";
import { DEFAULT_MEMO_WORK_ITEM_STATE } from "@memo-capture/domain";
import type { Database, Queryable } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import {
  PhotoImportRepository,
  WorkItemArtifactRepository,
  type PhotoImportRecord
} from "../repositories/photo-imports.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { ImportEventRepository, SourceMemoRepository } from "../repositories/source-memos.js";
import { TagRepository } from "../repositories/tags.js";
import { WorkItemRepository, type WorkItemRecord } from "../repositories/work-items.js";
import { assertNonEmptyString, HttpError, optionalString } from "./errors.js";
import { WorkflowHookScheduler } from "./workflow-hooks.js";

interface CreateMemoFromPhotosInput {
  photoImportIds: string[];
  projectId: string;
  title: string | null;
  body: string;
  tags: string[];
}

export interface CreateMemoFromPhotosResult {
  workItem: WorkItemRecord;
  attachedPhotoImportIds: string[];
}

export class PhotoImportService {
  constructor(private readonly db: Database) {}

  async list(): Promise<{ photoImports: PhotoImportRecord[] }> {
    return { photoImports: await new PhotoImportRepository(this.db).listVisible() };
  }

  async countVisible(): Promise<number> {
    return new PhotoImportRepository(this.db).countVisible();
  }

  async createMemoFromPhotos(
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<CreateMemoFromPhotosResult> {
    const input = parseCreateMemoFromPhotosRequest(requestBody);
    return this.db.transaction(async (client) => {
      await assertActiveProject(client, input.projectId);
      const photoImports = await new PhotoImportRepository(client).lockAvailableForAttachment(input.photoImportIds);
      if (photoImports.length !== input.photoImportIds.length) {
        throw new HttpError(
          409,
          "photo_import_unavailable",
          "One or more selected photos are no longer available."
        );
      }

      return createMemoFromLockedPhotos({
        client,
        photoImports,
        input,
        actor,
        requestId
      });
    });
  }
}

async function createMemoFromLockedPhotos(input: {
  client: Queryable;
  photoImports: PhotoImportRecord[];
  input: CreateMemoFromPhotosInput;
  actor: AppUserRecord;
  requestId: string;
}): Promise<CreateMemoFromPhotosResult> {
  const sourceMemos = new SourceMemoRepository(input.client);
  const importEvents = new ImportEventRepository(input.client);
  const workItems = new WorkItemRepository(input.client);
  const workItemArtifacts = new WorkItemArtifactRepository(input.client);
  const photoImportRepository = new PhotoImportRepository(input.client);
  const tags = new TagRepository(input.client);
  const audit = new AuditRepository(input.client);
  const contributor = deriveContributor(input.photoImports);
  const title = input.input.title ?? deriveTitle(input.input.body, input.photoImports[0]?.originalFilename ?? "Photo memo");
  const contentHash = `sha256:${createHash("sha256").update(input.input.body).digest("hex")}`;

  const sourceMemo = await sourceMemos.create({
    sourceType: "form",
    originalText: input.input.body,
    extractedText: input.input.body,
    contentHash,
    contributorText: contributor.contributorText,
    contributorId: contributor.contributorId,
    createdBy: input.actor.id
  });
  const workItem = await workItems.create({
    sourceMemoId: sourceMemo.id,
    projectId: input.input.projectId,
    contributorText: contributor.contributorText,
    contributorId: contributor.contributorId,
    title,
    body: input.input.body,
    bodyFormat: "markdown",
    workflowState: DEFAULT_MEMO_WORK_ITEM_STATE,
    actorUserId: input.actor.id
  });
  const assignedTags = await tags.setForWorkItem({
    workItemId: workItem.id,
    projectId: workItem.projectId,
    tags: input.input.tags,
    actorUserId: input.actor.id
  });
  if (workItem.projectId !== null) {
    await workItems.markTagNominationReady({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      jobId: null
    });
  }
  for (const photoImport of input.photoImports) {
    await workItemArtifacts.link({
      workItemId: workItem.id,
      artifactId: photoImport.originalArtifactId,
      relationship: "photo_attachment"
    });
  }
  await photoImportRepository.markAttached({
    photoImportIds: input.photoImports.map((photoImport) => photoImport.id),
    workItemId: workItem.id
  });
  const taggedWorkItem = (await workItems.findById(workItem.id)) ?? { ...workItem, tags: assignedTags };
  await new WorkflowHookScheduler(input.client).scheduleStateResidentHooksForWorkItem({
    workItem: taggedWorkItem,
    actorUserId: input.actor.id
  });
  await importEvents.create({
    sourceMemoId: sourceMemo.id,
    contentHash,
    status: "imported"
  });
  await audit.record({
    eventName: "source_memo.created",
    actor: input.actor,
    subjectType: "source_memo",
    subjectId: sourceMemo.id,
    requestId: input.requestId,
    sourceMemoId: sourceMemo.id,
    metadata: {
      sourceType: "form",
      photoAttachmentCount: input.photoImports.length
    }
  });
  await audit.record({
    eventName: "work_item.created",
    actor: input.actor,
    subjectType: "work_item",
    subjectId: taggedWorkItem.id,
    requestId: input.requestId,
    sourceMemoId: sourceMemo.id,
    workItemId: taggedWorkItem.id,
    metadata: {
      workflowState: DEFAULT_MEMO_WORK_ITEM_STATE,
      photoImportIds: input.photoImports.map((photoImport) => photoImport.id),
      photoAttachmentCount: input.photoImports.length
    },
    redactionApplied: true
  });

  return {
    workItem: taggedWorkItem,
    attachedPhotoImportIds: input.photoImports.map((photoImport) => photoImport.id)
  };
}

function parseCreateMemoFromPhotosRequest(body: unknown): CreateMemoFromPhotosInput {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Photo memo request body must be an object.");
  }
  const record = body as Record<string, unknown>;
  const photoImportIds = parsePhotoImportIds(record.photoImportIds);
  return {
    photoImportIds,
    projectId: assertNonEmptyString(record.projectId, "projectId"),
    title: optionalString(record.title, "title")?.trim() || null,
    body: assertNonEmptyString(record.body, "body"),
    tags: parseTags(record.tags)
  };
}

function parsePhotoImportIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new HttpError(400, "invalid_request", "photoImportIds must be an array of photo import IDs.");
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of value) {
    const trimmed = id.trim();
    if (trimmed === "" || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    ids.push(trimmed);
  }
  if (ids.length === 0) {
    throw new HttpError(400, "invalid_request", "Select at least one photo.");
  }
  return ids;
}

function parseTags(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new HttpError(400, "invalid_request", "tags must be an array of strings.");
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

async function assertActiveProject(client: Queryable, projectId: string): Promise<void> {
  const result = await client.query<{ id: string }>(
    `select id
     from projects
     where id = $1
       and is_active = true
     limit 1`,
    [projectId]
  );
  if (result.rows[0] === undefined) {
    throw new HttpError(400, "invalid_project", "projectId must reference an active project.");
  }
}

function deriveContributor(photoImports: PhotoImportRecord[]): {
  contributorText: string | null;
  contributorId: string | null;
} {
  const [first] = photoImports;
  if (first === undefined) {
    return { contributorText: null, contributorId: null };
  }
  const sameContributor = photoImports.every(
    (photoImport) =>
      photoImport.contributorId === first.contributorId &&
      photoImport.contributorText === first.contributorText
  );
  return sameContributor
    ? { contributorText: first.contributorText, contributorId: first.contributorId }
    : { contributorText: null, contributorId: null };
}

function deriveTitle(body: string, filename: string): string {
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "");
  if (firstLine !== undefined) {
    return firstLine.slice(0, 120);
  }
  return filename.replace(/\.[^.]+$/, "").slice(0, 120);
}
