export const MEMO_CAPTURE_EXPORT_SCHEMA_VERSION = "memo-capture-export.v1" as const;

export const ACTIVE_TEXT_FILE_EXTENSIONS = [".txt", ".md", ".markdown"] as const;
export const ACTIVE_AUDIO_FILE_EXTENSIONS = [".m4a", ".mp3", ".wav"] as const;

export const BODY_FORMATS = ["markdown"] as const;

export type BodyFormat = (typeof BODY_FORMATS)[number];

export const SOURCE_MEMO_TYPES = [
  "form",
  "watched_text_file",
  "watched_audio_file",
  "ai_generated"
] as const;

export type SourceMemoType = (typeof SOURCE_MEMO_TYPES)[number];

export const ARTIFACT_KINDS = [
  "original_text_file",
  "original_audio_file",
  "derived_transcript",
  "export_manifest",
  "export_jsonl",
  "export_markdown_combined",
  "export_markdown_item",
  "export_bundle"
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const SOURCE_MEMO_ARTIFACT_RELATIONSHIPS = [
  "primary_original",
  "derived_transcript",
  "export_source_reference"
] as const;

export type SourceMemoArtifactRelationship =
  (typeof SOURCE_MEMO_ARTIFACT_RELATIONSHIPS)[number];

export const WORK_ITEM_STATES = [
  "needs_review",
  "memo",
  "parked",
  "accepted",
  "rejected",
  "ignored",
  "failed"
] as const;

export type WorkItemState = (typeof WORK_ITEM_STATES)[number];

export const INGESTION_REVIEW_WORK_ITEM_STATE =
  "needs_review" as const satisfies WorkItemState;
export const DEFAULT_MEMO_WORK_ITEM_STATE = "memo" as const satisfies WorkItemState;
export const ACCEPTED_WORK_ITEM_STATE = "accepted" as const satisfies WorkItemState;

export const INITIAL_WORK_ITEM_STATES = [
  INGESTION_REVIEW_WORK_ITEM_STATE,
  DEFAULT_MEMO_WORK_ITEM_STATE
] as const satisfies readonly WorkItemState[];

export const ACTIVE_WORK_ITEM_STATES = WORK_ITEM_STATES satisfies readonly WorkItemState[];

export const TERMINAL_WORK_ITEM_STATES = [] as const satisfies readonly WorkItemState[];

export const SUPPORTED_WORKFLOW_HOOK_HANDLERS = [
  "create_accepted_snapshot",
  "classify_item",
  "nominate_tags"
] as const;

export type SupportedWorkflowHookHandler = (typeof SUPPORTED_WORKFLOW_HOOK_HANDLERS)[number];

export const SUPPORTED_WORKFLOW_APP_CAPABILITIES = [
  "memo-capture.workflow-hooks.create_accepted_snapshot.v1",
  "memo-capture.workflow-hooks.classify_item.v1",
  "memo-capture.workflow-hooks.nominate_tags.v1"
] as const;

export type SupportedWorkflowAppCapability =
  (typeof SUPPORTED_WORKFLOW_APP_CAPABILITIES)[number];

export const IMPORT_EVENT_STATUSES = [
  "staged",
  "uploaded",
  "imported",
  "duplicate_exact",
  "failed_recoverable",
  "failed_terminal",
  "archived_with_warning"
] as const;

export type ImportEventStatus = (typeof IMPORT_EVENT_STATUSES)[number];

export const POSSIBLE_DUPLICATE_STATUSES = [
  "open",
  "confirmed_duplicate",
  "dismissed"
] as const;

export type PossibleDuplicateStatus = (typeof POSSIBLE_DUPLICATE_STATUSES)[number];

export const PROCESSING_JOB_KINDS = [
  "transcribe_audio",
  "extract_memo_metadata",
  "generate_keywords",
  "nominate_tags",
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

export const FILE_TYPE_CAPABILITY_STATES = [
  "active",
  "inactive",
  "not_supported_yet"
] as const;

export type FileTypeCapabilityState = (typeof FILE_TYPE_CAPABILITY_STATES)[number];

export const PROVIDER_KINDS = ["llm", "transcription"] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const PROVIDER_HEALTH_STATUSES = [
  "unknown",
  "healthy",
  "degraded",
  "unhealthy"
] as const;

export type ProviderHealthStatus = (typeof PROVIDER_HEALTH_STATUSES)[number];

export const AI_SUGGESTION_STATUSES = ["pending", "applied", "dismissed"] as const;

export type AiSuggestionStatus = (typeof AI_SUGGESTION_STATUSES)[number];

export const WORKFLOW_STAGED_IMPORT_STATUSES = [
  "staged",
  "activated",
  "discarded",
  "invalid"
] as const;

export type WorkflowStagedImportStatus = (typeof WORKFLOW_STAGED_IMPORT_STATUSES)[number];

export const EXPORT_BATCH_STATUSES = [
  "pending",
  "generating",
  "succeeded",
  "failed",
  "cancelled"
] as const;

export type ExportBatchStatus = (typeof EXPORT_BATCH_STATUSES)[number];

export const AUDIT_EVENT_NAMES = [
  "source_memo.created",
  "source_memo.archive_result_recorded",
  "work_item.created",
  "work_item.updated",
  "project.created",
  "project.updated",
  "project.deactivated",
  "project.deleted",
  "contributor.created",
  "contributor.updated",
  "contributor.alias_added",
  "contributor.merged",
  "contributor.deactivated",
  "file_type_setting.updated",
  "extraction_settings.updated",
  "transcription_settings.updated",
  "provider_config.updated",
  "prompt_version.created",
  "prompt_definition.activated_version",
  "export_template.created",
  "export_template.updated",
  "workflow.imported",
  "workflow.import_failed",
  "workflow.activated",
  "workflow.activation_blocked",
  "workflow.staged_import_discarded",
  "work_item.workflow_action_executed",
  "work_item.workflow_action_rejected",
  "processing_job.retry_requested",
  "processing_job.cancel_requested",
  "processing_job.failed",
  "processing_job.exhausted",
  "export_batch.created",
  "export_batch.generation_succeeded",
  "export_batch.generation_failed",
  "export_batch.downloaded",
  "ai_expansion.requested",
  "ai_expansion.validation_failed",
  "ai_suggestion.created",
  "ai_suggestion.applied",
  "ai_suggestion.dismissed"
] as const;

export type AuditEventName = (typeof AUDIT_EVENT_NAMES)[number];

export interface SourceMemo {
  id: string;
  sourceType: SourceMemoType;
  primaryArtifactId: string | null;
  contentHash: string | null;
  originalText: string | null;
  extractedText: string | null;
  currentTranscriptText: string | null;
  originalPath: string | null;
  archivePath: string | null;
  originalFileModifiedAt: string | null;
  contributorText: string | null;
  contributorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItem {
  id: string;
  sourceMemoId: string;
  projectId: string | null;
  contributorText: string | null;
  contributorId: string | null;
  title: string;
  body: string;
  tags: string[];
  bodyFormat: BodyFormat;
  workflowState: WorkItemState;
  workflowItemVersion: number;
  acceptedSnapshotId: string | null;
  acceptedUnexportedChanges: boolean;
  originalFileModifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptedSnapshot {
  id: string;
  workItemId: string;
  snapshotNumber: number;
  title: string;
  body: string;
  bodyFormat: BodyFormat;
  projectId: string;
  projectSlug: string;
  projectName: string;
  contributorText: string | null;
  contributorId: string | null;
  sourceMemoId: string;
  sourceContentHash: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AllowedWorkflowAction {
  id: string;
  label: string;
  visible: boolean;
  trigger: "user" | "automatic";
  requiresInput: boolean;
  confirmationRequired: boolean;
}

export interface WorkflowBucket {
  id: string;
  label: string;
  order: number;
  states: string[];
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
