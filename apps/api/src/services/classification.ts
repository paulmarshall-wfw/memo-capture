import { INGESTION_REVIEW_WORK_ITEM_STATE } from "@memo-capture/domain";
import type { Queryable } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import { ProjectRepository } from "../repositories/catalog.js";
import type { AppUserRecord, ProjectRecord } from "../repositories/rows.js";
import { SettingsRepository } from "../repositories/settings.js";
import { SourceMemoRepository } from "../repositories/source-memos.js";
import { WorkItemRepository, type WorkItemRecord } from "../repositories/work-items.js";
import { WorkflowRepository } from "../repositories/workflows.js";
import { extractDeterministicMemoMetadata } from "./metadata-extraction.js";
import { WorkflowHookScheduler } from "./workflow-hooks.js";
import { WorkflowRuntimeAdapter, type WorkflowHook } from "./workflow-runtime.js";

export const DEFAULT_PROJECT_CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.65;
const PROMOTE_REVIEW_MEMO_ACTION_ID = "review.memo";

export interface InitialStateHookResult {
  workItem: WorkItemRecord;
  promoted: boolean;
  classification: ClassificationResult | null;
  scheduledJobIds: string[];
}

interface ClassificationResult {
  status: "promoted" | "classified" | "not_ready" | "ambiguous" | "unmatched" | "action_unavailable";
  projectSuggestion: {
    projectId: string;
    projectName: string;
    confidence: number;
  } | null;
  threshold: number;
}

export class ClassificationService {
  private readonly runtime = new WorkflowRuntimeAdapter();

  constructor(private readonly client: Queryable) {}

  async runInitialStateHooksForWorkItem(input: {
    workItem: WorkItemRecord;
    actor: AppUserRecord | null;
    requestId: string | null;
  }): Promise<InitialStateHookResult> {
    const active = await new WorkflowRepository(this.client).getActive();
    if (active === null) {
      return {
        workItem: input.workItem,
        promoted: false,
        classification: null,
        scheduledJobIds: []
      };
    }

    let current = input.workItem;
    let classification: ClassificationResult | null = null;
    let promoted = false;
    const scheduledJobIds: string[] = [];
    for (const hook of this.runtime.getStateEntryHooks(active.bundle, current.workflowState)) {
      if (hook.handlerKey !== "classify_item") {
        continue;
      }
      const result = await this.runClassifyItemHook({
        hook,
        workItemId: current.id,
        actor: input.actor,
        requestId: input.requestId,
        activeWorkflowBundle: active.bundle,
        workflowId: active.workflow_id,
        workflowVersion: active.workflow_version
      });
      current = result.workItem;
      classification = result.classification;
      promoted = promoted || result.promoted;
      scheduledJobIds.push(...result.scheduledJobIds);
    }

    return { workItem: current, promoted, classification, scheduledJobIds };
  }

  async runClassifyItemForWorkItem(input: {
    workItemId: string;
    actorUserId: string | null;
    requestId: string | null;
  }): Promise<InitialStateHookResult | null> {
    const workItems = new WorkItemRepository(this.client);
    const workItem = await workItems.findById(input.workItemId);
    if (workItem === null) {
      return null;
    }
    return this.runInitialStateHooksForWorkItem({
      workItem,
      actor: input.actorUserId === null ? null : actorFromId(input.actorUserId),
      requestId: input.requestId
    });
  }

