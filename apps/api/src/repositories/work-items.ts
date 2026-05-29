import { randomUUID } from "node:crypto";
import type { BodyFormat, WorkItemState } from "@memo-capture/domain";
import type { Queryable } from "../db/types.js";
import { mapWorkItem, type WorkItemRow } from "./rows.js";

export interface WorkItemCreateInput {
  sourceMemoId: string;
  projectId: string | null;
  featureGroupId: string | null;
  contributorText: string | null;
  contributorId: string | null;
  title: string;
  body: string;
  bodyFormat: BodyFormat;
  workflowState: WorkItemState;
  actorUserId: string;
}

export type WorkItemRecord = ReturnType<typeof mapWorkItem>;

export class WorkItemRepository {
  constructor(private readonly db: Queryable) {}

  async list(limit = 100): Promise<WorkItemRecord[]> {
    const result = await this.db.query<WorkItemRow>(
      `select *
       from work_items
       order by updated_at desc
       limit $1`,
      [limit]
    );
    return result.rows.map(mapWorkItem);
  }

  async findById(workItemId: string): Promise<WorkItemRecord | null> {
    const result = await this.db.query<WorkItemRow>(
      `select *
       from work_items
       where id = $1`,
      [workItemId]
    );
    return result.rows[0] === undefined ? null : mapWorkItem(result.rows[0]);
  }

  async create(input: WorkItemCreateInput): Promise<WorkItemRecord> {
    const result = await this.db.query<WorkItemRow>(
      `insert into work_items (
         id,
         source_memo_id,
         project_id,
         feature_group_id,
         contributor_text,
         contributor_id,
         title,
         body,
         body_format,
         workflow_state,
         workflow_item_version,
         accepted_unexported_changes,
         created_by,
         updated_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, false, $11, $11, now(), now())
       returning *`,
      [
        randomUUID(),
        input.sourceMemoId,
        input.projectId,
        input.featureGroupId,
        input.contributorText,
        input.contributorId,
        input.title,
        input.body,
        input.bodyFormat,
        input.workflowState,
        input.actorUserId
      ]
    );

    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("Failed to create work item.");
    }

    return mapWorkItem(row);
  }
}
