import { createHash, randomUUID } from "node:crypto";
import type { Database } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import { ArtifactRepository } from "../repositories/artifacts.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { SourceMemoArtifactRepository, SourceMemoRepository } from "../repositories/source-memos.js";
import { TagRepository } from "../repositories/tags.js";
import { AcceptedSnapshotRepository, WorkItemRepository, type WorkItemRecord } from "../repositories/work-items.js";
import { WorkflowRepository } from "../repositories/workflows.js";
import { assertNonEmptyString, HttpError, optionalString } from "./errors.js";
import type { ObjectStorageService } from "./object-storage.js";
import { WorkflowRuntimeAdapter } from "./workflow-runtime.js";

export class WorkItemService {
  private readonly runtime = new WorkflowRuntimeAdapter();

  constructor(
    private readonly db: Database,
    private readonly objectStorage: ObjectStorageService
  ) {}

  async list(input: { bucketId?: string | null } = {}): Promise<WorkItemRecord[]> {
    const bucketId = input.bucketId?.trim() ?? "";
    if (bucketId === "") {
      return new WorkItemRepository(this.db).list();
    }

    const active = await new WorkflowRepository(this.db).getActive();
    if (active === null) {
      throw new HttpError(409, "active_workflow_missing", "No active workflow definition is installed.");
    }

    const bucket = this.runtime.getBuckets(active.bundle).find((candidate) => candidate.id === bucketId);
    if (bucket === undefined) {
      throw new HttpError(404, "not_found", "workflow bucket was not found.");
    }

    return new WorkItemRepository(this.db).list({ states: bucket.states });
  }

  async findById(workItemId: string): Promise<WorkItemRecord | null> {
    return new WorkItemRepository(this.db).findById(workItemId);
  }