  async runClassifyItemHook(input: {
    hook: WorkflowHook;
    workItemId: string;
    actor: AppUserRecord | null;
    requestId: string | null;
    activeWorkflowBundle: unknown;
    workflowId: string;
    workflowVersion: string;
  }): Promise<InitialStateHookResult> {
    const workItems = new WorkItemRepository(this.client);
    const audit = new AuditRepository(this.client);
    const current = await workItems.findById(input.workItemId);
    if (current === null) {
      throw new Error("classify_item could not find the work item.");
    }
    if (current.workflowState !== INGESTION_REVIEW_WORK_ITEM_STATE) {
      return {
        workItem: current,
        promoted: false,
        classification: null,
        scheduledJobIds: []
      };
    }

    const sourceMemo = await new SourceMemoRepository(this.client).findById(current.sourceMemoId);
    const sourceText = [sourceMemo?.extractedText ?? "", sourceMemo?.currentTranscriptText ?? ""].join("\n").trim();
    const projects = await new ProjectRepository(this.client).list();
    const settings = await new SettingsRepository(this.client).getExtractionSettings();
    const threshold =
      settings === null
        ? DEFAULT_PROJECT_CLASSIFICATION_CONFIDENCE_THRESHOLD
        : toNumber(settings.project_confidence_threshold);
    const extracted = extractDeterministicMemoMetadata({
      title: current.title,
      body: current.body,
      sourceText,
      existingContributorText: current.contributorText,
      projects
    });
    const projectSuggestion = findSingleActiveProjectMatch({
      title: extracted.title,
      body: extracted.body,
      sourceText,
      projects
    });
    const projectId =
      current.projectId !== null
        ? current.projectId
        : projectSuggestion !== null && projectSuggestion.confidence >= threshold
          ? projectSuggestion.projectId
          : null;

    const maybeUpdated = await workItems.applyClassification({
      workItemId: current.id,
      title: extracted.title,
      body: extracted.body,
      contributorText: extracted.contributorText,
      projectId,
      actorUserId: input.actor?.id ?? null
    });
    const classified = maybeUpdated ?? (await workItems.findById(current.id));
    if (classified === null) {
      throw new Error("classify_item could not reload the work item.");
    }

    const readiness = promotionReadiness(classified);
    let status: ClassificationResult["status"] =
      projectSuggestion === null
        ? "unmatched"
        : projectSuggestion.confidence < threshold
          ? "not_ready"
          : "classified";
    if (projectSuggestion === null && countActiveProjectMatches([extracted.title, extracted.body, sourceText].join("\n"), projects) > 1) {
      status = "ambiguous";
    }

    await audit.record({
      eventName: "work_item.updated",
      actor: input.actor,
      subjectType: "work_item",
      subjectId: classified.id,
      requestId: input.requestId,
      sourceMemoId: classified.sourceMemoId,
      workItemId: classified.id,
      metadata: {
        updateSource: "classify_item",
        hookId: input.hook.id,
        projectSuggestion,
        threshold,
        readyForPromotion: readiness.ready,
        blockers: readiness.blockers
      },
      redactionApplied: true
    });

    const classifierApproved = projectSuggestion !== null && projectSuggestion.confidence >= threshold;
    if (!readiness.ready || !classifierApproved) {
      return {
        workItem: classified,
        promoted: false,
        classification: { status, projectSuggestion, threshold },
        scheduledJobIds: []
      };
    }

    const action = this.runtime.executeAction(
      input.activeWorkflowBundle,
      classified.workflowState,
      PROMOTE_REVIEW_MEMO_ACTION_ID
    );
    if (action === null) {
      return {
        workItem: classified,
        promoted: false,
        classification: { status: "action_unavailable", projectSuggestion, threshold },
        scheduledJobIds: []
      };
    }

    const promoted = await workItems.updateWorkflowState({
      workItemId: classified.id,
      expectedVersion: classified.workflowItemVersion,
      nextState: action.newState,
      actorUserId: input.actor?.id ?? null
    });
    if (promoted === null) {
      return {
        workItem: classified,
        promoted: false,
        classification: { status, projectSuggestion, threshold },
        scheduledJobIds: []
      };
    }

    await audit.record({
      eventName: "work_item.workflow_action_executed",
      actor: input.actor,
      subjectType: "work_item",
      subjectId: promoted.id,
      requestId: input.requestId,
      sourceMemoId: promoted.sourceMemoId,
      workItemId: promoted.id,
      metadata: {
        workflowId: input.workflowId,
        workflowVersion: input.workflowVersion,
        actionId: action.actionId,
        previousState: action.previousState,
        newState: action.newState,
        newVersion: promoted.workflowItemVersion,
        hookId: input.hook.id,
        handlerKey: input.hook.handlerKey,
        projectSuggestion,
        threshold
      },
      redactionApplied: true
    });

    const scheduledJobIds = await new WorkflowHookScheduler(this.client).scheduleStateResidentHooksForWorkItem({
      workItem: promoted,
      actorUserId: input.actor?.id ?? null
    });

    return {
      workItem: promoted,
      promoted: true,
      classification: { status: "promoted", projectSuggestion, threshold },
      scheduledJobIds
    };
  }
}

export function findSingleActiveProjectMatch(input: {
  title: string;
  body: string;
  sourceText: string;
  projects: ProjectRecord[];
}): ClassificationResult["projectSuggestion"] {
  const text = [input.title, input.body, input.sourceText].join("\n").toLowerCase();
  const matches = input.projects
    .filter((project) => project.isActive)
    .map((project) => ({
      project,
      occurrences: countOccurrences(text, project.name.toLowerCase())
    }))
    .filter((entry) => entry.occurrences > 0);

  if (matches.length !== 1) {
    return null;
  }

  const match = matches[0];
  if (match === undefined) {
    return null;
  }
  return {
    projectId: match.project.id,
    projectName: match.project.name,
    confidence: Number(Math.min(0.95, 0.55 + match.occurrences * 0.1).toFixed(2))
  };
}

function countActiveProjectMatches(text: string, projects: ProjectRecord[]): number {
  const normalized = text.toLowerCase();
  return projects.filter((project) => project.isActive && countOccurrences(normalized, project.name.toLowerCase()) > 0)
    .length;
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

function promotionReadiness(workItem: WorkItemRecord): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (workItem.projectId === null) {
    blockers.push("project_required");
  }
  if (workItem.title.trim() === "") {
    blockers.push("title_required");
  }
  if (workItem.body.trim() === "") {
    blockers.push("body_required");
  }
  if (workItem.sourceMemoId.trim() === "") {
    blockers.push("source_memo_required");
  }
  return { ready: blockers.length === 0, blockers };
}

function actorFromId(actorUserId: string): AppUserRecord {
  return {
    id: actorUserId,
    oidcIssuer: "system",
    oidcSubject: actorUserId,
    email: null,
    displayName: null,
    firstSeenAt: new Date(0).toISOString(),
    lastSeenAt: new Date(0).toISOString(),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  };
}

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}
