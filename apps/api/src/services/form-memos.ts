import { createHash } from "node:crypto";
import { DEFAULT_MEMO_WORK_ITEM_STATE } from "@memo-capture/domain";
import type { Database, Queryable } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import { ImportEventRepository, SourceMemoRepository } from "../repositories/source-memos.js";
import { WorkItemRepository, type WorkItemRecord } from "../repositories/work-items.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { assertNonEmptyString, HttpError, optionalString } from "./errors.js";

export interface FormMemoRequest {
  projectId: string;
  featureGroupId?: string | null;
  title: string;
  body: string;
  contributorText?: string | null;
  tags?: string[];
}

export interface FormMemoResult {
  sourceMemoId: string;
  workItem: WorkItemRecord;
}

export class FormMemoService {
  constructor(private readonly db: Database) {}

  async createFromRequest(
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<FormMemoResult> {
    const input = parseFormMemoRequest(requestBody);
    const contentHash = createHash("sha256").update(input.body).digest("hex");

    return this.db.transaction(async (client) =>
      createFormMemoWithClient(client, input, actor, requestId, contentHash)
    );
  }
}

async function createFormMemoWithClient(
  client: Queryable,
  input: FormMemoRequest,
  actor: AppUserRecord,
  requestId: string,
  contentHash: string
): Promise<FormMemoResult> {
  const sourceMemos = new SourceMemoRepository(client);
  const importEvents = new ImportEventRepository(client);
  const workItems = new WorkItemRepository(client);
  const audit = new AuditRepository(client);

  const sourceMemo = await sourceMemos.create({
    sourceType: "form",
    originalText: input.body,
    extractedText: input.body,
    contentHash,
    contributorText: input.contributorText ?? null,
    createdBy: actor.id
  });

  const workItem = await workItems.create({
    sourceMemoId: sourceMemo.id,
    projectId: input.projectId,
    featureGroupId: input.featureGroupId ?? null,
    contributorText: input.contributorText ?? null,
    contributorId: null,
    title: input.title,
    body: input.body,
    bodyFormat: "markdown",
    workflowState: DEFAULT_MEMO_WORK_ITEM_STATE,
    actorUserId: actor.id
  });

  await importEvents.create({
    sourceMemoId: sourceMemo.id,
    contentHash,
    status: "imported"
  });

  await audit.record({
    eventName: "source_memo.created",
    actor,
    subjectType: "source_memo",
    subjectId: sourceMemo.id,
    requestId,
    sourceMemoId: sourceMemo.id,
    metadata: { sourceType: "form" }
  });

  await audit.record({
    eventName: "work_item.created",
    actor,
    subjectType: "work_item",
    subjectId: workItem.id,
    requestId,
    sourceMemoId: sourceMemo.id,
    workItemId: workItem.id,
    metadata: { workflowState: DEFAULT_MEMO_WORK_ITEM_STATE }
  });

  return {
    sourceMemoId: sourceMemo.id,
    workItem
  };
}

function parseFormMemoRequest(body: unknown): FormMemoRequest {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Form memo request body must be an object.");
  }

  const record = body as Record<string, unknown>;
  return {
    projectId: assertNonEmptyString(record.projectId, "projectId"),
    featureGroupId: optionalString(record.featureGroupId, "featureGroupId"),
    title: assertNonEmptyString(record.title, "title"),
    body: assertNonEmptyString(record.body, "body"),
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