  async update(
    workItemId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<WorkItemRecord> {
    const input = parseUpdateBody(body);

    return this.db.transaction(async (client) => {
      const workItems = new WorkItemRepository(client);
      const tags = new TagRepository(client);
      const snapshots = new AcceptedSnapshotRepository(client);
      const audit = new AuditRepository(client);
      const updated = await workItems.updateContent({
        workItemId,
        expectedVersion: input.expectedVersion,
        title: input.title,
        body: input.body,
        projectId: input.projectId,
        contributorId: input.contributorId,
        contributorText: input.contributorText,
        actorUserId: actor.id
      });

      if (updated === null) {
        const current = await workItems.findById(workItemId);
        if (current === null) {
          throw new HttpError(404, "not_found", "work_item was not found.");
        }

        throw new HttpError(409, "stale_work_item_version", "Work item version is stale.", {
          currentVersion: current.workflowItemVersion,
          workItem: current
        });
      }
      await tags.setForWorkItem({
        workItemId: updated.id,
        tags: input.tags,
        actorUserId: actor.id
      });
      const tagged = (await workItems.findById(updated.id)) ?? { ...updated, tags: input.tags };

      const finalWorkItem = await createSnapshotForAcceptedEdit({
        updated: tagged,
        workItems,
        snapshots,
        actorUserId: actor.id
      });

      await audit.record({
        eventName: "work_item.updated",
        actor,
        subjectType: "work_item",
        subjectId: finalWorkItem.id,
        requestId,
        sourceMemoId: finalWorkItem.sourceMemoId,
        workItemId: finalWorkItem.id,
        metadata: {
          workflowState: finalWorkItem.workflowState,
          newVersion: finalWorkItem.workflowItemVersion,
          acceptedUnexportedChanges: finalWorkItem.acceptedUnexportedChanges,
          acceptedSnapshotId: finalWorkItem.acceptedSnapshotId
        }
      });

      return finalWorkItem;
    });
  }

  async recoverTranscript(
    workItemId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<WorkItemRecord> {
    const input = parseManualTranscriptBody(body);

    return this.db.transaction(async (client) => {
      const workItems = new WorkItemRepository(client);
      const sourceMemos = new SourceMemoRepository(client);
      const sourceMemoArtifacts = new SourceMemoArtifactRepository(client);
      const artifacts = new ArtifactRepository(client);
      const audit = new AuditRepository(client);
      const current = await workItems.findById(workItemId);
      if (current === null) {
        throw new HttpError(404, "not_found", "work_item was not found.");
      }

      const sourceMemo = await sourceMemos.findById(current.sourceMemoId);
      if (sourceMemo === null) {
        throw new HttpError(404, "not_found", "source_memo was not found.");
      }
      if (sourceMemo.sourceType !== "watched_audio_file") {
        throw new HttpError(409, "manual_transcript_not_allowed", "Manual transcript recovery is only available for audio source memos.");
      }
      if (current.workflowItemVersion !== input.expectedVersion) {
        throw new HttpError(409, "stale_work_item_version", "Work item version is stale.", {
          currentVersion: current.workflowItemVersion,
          workItem: current
        });
      }

      const transcriptArtifactId = randomUUID();
      const objectKey = `artifacts/v1/source-memos/${current.sourceMemoId}/derived/transcript/${transcriptArtifactId}.txt`;
      const stored = await this.objectStorage.putObject({ objectKey, body: input.transcriptText });
      await artifacts.create({
        id: transcriptArtifactId,
        artifactKind: "derived_transcript",
        objectKey,
        bucket: stored.bucket,
        originalFilename: "manual-transcript.txt",
        mimeType: "text/plain; charset=utf-8",
        byteSize: stored.byteSize,
        contentHash: stored.contentHash,
        layoutVersion: "v1",
        createdBy: actor.id
      });
      await sourceMemoArtifacts.link({
        sourceMemoId: current.sourceMemoId,
        artifactId: transcriptArtifactId,
        relationship: "derived_transcript"
      });
      await sourceMemos.updateTranscript({
        sourceMemoId: current.sourceMemoId,
        transcriptText: input.transcriptText
      });

      const updated = await workItems.updateContent({
        workItemId,
        expectedVersion: input.expectedVersion,
        title: input.title ?? current.title,
        body: input.transcriptText,
        projectId: current.projectId,
        contributorId: current.contributorId,
        contributorText: current.contributorText,
        actorUserId: actor.id
      });

      if (updated === null) {
        const latest = await workItems.findById(workItemId);
        throw new HttpError(409, "stale_work_item_version", "Work item version is stale.", {
          currentVersion: latest?.workflowItemVersion ?? current.workflowItemVersion,
          workItem: latest ?? current
        });
      }

      await audit.record({
        eventName: "work_item.updated",
        actor,
        subjectType: "work_item",
        subjectId: updated.id,
        requestId,
        sourceMemoId: updated.sourceMemoId,
        workItemId: updated.id,
        metadata: {
          recovery: "manual_transcript",
          transcriptArtifactId,
          transcriptContentHash: createHash("sha256").update(input.transcriptText).digest("hex")
        },
        redactionApplied: true
      });
      return updated;
    });
  }
}

async function createSnapshotForAcceptedEdit(input: {
  updated: WorkItemRecord;
  workItems: WorkItemRepository;
  snapshots: AcceptedSnapshotRepository;
  actorUserId: string;
}): Promise<WorkItemRecord> {
  if (input.updated.workflowState !== "accepted") {
    return input.updated;
  }

  const snapshot = await input.snapshots.createFromWorkItem({
    workItemId: input.updated.id,
    actorUserId: input.actorUserId
  });
  if (snapshot === null) {
    throw new HttpError(
      422,
      "accepted_snapshot_requires_project",
      "Accepted work item edits require a project-backed work item."
    );
  }

  return input.workItems.setAcceptedSnapshot({
    workItemId: input.updated.id,
    acceptedSnapshotId: snapshot.id,
    actorUserId: input.actorUserId
  });
}

function parseUpdateBody(body: unknown): {
  expectedVersion: number;
  title: string;
  body: string;
  projectId: string | null;
  contributorId: string | null;
  contributorText: string | null;
  tags: string[];
} {
  const record = parseObject(body);
  const expectedVersion = record.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new HttpError(400, "invalid_request", "expectedVersion must be a positive integer.");
  }

  return {
    expectedVersion,
    title: assertNonEmptyString(record.title, "title"),
    body: assertNonEmptyString(record.body, "body"),
    projectId: optionalString(record.projectId, "projectId"),
    contributorId: optionalString(record.contributorId, "contributorId"),
    contributorText: optionalString(record.contributorText, "contributorText"),
    tags: parseTags(record.tags)
  };
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

function parseManualTranscriptBody(body: unknown): {
  expectedVersion: number;
  title: string | null;
  transcriptText: string;
} {
  const record = parseObject(body);
  const expectedVersion = record.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new HttpError(400, "invalid_request", "expectedVersion must be a positive integer.");
  }

  return {
    expectedVersion,
    title: optionalString(record.title, "title"),
    transcriptText: assertNonEmptyString(record.transcriptText, "transcriptText")
  };
}

function parseObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Request body must be an object.");
  }

  return body as Record<string, unknown>;
}
