import { randomUUID } from "node:crypto";
import type { Queryable } from "../db/types.js";

export interface TagRecord {
  id: string;
  name: string;
  normalizedName: string;
}

export interface TagAssignmentInput {
  name: string;
  assignmentSource?: string | null;
  confidence?: number | null;
  itemCount?: number | null;
}

interface TagRow extends Record<string, unknown> {
  id: string;
  name: string;
  normalized_name: string;
}

export class TagRepository {
  constructor(private readonly db: Queryable) {}

  async listForWorkItems(workItemIds: string[]): Promise<Map<string, string[]>> {
    const tagMap = new Map<string, string[]>();
    if (workItemIds.length === 0) {
      return tagMap;
    }

    const result = await this.db.query<{ work_item_id: string; name: string }>(
      `select work_item_tags.work_item_id, tags.name
       from work_item_tags
       join tags on tags.id = work_item_tags.tag_id
       where work_item_tags.work_item_id = any($1::uuid[])
       order by lower(tags.name), tags.name`,
      [workItemIds]
    );
    for (const row of result.rows) {
      const existing = tagMap.get(row.work_item_id) ?? [];
      existing.push(row.name);
      tagMap.set(row.work_item_id, existing);
    }
    return tagMap;
  }

  async setForWorkItem(input: {
    workItemId: string;
    tags: string[] | TagAssignmentInput[];
    actorUserId: string | null;
  }): Promise<string[]> {
    const normalizedTags = normalizeTagAssignments(input.tags);
    await this.db.query("delete from work_item_tags where work_item_id = $1", [input.workItemId]);
    for (const assignment of normalizedTags) {
      const tag = await this.upsertTag(assignment.name, input.actorUserId);
      await this.db.query(
        `insert into work_item_tags (
           work_item_id,
           tag_id,
           assignment_source,
           confidence,
           item_count,
           created_by,
           created_at
         )
         values ($1, $2, $3, $4, $5, $6, now())
         on conflict (work_item_id, tag_id) do nothing`,
        [
          input.workItemId,
          tag.id,
          assignment.assignmentSource ?? "user",
          assignment.confidence ?? null,
          assignment.itemCount ?? null,
          input.actorUserId
        ]
      );
    }
    return normalizedTags.map((tag) => tag.name);
  }

  private async upsertTag(name: string, actorUserId: string | null): Promise<TagRecord> {
    const result = await this.db.query<TagRow>(
      `insert into tags (id, name, normalized_name, created_by, created_at)
       values ($1, $2, $3, $4, now())
       on conflict (normalized_name) do update
       set name = tags.name
       returning id, name, normalized_name`,
      [randomUUID(), name, normalizeTagName(name), actorUserId]
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("Failed to upsert tag.");
    }
    return {
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name
    };
  }
}

export function normalizeTagList(tags: string[]): string[] {
  return normalizeTagAssignments(tags).map((tag) => tag.name);
}

export function normalizeTagAssignments(tags: string[] | TagAssignmentInput[]): TagAssignmentInput[] {
  const seen = new Set<string>();
  const normalized: TagAssignmentInput[] = [];
  for (const tag of tags) {
    const assignment = typeof tag === "string" ? { name: tag } : tag;
    const cleaned = assignment.name.trim().replace(/\s+/g, " ");
    const key = normalizeTagName(cleaned);
    if (cleaned === "" || key === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({ ...assignment, name: cleaned });
  }
  return normalized.slice(0, 20);
}

export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
