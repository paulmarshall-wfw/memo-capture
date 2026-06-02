import type { Database } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import { ProjectRepository } from "../repositories/catalog.js";
import { SourceMemoRepository } from "../repositories/source-memos.js";
import type { TagAssignmentInput } from "../repositories/tags.js";
import { WorkItemRepository } from "../repositories/work-items.js";
import { extractKeywords, KeywordJobError } from "./keywords.js";

export interface MetadataExtractionResult {
  workItemId: string;
  title: string;
  body: string;
  contributorText: string | null;
  projectSuggestion: {
    projectId: string;
    projectName: string;
    confidence: number;
  } | null;
  tags: string[];
}

export interface DeterministicMetadataInput {
  title: string;
  body: string;
  sourceText: string;
  existingContributorText: string | null;
  projects: { id: string; name: string; isActive: boolean }[];
}

export interface DeterministicMetadataResult {
  title: string;
  body: string;
  contributorText: string | null;
  projectSuggestion: {
    projectId: string;
    projectName: string;
    confidence: number;
  } | null;
  tagAssignments: TagAssignmentInput[];
}

export class MetadataExtractionService {
  constructor(private readonly db: Database) {}

  async runExtractionJob(input: {
    jobId: string;
    workItemId: string;
    sourceMemoId: string | null;
  }): Promise<MetadataExtractionResult> {
    const workItems = new WorkItemRepository(this.db);
    const workItem = await workItems.findById(input.workItemId);
    if (workItem === null) {
      throw new KeywordJobError("work_item_not_found", "Metadata extraction could not find the work item.", false);
    }

    const sourceMemo =
      input.sourceMemoId === null ? null : await new SourceMemoRepository(this.db).findById(input.sourceMemoId);
    const sourceText = [sourceMemo?.extractedText ?? "", sourceMemo?.currentTranscriptText ?? ""]
      .join("\n")
      .trim();
    const projects = await new ProjectRepository(this.db).list();
    const extracted = extractDeterministicMemoMetadata({
      title: workItem.title,
      body: workItem.body,
      sourceText,
      existingContributorText: workItem.contributorText,
      projects
    });
    await workItems.applyMetadataExtraction({
      workItemId: workItem.id,
      title: extracted.title,
      body: extracted.body,
      contributorText: extracted.contributorText,
      actorUserId: null
    });

    await new AuditRepository(this.db).record({
      eventName: "work_item.updated",
      actor: null,
      subjectType: "work_item",
      subjectId: workItem.id,
      requestId: input.jobId,
      sourceMemoId: workItem.sourceMemoId,
      workItemId: workItem.id,
      metadata: {
        updateSource: "metadata_extraction",
        projectSuggestion: extracted.projectSuggestion,
        contributorSuggested: extracted.contributorText !== null
      },
      redactionApplied: true
    });

    return {
      workItemId: workItem.id,
      title: extracted.title,
      body: extracted.body,
      contributorText: extracted.contributorText,
      projectSuggestion: extracted.projectSuggestion,
      tags: []
    };
  }
}

export function extractDeterministicMemoMetadata(input: DeterministicMetadataInput): DeterministicMetadataResult {
  const body = normalizeBody(input.body.trim() === "" ? input.sourceText : input.body);
  const title = normalizeTitle(input.title, body);
  const contributorText = input.existingContributorText ?? extractContributorHint(body);
  const projectSuggestion = suggestProject(body, title, input.projects);
  const tagAssignments: TagAssignmentInput[] = extractKeywords([title, body].join("\n")).map((keyword) => ({
    name: keyword.name,
    assignmentSource: "generated",
    confidence: keyword.confidence,
    itemCount: keyword.itemCount
  }));
  return { title, body, contributorText, projectSuggestion, tagAssignments };
}

function normalizeBody(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

function normalizeTitle(existingTitle: string, body: string): string {
  const cleanedExisting = existingTitle.trim().replace(/\s+/g, " ");
  const firstBodyLine = body
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line !== "");
  const candidate = cleanedExisting === "" ? firstBodyLine ?? "Untitled memo" : cleanedExisting;
  return candidate.slice(0, 120);
}

function extractContributorHint(body: string): string | null {
  const match = /(?:^|\n)\s*(?:by|from|contributor)\s*:\s*([^\n]{2,80})/i.exec(body);
  return match?.[1]?.trim() ?? null;
}

function suggestProject(
  body: string,
  title: string,
  projects: { id: string; name: string; isActive: boolean }[]
): { projectId: string; projectName: string; confidence: number } | null {
  const text = `${title}\n${body}`.toLowerCase();
  const matches = projects
    .filter((project) => project.isActive)
    .map((project) => ({
      project,
      occurrences: countOccurrences(text, project.name.toLowerCase())
    }))
    .filter((entry) => entry.occurrences > 0)
    .sort((left, right) => right.occurrences - left.occurrences || left.project.name.localeCompare(right.project.name));
  const best = matches[0];
  if (best === undefined) {
    return null;
  }
  return {
    projectId: best.project.id,
    projectName: best.project.name,
    confidence: Number(Math.min(0.95, 0.55 + best.occurrences * 0.1).toFixed(2))
  };
}

function countOccurrences(text: string, needle: string): number {
  if (needle.trim() === "") {
    return 0;
  }
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}
