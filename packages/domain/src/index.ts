export const MEMO_CAPTURE_EXPORT_SCHEMA_VERSION = "memo-capture-export.v1" as const;

export const ACTIVE_TEXT_FILE_EXTENSIONS = [".txt", ".md", ".markdown"] as const;
export const ACTIVE_AUDIO_FILE_EXTENSIONS = [".m4a", ".mp3", ".wav"] as const;

export const WORK_ITEM_STATES = [
  "needs_ingestion_review",
  "new_idea",
  "parked",
  "accepted",
  "rejected",
  "ignored",
  "failed"
] as const;

export type WorkItemState = (typeof WORK_ITEM_STATES)[number];

export const ACTIVE_WORK_ITEM_STATES = [
  "needs_ingestion_review",
  "new_idea",
  "parked",
  "accepted"
] as const satisfies readonly WorkItemState[];

export const TERMINAL_WORK_ITEM_STATES = [
  "rejected",
  "ignored",
  "failed"
] as const satisfies readonly WorkItemState[];

export const REQUIRED_BUCKET_ROLES = [
  "ingestion_review",
  "new_ideas",
  "accepted",
  "closed"
] as const;

export type RequiredBucketRole = (typeof REQUIRED_BUCKET_ROLES)[number];

export const PROCESSING_JOB_KINDS = [
  "transcribe_audio",
  "extract_memo_metadata",
  "generate_keywords",
  "expand_work_item",
  "generate_export_batch"
] as const;

export type ProcessingJobKind = (typeof PROCESSING_JOB_KINDS)[number];

export const PROCESSING_JOB_STATUSES = [
  "queued",
  "claimed",
  "running",
  "succeeded",
  "retry_scheduled",
  "failed",
  "exhausted",
  "cancelled"
] as const;

export type ProcessingJobStatus = (typeof PROCESSING_JOB_STATUSES)[number];

export interface SourceMemo {
  id: string;
  sourceType: "form" | "watched_text_file" | "watched_audio_file" | "ai_generated";
  artifactId: string | null;
  contentHash: string | null;
  extractedText: string | null;
  createdAt: string;
}

export interface WorkItem {
  id: string;
  sourceMemoId: string;
  projectId: string | null;
  featureGroupId: string | null;
  title: string;
  body: string;
  workflowState: WorkItemState;
  createdAt: string;
  updatedAt: string;
}

export interface AllowedWorkflowAction {
  id: string;
  label: string;
  visible: boolean;
  trigger: "user" | "automatic";
}

export interface HealthPayload {
  ok: true;
  service: string;
  version: string;
  commitSha: string;
  timestamp: string;
}

export function isTerminalWorkItemState(state: WorkItemState): boolean {
  return (TERMINAL_WORK_ITEM_STATES as readonly WorkItemState[]).includes(state);
}

export function isActiveWorkItemState(state: WorkItemState): boolean {
  return (ACTIVE_WORK_ITEM_STATES as readonly WorkItemState[]).includes(state);
}
