import type { Database } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { WorkItemRepository, type WorkItemRecord } from "../repositories/work-items.js";
import { WorkflowRepository } from "../repositories/workflows.js";
import { assertNonEmptyString, HttpError, optionalString } from "./errors.js";
import { WorkflowRuntimeAdapter } from "./workflow-runtime.js";

export class WorkItemService {
  private readonly runtime = new WorkflowRuntimeAdapter();

  constructor(private readonly db: Database) {}

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
      const audit = new AuditRepository(client);
      const updated = await workItems.updateContent({
        workItemId,
        expectedVersion: input.expectedVersion,
        title: input.title,
        body: input.body,
        projectId: input.projectId,
        featureGroupId: input.featureGroupId,
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

      await audit.record({
        eventName: "work_item.updated",
        actor,
        subjectType: "work_item",
        subjectId: updated.id,
        requestId,
        sourceMemoId: updated.sourceMemoId,
        workItemId: updated.id,
        metadata: {
          workflowState: updated.workflowState,
          newVersion: updated.workflowItemVersion,
          acceptedUnexportedChanges: updated.acceptedUnexportedChanges
        }
      });

      return updated;
    });
  }
}

function parseUpdateBody(body: unknown): {
  expectedVersion: number;
  title: string;
  body: string;
  projectId: string | null;
  featureGroupId: string | null;
  contributorId: string | null;
  contributorText: string | null;
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
    featureGroupId: optionalString(record.featureGroupId, "featureGroupId"),
    contributorId: optionalString(record.contributorId, "contributorId"),
    contributorText: optionalString(record.contributorText, "contributorText")
  };
}

function parseObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Request body must be an object.");
  }

  return body as Record<string, unknown>;
}
