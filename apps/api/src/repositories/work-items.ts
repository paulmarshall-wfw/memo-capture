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

  async list(input: { states?: string[]; limit?: number } = {}): Promise<WorkItemRecord[]> {
    const states = input.states?.filter((state) => state.trim() !== "") ?? [];
    const limit = input.limit ?? 100;
    const result = await this.db.query<WorkItemRow>(
      `select *
       from work_items
       where (cardinality($2::text[]) = 0 or workflow_state = any($2::text[]))
       order by updated_at desc
       limit $1`,
      [limit, states]
    );
    return result.rows.map(mapWorkItem);
  }

  async countByStates(states: string[]): Promise<number> {
    if (states.length === 0) {
      return 0;
    }

    const result = await this.db.query<{ count: string | number }>(
      `select count(*) as count
       from work_items
       where workflow_state = any($1::text[])`,
      [states]
    );
    const value = result.rows[0]?.count ?? 0;
    return typeof value === "number" ? value : Number.parseInt(value, 10);
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

  async updateWorkflowState(input: {
    workItemId: string;
    expectedVersion: number;
    nextState: string;
    actorUserId: string;
  }): Promise<WorkItemRecord | null> {
    const result = await this.db.query<WorkItemRow>(
      `update work_items
       set
         workflow_state = $3,
         workflow_item_version = workflow_item_version + 1,
         updated_by = $4,
         updated_at = now()
       where id = $1 and workflow_item_version = $2
       returning *`,
      [input.workItemId, input.expectedVersion, input.nextState, input.actorUserId]
    );

    return result.rows[0] === undefined ? null : mapWorkItem(result.rows[0]);
  }

  async setAcceptedSnapshot(input: {
    workItemId: string;
    acceptedSnapshotId: string;
    actorUserId: string;
  }): Promise<WorkItemRecord> {
    const result = await this.db.query<WorkItemRow>(
      `update work_items
       set
         accepted_snapshot_id = $2,
         accepted_unexported_changes = false,
         updated_by = $3,
         updated_at = now()
       where id = $1
       returning *`,
      [input.workItemId, input.acceptedSnapshotId, input.actorUserId]
    );

    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("Failed to set accepted snapshot.");
    }
    return mapWorkItem(row);
  }

  async updateContent(input: {
    workItemId: string;
    expectedVersion: number;
    title: string;
    body: string;
    projectId: string | null;
    featureGroupId: string | null;
    contributorId: string | null;
    contributorText: string | null;
    actorUserId: string;
  }): Promise<WorkItemRecord | null> {
    const result = await this.db.query<WorkItemRow>(
      `update work_items
       set
         title = $3,
         body = $4,
         project_id = $5,
         feature_group_id = $6,
         contributor_id = $7,
         contributor_text = $8,
         workflow_item_version = workflow_item_version + 1,
         accepted_unexported_changes = case
           when accepted_snapshot_id is null then accepted_unexported_changes
           else true
         end,
         updated_by = $9,
         updated_at = now()
       where id = $1 and workflow_item_version = $2
       returning *`,
      [
        input.workItemId,
        input.expectedVersion,
        input.title,
        input.body,
        input.projectId,
        input.featureGroupId,
        input.contributorId,
        input.contributorText,
        input.actorUserId
      ]
    );

    return result.rows[0] === undefined ? null : mapWorkItem(result.rows[0]);
  }
}

export class AcceptedSnapshotRepository {
  constructor(private readonly db: Queryable) {}

  async createFromWorkItem(input: {
    workItemId: string;
    actorUserId: string;
  }): Promise<{ id: string } | null> {
    const result = await this.db.query<{ id: string }>(
      `with next_snapshot as (
         select coalesce(max(snapshot_number), 0) + 1 as snapshot_number
         from accepted_snapshots
         where work_item_id = $1
       )
       insert into accepted_snapshots (
         id,
         work_item_id,
         snapshot_number,
         title,
         body,
         body_format,
         project_id,
         project_slug,
         project_name,
         feature_group_id,
         feature_group_name,
         contributor_text,
         contributor_id,
         source_memo_id,
         source_content_hash,
         created_by,
         created_at
       )
       select
         $2,
         work_items.id,
         next_snapshot.snapshot_number,
         work_items.title,
         work_items.body,
         work_items.body_format,
         projects.id,
         projects.slug,
         projects.name,
         work_items.feature_group_id,
         feature_groups.name,
         work_items.contributor_text,
         work_items.contributor_id,
         work_items.source_memo_id,
         source_memos.content_hash,
         $3,
         now()
       from work_items
       cross join next_snapshot
       join projects on projects.id = work_items.project_id
       join source_memos on source_memos.id = work_items.source_memo_id
       left join feature_groups on feature_groups.id = work_items.feature_group_id
       where work_items.id = $1
       returning id`,
      [input.workItemId, randomUUID(), input.actorUserId]
    );

    return result.rows[0] ?? null;
  }
}
