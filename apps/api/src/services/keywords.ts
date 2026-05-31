import type { Database, Queryable } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import { SourceMemoRepository } from "../repositories/source-memos.js";
import { TagRepository, normalizeTagName, type TagAssignmentInput } from "../repositories/tags.js";
import { WorkItemRepository } from "../repositories/work-items.js";

export interface KeywordGenerationResult {
  workItemId: string;
  tags: {
    name: string;
    itemCount: number;
    confidence: number;
    frequencyBand: number;
  }[];
  groupingPaths: string[][];
}

export class KeywordService {
  constructor(private readonly db: Database | Queryable) {}

  async runKeywordJob(input: {
    jobId: string;
    workItemId: string;
    sourceMemoId: string | null;
  }): Promise<KeywordGenerationResult> {
    const workItems = new WorkItemRepository(this.db);
    const workItem = await workItems.findById(input.workItemId);
    if (workItem === null) {
      throw new KeywordJobError("work_item_not_found", "Keyword generation could not find the work item.", false);
    }

    const sourceMemo =
      input.sourceMemoId === null ? null : await new SourceMemoRepository(this.db).findById(input.sourceMemoId);
    const text = [
      workItem.title,
      workItem.body,
      sourceMemo?.extractedText ?? "",
      sourceMemo?.currentTranscriptText ?? ""
    ]
      .join("\n")
      .trim();
    const keywords = extractKeywords(text);
    const assignments: TagAssignmentInput[] = keywords.map((keyword) => ({
      name: keyword.name,
      assignmentSource: "generated",
      confidence: keyword.confidence,
      itemCount: keyword.itemCount
    }));

    const assignedTags = await new TagRepository(this.db).setForWorkItem({
      workItemId: workItem.id,
      tags: assignments,
      actorUserId: null
    });
    await refreshKeywordStatistics(this.db);
    await refreshKeywordCoOccurrences(this.db, workItem.id);

    await new AuditRepository(this.db).record({
      eventName: "work_item.updated",
      actor: null,
      subjectType: "work_item",
      subjectId: workItem.id,
      requestId: input.jobId,
      sourceMemoId: workItem.sourceMemoId,
      workItemId: workItem.id,
      metadata: {
        updateSource: "keyword_generation",
        tags: assignedTags,
        groupingPaths: buildGroupingPaths(keywords)
      },
      redactionApplied: true
    });

    return {
      workItemId: workItem.id,
      tags: keywords,
      groupingPaths: buildGroupingPaths(keywords)
    };
  }
}

export class KeywordJobError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
  }
}

interface ExtractedKeyword {
  name: string;
  itemCount: number;
  confidence: number;
  frequencyBand: number;
}

export function extractKeywords(text: string): ExtractedKeyword[] {
  const counts = new Map<string, { name: string; count: number }>();
  const phrases = text.match(/\b[A-Z][a-z0-9]+(?:[ \t]+[A-Z][a-z0-9]+){0,3}\b/g) ?? [];
  for (const phrase of phrases) {
    addCandidate(counts, phrase);
  }

  const words = text.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (!STOP_WORDS.has(lower) && !/^\d+$/.test(lower)) {
      addCandidate(counts, lower);
    }
  }

  const sorted = [...counts.values()]
    .filter((candidate) => candidate.name.length >= 3)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 12);
  const maxCount = sorted[0]?.count ?? 1;

  return sorted.map((candidate) => {
    const ratio = candidate.count / maxCount;
    return {
      name: candidate.name,
      itemCount: candidate.count,
      confidence: Number(Math.min(0.95, 0.45 + ratio * 0.5).toFixed(2)),
      frequencyBand: Math.max(1, Math.min(5, Math.ceil(ratio * 5)))
    };
  });
}

function addCandidate(counts: Map<string, { name: string; count: number }>, value: string): void {
  const cleaned = value.trim().replace(/\s+/g, " ");
  const key = normalizeTagName(cleaned);
  if (key === "" || STOP_WORDS.has(key)) {
    return;
  }
  const existing = counts.get(key);
  if (existing === undefined) {
    counts.set(key, { name: cleaned, count: 1 });
    return;
  }
  existing.count += 1;
}

function buildGroupingPaths(keywords: ExtractedKeyword[]): string[][] {
  const byBand = new Map<number, ExtractedKeyword[]>();
  for (const keyword of keywords) {
    const existing = byBand.get(keyword.frequencyBand) ?? [];
    existing.push(keyword);
    byBand.set(keyword.frequencyBand, existing);
  }
  return [...byBand.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([, bandKeywords]) => bandKeywords.slice(0, 5).map((keyword) => keyword.name));
}

async function refreshKeywordStatistics(db: Queryable): Promise<void> {
  await db.query(
    `insert into tag_statistics (
       tag_id,
       document_count,
       total_item_count,
       project_distribution,
       updated_at
     )
     select
       tags.id,
       count(distinct work_item_tags.work_item_id),
       coalesce(sum(work_item_tags.item_count), 0),
       coalesce(
         jsonb_object_agg(project_counts.slug, project_counts.document_count)
           filter (where project_counts.slug is not null),
         '{}'::jsonb
       ),
       now()
     from tags
     join work_item_tags on work_item_tags.tag_id = tags.id
     left join lateral (
       select projects.slug, count(distinct scoped_tags.work_item_id) as document_count
       from work_item_tags scoped_tags
       join work_items on work_items.id = scoped_tags.work_item_id
       join projects on projects.id = work_items.project_id
       where scoped_tags.tag_id = tags.id
       group by projects.slug
     ) project_counts on true
     group by tags.id
     on conflict (tag_id) do update
     set
       document_count = excluded.document_count,
       total_item_count = excluded.total_item_count,
       project_distribution = excluded.project_distribution,
       updated_at = now()`
  );
}

async function refreshKeywordCoOccurrences(db: Queryable, workItemId: string): Promise<void> {
  await db.query(
    `insert into tag_co_occurrences (tag_id, co_tag_id, co_document_count, updated_at)
     select
       least(left_tags.tag_id, right_tags.tag_id),
       greatest(left_tags.tag_id, right_tags.tag_id),
       count(distinct left_tags.work_item_id),
       now()
     from work_item_tags left_tags
     join work_item_tags right_tags
       on right_tags.work_item_id = left_tags.work_item_id
      and right_tags.tag_id <> left_tags.tag_id
     where left_tags.work_item_id = $1
     group by least(left_tags.tag_id, right_tags.tag_id), greatest(left_tags.tag_id, right_tags.tag_id)
     on conflict (tag_id, co_tag_id) do update
     set
       co_document_count = tag_co_occurrences.co_document_count + excluded.co_document_count,
       updated_at = now()`,
    [workItemId]
  );
}

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "but",
  "can",
  "could",
  "for",
  "from",
  "have",
  "into",
  "memo",
  "not",
  "that",
  "the",
  "this",
  "through",
  "use",
  "user",
  "users",
  "with",
  "would",
  "you"
]);
