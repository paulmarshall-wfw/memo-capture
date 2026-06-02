import { createHash, randomUUID } from "node:crypto";
import type { Database } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import { ArtifactRepository } from "../repositories/artifacts.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { SourceMemoArtifactRepository, SourceMemoRepository } from "../repositories/source-memos.js";
import {
  TagRepository,
  normalizeTagName,
  type TagSuggestionCandidate
} from "../repositories/tags.js";
import { extractKeywords } from "./keywords.js";
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

  async getTagSuggestions(workItemId: string): Promise<TagSuggestionResponse> {
    const workItem = await new WorkItemRepository(this.db).findById(workItemId);
    if (workItem === null) {
      throw new HttpError(404, "not_found", "work_item was not found.");
    }
    if (!workItem.tagsAvailable) {
      return emptyTagSuggestionResponse(workItem.id);
    }

    const sourceMemo = await new SourceMemoRepository(this.db).findById(workItem.sourceMemoId);
    const tags = new TagRepository(this.db);
    const candidates = await tags.listSuggestionCandidates({
      projectId: workItem.projectId,
      selectedTagNames: workItem.tags
    });
    const suppressedTags = await tags.listSuppressed();

    return buildTagSuggestionResponse({
      workItem,
      sourceText: [sourceMemo?.extractedText ?? "", sourceMemo?.currentTranscriptText ?? ""].join("\n"),
      candidates,
      suppressedTagNames: suppressedTags.map((tag) => tag.normalizedName)
    });
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
      const current = await workItems.findById(workItemId);
      if (current === null) {
        throw new HttpError(404, "not_found", "work_item was not found.");
      }
      const projectWillChange = current.projectId !== input.projectId;
      const updated = await workItems.updateContent({
        workItemId,
        expectedVersion: input.expectedVersion,
        title: input.title,
        body: input.body,
        projectId: input.projectId,
        contributorId: input.contributorId,
        contributorText: input.contributorText,
        actorUserId: actor.id,
        resetTagNomination: projectWillChange && input.tags === undefined
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
      if (input.tags !== undefined) {
        await tags.setForWorkItem({
          workItemId: updated.id,
          projectId: updated.projectId,
          tags: input.tags,
          actorUserId: actor.id
        });
        if (updated.projectId !== null) {
          await workItems.markTagNominationReady({
            workItemId: updated.id,
            projectId: updated.projectId,
            jobId: null
          });
        }
      }
      const tagged = (await workItems.findById(updated.id)) ?? { ...updated, tags: input.tags ?? updated.tags };

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
        actorUserId: actor.id,
        resetTagNomination: false
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

export interface TagSuggestionResponse {
  workItemId: string;
  suggestions: {
    strong: string[];
    related: string[];
    weak: string[];
  };
}

export function buildTagSuggestionResponse(input: {
  workItem: Pick<WorkItemRecord, "id" | "title" | "body" | "tags">;
  sourceText: string;
  candidates: TagSuggestionCandidate[];
  suppressedTagNames?: string[];
}): TagSuggestionResponse {
  const selectedNames = new Set(input.workItem.tags.map(normalizeTagName));
  const suppressedNames = new Set((input.suppressedTagNames ?? []).map(normalizeTagName));
  const rawText = [input.workItem.title, input.workItem.body, input.sourceText].join("\n");
  const normalizedText = normalizeTagName(rawText);
  const textKeywords = extractKeywords(rawText);
  const keywordByName = new Map(textKeywords.map((keyword) => [normalizeTagName(keyword.name), keyword]));
  const candidateByName = new Map<string, ScoredTagSuggestion>();

  for (const candidate of input.candidates) {
    if (selectedNames.has(candidate.normalizedName) || suppressedNames.has(candidate.normalizedName)) {
      continue;
    }
    candidateByName.set(
      candidate.normalizedName,
      scoreTagSuggestion(
        candidate,
        keywordByName.get(candidate.normalizedName),
        normalizedText.includes(candidate.normalizedName)
      )
    );
  }

  const ranked = [...candidateByName.values()]
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, 24);
  const strongCount = Math.min(8, Math.ceil(ranked.length / 3));
  const relatedCount = Math.min(8, Math.ceil((ranked.length - strongCount) / 2));

  return {
    workItemId: input.workItem.id,
    suggestions: {
      strong: ranked.slice(0, strongCount).map((candidate) => candidate.name),
      related: ranked.slice(strongCount, strongCount + relatedCount).map((candidate) => candidate.name),
      weak: ranked.slice(strongCount + relatedCount, strongCount + relatedCount + 8).map((candidate) => candidate.name)
    }
  };
}

function emptyTagSuggestionResponse(workItemId: string): TagSuggestionResponse {
  return {
    workItemId,
    suggestions: {
      strong: [],
      related: [],
      weak: []
    }
  };
}

interface ScoredTagSuggestion {
  name: string;
  score: number;
}

function scoreTagSuggestion(
  candidate: TagSuggestionCandidate,
  keyword: ReturnType<typeof extractKeywords>[number] | undefined,
  exactTextMatch = false
): ScoredTagSuggestion {
  const genericPenalty = GENERIC_TAG_NAMES.has(candidate.normalizedName) ? 24 : 0;
  const keywordScore =
    keyword === undefined ? 0 : keyword.confidence * 54 + Math.min(keyword.itemCount, 5) * 5 + keyword.frequencyBand * 3;
  const score =
    keywordScore +
    (exactTextMatch ? 48 : 0) +
    Math.min(candidate.projectDocumentCount, 12) * 5 +
    Math.min(candidate.selectedCoDocumentCount, 12) * 7 +
    Math.min(candidate.documentCount, 24) * 1.5 +
    Math.min(candidate.totalItemCount, 40) * 0.5 -
    genericPenalty;

  return {
    name: candidate.name,
    score
  };
}

const GENERIC_TAG_NAMES = new Set([
  "feature",
  "features",
  "general",
  "idea",
  "ideas",
  "local",
  "memo",
  "misc",
  "note",
  "notes",
  "other",
  "test",
  "tests",
  "todo",
  "user"
]);

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
  tags: string[] | undefined;
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
    tags: record.tags === undefined ? undefined : parseTags(record.tags)
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
