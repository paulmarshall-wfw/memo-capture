import type { Database, Queryable } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import { SourceMemoRepository } from "../repositories/source-memos.js";
import { TagRepository, normalizeTagName, type TagAssignmentInput } from "../repositories/tags.js";
import { WorkflowRepository } from "../repositories/workflows.js";
import { WorkItemRepository, type WorkItemRecord } from "../repositories/work-items.js";
import { WorkflowHookScheduler } from "./workflow-hooks.js";
import { WorkflowRuntimeAdapter } from "./workflow-runtime.js";

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
  private readonly runtime = new WorkflowRuntimeAdapter();

  constructor(private readonly db: Database | Queryable) {}

  async runKeywordJob(input: {
    jobId: string;
    workItemId: string;
    sourceMemoId: string | null;
  }): Promise<KeywordGenerationResult> {
    const workItem = await this.requireWorkItem(input.workItemId);
    return this.assignKeywordTags({
      jobId: input.jobId,
      workItem,
      sourceMemoId: input.sourceMemoId,
      updateSource: "keyword_generation"
    });
  }

  async runNominateTagsJob(input: {
    jobId: string;
    workItemId: string;
    sourceMemoId: string | null;
  }): Promise<KeywordGenerationResult> {
    const workItem = await this.requireWorkItem(input.workItemId);
    const active = await new WorkflowRepository(this.db).getActive();
    const hook =
      active === null
        ? undefined
        : this.runtime
            .getStateResidentHooks(active.bundle, workItem.workflowState)
            .find((candidate) => candidate.handlerKey === "nominate_tags");
    if (hook === undefined) {
      return {
        workItemId: workItem.id,
        tags: [],
        groupingPaths: []
      };
    }

    const result = await this.assignKeywordTags({
      jobId: input.jobId,
      workItem,
      sourceMemoId: input.sourceMemoId,
      updateSource: "nominate_tags",
      hookId: hook.id
    });
    const latest = await new WorkItemRepository(this.db).findById(workItem.id);
    if (latest?.workflowState === workItem.workflowState && hook.schedule?.trigger === "every_interval") {
      await new WorkflowHookScheduler(this.db).scheduleStateResidentHooksForWorkItem({
        workItem: latest,
        actorUserId: null
      });
    }
    return result;
  }

  private async requireWorkItem(workItemId: string): Promise<WorkItemRecord> {
    const workItems = new WorkItemRepository(this.db);
    const workItem = await workItems.findById(workItemId);
    if (workItem === null) {
      throw new KeywordJobError("work_item_not_found", "Keyword generation could not find the work item.", false);
    }
    return workItem;
  }

  private async assignKeywordTags(input: {
    jobId: string;
    workItem: WorkItemRecord;
    sourceMemoId: string | null;
    updateSource: "keyword_generation" | "nominate_tags";
    hookId?: string;
  }): Promise<KeywordGenerationResult> {
    const sourceMemo =
      input.sourceMemoId === null ? null : await new SourceMemoRepository(this.db).findById(input.sourceMemoId);
    const text = [
      input.workItem.title,
      input.workItem.body,
      sourceMemo?.extractedText ?? "",
      sourceMemo?.currentTranscriptText ?? ""
    ]
      .join("\n")
      .trim();
    const corpusTexts = await loadKeywordCorpus(this.db, input.workItem.id);
    const tags = new TagRepository(this.db);
    const [projectLexiconNames, suppressedTags] = await Promise.all([
      tags.listProjectLexiconNormalizedNames(input.workItem.projectId),
      tags.listSuppressed()
    ]);
    const projectLexicon = new Set(projectLexiconNames);
    const suppressedNames = new Set(suppressedTags.map((tag) => tag.normalizedName));
    const keywords = extractKeywords(text, { corpusTexts });
    const nominatedKeywords = keywords.filter((keyword) => {
      const normalizedName = normalizeTagName(keyword.name);
      return projectLexicon.has(normalizedName) && !suppressedNames.has(normalizedName);
    });
    const assignments: TagAssignmentInput[] = nominatedKeywords.map((keyword) => ({
      name: keyword.name,
      assignmentSource: "generated",
      confidence: keyword.confidence,
      itemCount: keyword.itemCount
    }));

    const assignedTags = await tags.setForWorkItem({
      workItemId: input.workItem.id,
      projectId: input.workItem.projectId,
      tags: assignments,
      actorUserId: null
    });
    await new WorkItemRepository(this.db).markTagNominationReady({
      workItemId: input.workItem.id,
      projectId: input.workItem.projectId,
      jobId: input.updateSource === "nominate_tags" ? input.jobId : null
    });
    await refreshKeywordStatistics(this.db);
    await refreshKeywordCoOccurrences(this.db, input.workItem.id);

    await new AuditRepository(this.db).record({
      eventName: "work_item.updated",
      actor: null,
      subjectType: "work_item",
      subjectId: input.workItem.id,
      requestId: input.jobId,
      sourceMemoId: input.workItem.sourceMemoId,
      workItemId: input.workItem.id,
      metadata: {
        updateSource: input.updateSource,
        hookId: input.hookId,
        tags: assignedTags,
        groupingPaths: buildGroupingPaths(nominatedKeywords)
      },
      redactionApplied: true
    });

    return {
      workItemId: input.workItem.id,
      tags: nominatedKeywords,
      groupingPaths: buildGroupingPaths(nominatedKeywords)
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

interface KeywordExtractionOptions {
  corpusTexts?: string[];
  maxKeywords?: number;
}

interface KeywordCandidate {
  name: string;
  count: number;
  score: number;
}

export function extractKeywords(text: string, options: KeywordExtractionOptions = {}): ExtractedKeyword[] {
  const counts = new Map<string, { name: string; count: number }>();
  const phrases = text.match(/\b[A-Z][a-z0-9]+(?:[ \t]+[A-Z][a-z0-9]+){0,3}\b/g) ?? [];
  for (const phrase of phrases) {
    addCandidate(counts, phrase);
  }

  const words = text.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (isDistinctiveTerm(lower)) {
      addCandidate(counts, lower);
    }
  }

  const corpusTexts = options.corpusTexts?.filter((entry) => entry.trim() !== "") ?? [];
  const documentFrequencyByKey = buildDocumentFrequencies(corpusTexts);
  const corpusSize = corpusTexts.length;
  const sorted = [...counts.values()]
    .map((candidate) => scoreCandidate(candidate, documentFrequencyByKey, corpusSize))
    .filter((candidate): candidate is KeywordCandidate => candidate !== null)
    .sort(
      (left, right) =>
        right.score - left.score || right.count - left.count || left.name.localeCompare(right.name)
    )
    .slice(0, options.maxKeywords ?? 12);
  const maxCount = sorted[0]?.count ?? 1;
  const maxScore = sorted[0]?.score ?? 1;

  return sorted.map((candidate) => {
    const ratio = Math.max(candidate.count / maxCount, candidate.score / maxScore);
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
  if (!isDistinctiveCandidate(cleaned)) {
    return;
  }
  const existing = counts.get(key);
  if (existing === undefined) {
    counts.set(key, { name: cleaned, count: 1 });
    return;
  }
  existing.count += 1;
}

function scoreCandidate(
  candidate: { name: string; count: number },
  documentFrequencyByKey: Map<string, number>,
  corpusSize: number
): KeywordCandidate | null {
  const terms = extractCandidateTerms(candidate.name);
  if (terms.length === 0) {
    return null;
  }

  const key = normalizeTagName(candidate.name);
  const phraseBonus = terms.length > 1 ? 1.65 : 1;
  const hyphenBonus = candidate.name.includes("-") ? 1.2 : 1;
  const exactDocumentFrequency = documentFrequencyByKey.get(key);
  const termIdf =
    corpusSize === 0
      ? 1
      : terms.reduce((total, term) => total + inverseDocumentFrequency(term, documentFrequencyByKey, corpusSize), 0) /
        terms.length;
  const phraseIdf =
    corpusSize === 0 || exactDocumentFrequency === undefined
      ? termIdf
      : inverseDocumentFrequency(key, documentFrequencyByKey, corpusSize);
  const idf = terms.length > 1 ? Math.max(termIdf, phraseIdf) : termIdf;
  const score = candidate.count * idf * phraseBonus * hyphenBonus;
  const minimumScore = corpusSize === 0 ? 1 : terms.length > 1 ? 1.2 : 1.35;
  if (score < minimumScore) {
    return null;
  }

  return {
    name: candidate.name,
    count: candidate.count,
    score
  };
}

function inverseDocumentFrequency(term: string, documentFrequencyByKey: Map<string, number>, corpusSize: number): number {
  const documentFrequency = documentFrequencyByKey.get(term) ?? 0;
  return Math.log((corpusSize + 1) / (documentFrequency + 1)) + 1;
}

function buildDocumentFrequencies(corpusTexts: string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const corpusText of corpusTexts) {
    const keys = new Set<string>();
    const words = corpusText.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? [];
    for (const word of words) {
      const lower = word.toLowerCase();
      if (isDistinctiveTerm(lower)) {
        keys.add(normalizeTagName(lower));
      }
    }

    const phrases = corpusText.match(/\b[A-Z][a-z0-9]+(?:[ \t]+[A-Z][a-z0-9]+){1,3}\b/g) ?? [];
    for (const phrase of phrases) {
      if (isDistinctiveCandidate(phrase)) {
        keys.add(normalizeTagName(phrase));
      }
    }

    for (const key of keys) {
      frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
    }
  }
  return frequencies;
}

function isDistinctiveCandidate(value: string): boolean {
  const terms = extractCandidateTerms(value);
  if (terms.length === 0) {
    return false;
  }
  if (terms.length === 1) {
    return isDistinctiveTerm(terms[0] ?? "");
  }
  return terms.some((term) => !COMMON_SINGLE_TERMS.has(term));
}

function extractCandidateTerms(value: string): string[] {
  return value
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g)
    ?.map(normalizeTagName)
    .filter(isDistinctiveTerm) ?? [];
}

function isDistinctiveTerm(value: string): boolean {
  const normalized = normalizeTagName(value);
  return (
    normalized.length >= 3 &&
    !/^\d+$/.test(normalized) &&
    !STOP_WORDS.has(normalized) &&
    !COMMON_SINGLE_TERMS.has(normalized)
  );
}

async function loadKeywordCorpus(db: Queryable, workItemId: string): Promise<string[]> {
  const result = await db.query<{ corpus_text: string | null }>(
    `select concat_ws(
              E'\n',
              work_items.title,
              work_items.body,
              source_memos.extracted_text,
              source_memos.current_transcript_text
            ) as corpus_text
     from work_items
     left join source_memos on source_memos.id = work_items.source_memo_id
     where work_items.id <> $1
     order by work_items.updated_at desc
     limit 500`,
    [workItemId]
  );
  return result.rows.map((row) => row.corpus_text?.trim() ?? "").filter((entry) => entry !== "");
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
  "able",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "also",
  "among",
  "an",
  "and",
  "any",
  "are",
  "around",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "doing",
  "done",
  "down",
  "each",
  "few",
  "for",
  "from",
  "had",
  "has",
  "have",
  "having",
  "here",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "more",
  "most",
  "near",
  "new",
  "no",
  "nor",
  "memo",
  "not",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "out",
  "over",
  "own",
  "same",
  "so",
  "some",
  "such",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "up",
  "use",
  "used",
  "user",
  "users",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "will",
  "with",
  "within",
  "without",
  "would",
  "you"
]);

const COMMON_SINGLE_TERMS = new Set([
  "added",
  "adds",
  "change",
  "changed",
  "changes",
  "create",
  "created",
  "creates",
  "creating",
  "day",
  "done",
  "during",
  "fail",
  "failed",
  "feature",
  "features",
  "flow",
  "flows",
  "generated",
  "item",
  "items",
  "local",
  "make",
  "makes",
  "making",
  "pass",
  "passed",
  "run",
  "running",
  "runs",
  "save",
  "saved",
  "set",
  "sets",
  "setting",
  "settings",
  "test",
  "tests",
  "time",
  "today",
  "update",
  "updated",
  "updates",
  "using",
  "version",
  "work"
]);
