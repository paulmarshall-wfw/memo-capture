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

export interface TagSuggestionCandidate {
  name: string;
  normalizedName: string;
  documentCount: number;
  totalItemCount: number;
  projectDocumentCount: number;
  selectedCoDocumentCount: number;
}

interface TagRow extends Record<string, unknown> {
  id: string;
  name: string;
  normalized_name: string;
}

interface TagSuggestionCandidateRow extends Record<string, unknown> {
  name: string;
  normalized_name: string;
  document_count: string | number;
  total_item_count: string | number;
  project_document_count: string | number;
  selected_co_document_count: string | number;
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

  async listSuggestionCandidates(input: {
    projectId: string | null;
    selectedTagNames: string[];
    limit?: number;
  }): Promise<TagSuggestionCandidate[]> {
    const selectedNormalizedNames = normalizeTagList(input.selectedTagNames).map(normalizeTagName);
    const result = await this.db.query<TagSuggestionCandidateRow>(
      `select
         tags.name,
         tags.normalized_name,
         coalesce(tag_statistics.document_count, 0) as document_count,
         coalesce(tag_statistics.total_item_count, 0) as total_item_count,
         coalesce((tag_statistics.project_distribution ->> projects.slug)::integer, 0) as project_document_count,
         coalesce(co_occurrence_totals.selected_co_document_count, 0) as selected_co_document_count
       from tags
       left join tag_statistics on tag_statistics.tag_id = tags.id
       left join projects on projects.id = $1::uuid
       left join lateral (
         select coalesce(sum(tag_co_occurrences.co_document_count), 0)::integer as selected_co_document_count
         from tag_co_occurrences
         join tags selected_tags
           on selected_tags.normalized_name = any($2::text[])
         where
           (tag_co_occurrences.tag_id = tags.id and tag_co_occurrences.co_tag_id = selected_tags.id)
           or (tag_co_occurrences.co_tag_id = tags.id and tag_co_occurrences.tag_id = selected_tags.id)
       ) co_occurrence_totals on true
       where not (tags.normalized_name = any($2::text[]))
       order by
         coalesce(co_occurrence_totals.selected_co_document_count, 0) desc,
         coalesce((tag_statistics.project_distribution ->> projects.slug)::integer, 0) desc,
         coalesce(tag_statistics.document_count, 0) desc,
         lower(tags.name),
         tags.name
       limit $3`,
      [input.projectId, selectedNormalizedNames, input.limit ?? 80]
    );

    return result.rows.map((row) => ({
      name: row.name,
      normalizedName: row.normalized_name,
      documentCount: toNumber(row.document_count),
      totalItemCount: toNumber(row.total_item_count),
      projectDocumentCount: toNumber(row.project_document_count),
      selectedCoDocumentCount: toNumber(row.selected_co_document_count)
    }));
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

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number.parseInt(value, 10);
}
