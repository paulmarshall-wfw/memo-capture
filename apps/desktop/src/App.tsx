import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkflowDebugger } from "@state-workflow/debugger-react";
import type {
  ItemRef,
  RuntimeDebuggerSnapshot,
  WorkflowDebuggerController,
  WorkflowEventJournalRecord,
  WorkflowEventViews,
  WorkflowRuntime
} from "state-workflow-runtime";
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Copy,
  Download,
  FileText,
  FolderInput,
  FolderOpen,
  FolderSearch,
  Headphones,
  Minus,
  Moon,
  PackageCheck,
  PackagePlus,
  Image,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Settings,
  Sun,
  Trash2,
  X
} from "lucide-react";
import { MEMO_CAPTURE_EXPORT_SCHEMA_VERSION } from "@memo-capture/domain";

type LoadState = "loading" | "ready" | "error";
type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
type ActiveView = "work-items" | "projects" | "exports" | "settings" | "audit";
type ThemeMode = "light" | "dark";
type WorkQueueSyncState = "idle" | "syncing" | "connected" | "error";
type WorkflowRuntimeEventFilter = "journal" | keyof WorkflowEventViews;
type SettingsSectionId =
  | "watched"
  | "file-types"
  | "suppressed-tags"
  | "providers"
  | "processing-hooks"
  | "tasks"
  | "export"
  | "operations"
  | "diagnostics";
type FileTypeCapabilityState = "active" | "inactive" | "not_supported_yet";
type TaskRenderLocation = "work_item_detail" | "work_item_list" | "export_page";
type WorkflowActionIntent = "primary" | "secondary" | "warning" | "danger";

interface SessionResponse {
  accessToken?: string;
  user: {
    email: string | null;
    displayName: string | null;
  };
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: {
      currentVersion?: number;
      workItem?: WorkItem;
    };
  };
}

interface WorkflowBucket {
  id: string;
  label: string;
  order: number;
  states: string[];
  count?: number;
}

interface WorkflowStatus {
  active: {
    workflowId: string;
    workflowVersion: string;
    stateMachineVersion: string;
    contentHash: string;
    activatedAt: string;
  } | null;
  supportedHookHandlers: string[];
}

interface WorkflowImportResult {
  stagedImportId: string;
  status: "staged" | "invalid";
  validation: {
    ok: boolean;
    warnings: string[];
    errors: string[];
  };
  identity: {
    workflowId: string;
    workflowVersion: string;
    stateMachineVersion: string;
    contentHash: string;
  } | null;
}

interface WorkItem {
  id: string;
  sourceMemoId: string;
  projectId: string | null;
  contributorText: string | null;
  contributorId: string | null;
  title: string;
  body: string;
  tags: string[];
  tagsAvailable: boolean;
  bodyFormat: string;
  workflowState: string;
  workflowItemVersion: number;
  acceptedSnapshotId: string | null;
  acceptedUnexportedChanges: boolean;
  photoAttachmentCount: number;
  originalFileModifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkItemPhotoAttachment {
  originalArtifactId: string;
  thumbnailArtifactId: string | null;
  originalFilename: string | null;
  mimeType: string;
  byteSize: number;
  capturedAt: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
}

interface WorkItemPhotoAttachmentView extends WorkItemPhotoAttachment {
  objectUrl: string;
}

interface PhotoImport {
  id: string;
  sourceMemoId: string;
  originalArtifactId: string;
  thumbnailArtifactId: string | null;
  status: "available" | "preprocessing" | "preprocessing_failed" | "attached";
  originalFilename: string;
  contributorText: string | null;
  capturedAt: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  preprocessingErrorMessage: string | null;
  createdAt: string;
}

interface PhotoMemoDraft {
  projectId: string;
  title: string;
  body: string;
  tags: string;
}

interface WorkItemDiagnostics {
  workItemId: string;
  sourceMemo: {
    id: string;
    sourceType: string;
    currentTranscriptText: string | null;
  } | null;
  artifacts: ArtifactDiagnostic[];
  jobs: ProcessingJobDiagnostic[];
  archiveWarnings: Record<string, unknown>[];
}

interface ArtifactDiagnostic {
  id: string;
  artifactKind: string;
  originalFilename: string | null;
  mimeType: string;
  byteSize: number;
  relationship: string;
}

interface ProcessingJobDiagnostic {
  id: string;
  jobKind: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  errorCode: string | null;
  userSafeErrorMessage: string | null;
  providerName: string | null;
  modelName: string | null;
}

interface Project {
  id: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  updatedAt: string;
}

interface ProjectFormState {
  name: string;
  description: string;
}

interface NewProjectDraft {
  id: string;
  form: ProjectFormState;
}

interface Contributor {
  id: string;
  displayName: string;
  isActive: boolean;
}

interface AllowedWorkflowAction {
  id: string;
  label: string;
  visible: boolean;
  requiresInput: boolean;
  confirmationRequired: boolean;
}

interface PendingWorkflowAction {
  action: AllowedWorkflowAction;
  targetItem: WorkItem;
  intent: WorkflowActionIntent;
}

interface DraftState {
  title: string;
  body: string;
  projectId: string;
  contributorId: string;
  contributorText: string;
  tags: string[];
  tagInput: string;
}

interface TagSuggestionRows {
  strong: string[];
  related: string[];
  weak: string[];
}

interface TagSuggestionResponse {
  workItemId: string;
  suggestions: TagSuggestionRows;
}

interface SuppressedTag {
  normalizedName: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

interface ExportableSnapshot {
  acceptedSnapshotId: string;
  workItemId: string;
  title: string;
  project: {
    id: string;
    slug: string;
    name: string;
  };
  contributor: {
    id: string | null;
    text: string;
  } | null;
  alreadyExported: boolean;
  defaultChecked: boolean;
  currentForWorkItem: boolean;
  snapshotCreatedAt: string;
}

interface ExportBatch {
  id: string;
  schemaVersion: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  bundleArtifactId: string | null;
  itemCount: number;
}

interface WatchedFolderSetting {
  id: string;
  path: string;
  archivePath: string;
  contributorName: string;
  recursive: boolean;
  enabled: boolean;
  stabilityMs: number;
}

interface WatchedFileCandidate {
  watchFolderId: string;
  path: string;
  filename: string;
  extension: string;
  byteSize: number;
  createdAt: string;
  modifiedAt: string;
}

type ImportCandidateState = "idle" | "importing" | "imported" | "duplicate" | "error";

interface ImportCandidateStatus {
  state: ImportCandidateState;
  message: string | null;
}

interface ImportCandidateResult {
  state: Exclude<ImportCandidateState, "idle" | "importing">;
  filename: string;
  message: string | null;
}

interface UploadSessionResponse {
  sessionId: string;
  status: "upload_required" | "duplicate_exact";
  importEventId?: string;
  duplicateOfSourceMemoId?: string;
  upload?: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
  };
}

interface FinalizeUploadSessionResponse {
  sourceMemoId: string;
  workItemId: string | null;
  artifactId: string;
  importEventId: string;
  initialWorkflowState: string | null;
  processingJobs: string[];
}

interface ExpandedMemoCandidate {
  title: string;
  body: string;
  tags: string[];
  providerName: string;
  modelName: string;
  taskDisplayName: string;
}

interface SuggestedWorkItemCandidate {
  id: string;
  parentWorkItemId: string;
  taskDefinitionId: string;
  taskRunId: string;
  title: string;
  body: string;
  tags: string[];
  rationale: string;
  providerName: string;
  modelName: string;
}

interface MediaTypeSetting {
  id: string;
  mediaKey: string;
  displayName: string;
  description: string | null;
  capabilityState: FileTypeCapabilityState;
  updatedAt: string;
}

interface ParserTypeSetting {
  id: string;
  parserKey: string;
  displayName: string;
  description: string | null;
  mediaKey: string;
  capabilityState: FileTypeCapabilityState;
  updatedAt: string;
}

interface FileTypeSetting {
  id: string;
  extension: string;
  mediaKind: string;
  capabilityState: FileTypeCapabilityState;
  parserKey: string | null;
  updatedAt: string;
}

interface MediaTypeDraft {
  mediaKey: string;
  displayName: string;
  description: string;
  capabilityState: FileTypeCapabilityState;
}

interface ParserTypeDraft {
  parserKey: string;
  displayName: string;
  description: string;
  mediaKey: string;
  capabilityState: FileTypeCapabilityState;
}

interface FileTypeDraft {
  mediaKind: string;
  parserKey: string;
  capabilityState: FileTypeCapabilityState;
}

interface AiTaskRouteDraft {
  displayName: string;
  description: string;
  hookKey: string;
  renderLocation: TaskRenderLocation;
  displayOrder: number;
  providerConfigId: string;
  modelName: string;
  promptsEnabled: boolean;
  enabled: boolean;
}

interface NewAiTaskDraft {
  displayName: string;
  description: string;
  hookKey: string;
  renderLocation: TaskRenderLocation;
  displayOrder: number;
  providerConfigId: string;
  modelName: string;
  promptsEnabled: boolean;
  promptDraft: PromptDraft;
  enabled: boolean;
}

interface PromptSummary {
  id: string;
  name: string;
  purpose: string;
  activeVersion: number;
  activePromptVersionId: string | null;
  body: string | null;
  outputSchema: Record<string, unknown> | null;
  contextConfig: PromptContextConfig;
  retentionPolicy: string;
  updatedAt: string;
}

interface NewFileTypeDraft {
  extension: string;
  mediaKind: string;
  parserKey: string;
  capabilityState: FileTypeCapabilityState;
}

interface SettingsSummary {
  mediaTypes: MediaTypeSetting[];
  parserTypes: ParserTypeSetting[];
  fileTypes: FileTypeSetting[];
  extraction: {
    projectConfidenceThreshold: number;
    contributorConfidenceThreshold: number;
    tagConfidenceThreshold: number;
    updatedAt: string;
  } | null;
  transcription: {
    maxRetryAttempts: number;
    runtimeProvider: string;
    runtimeModelName: string;
    updatedAt: string;
  } | null;
  providers: {
    id: string;
    providerKind: string;
    providerName: string;
    displayName?: string;
    adapterKey?: string;
    enabled: boolean;
    endpoint?: string | null;
    endpointConfigured: boolean;
    modelName: string | null;
    secretSource: string;
    requiredSecretEnv?: string | null;
    externalSendEnabled?: boolean;
    secretConfigured: boolean;
    healthStatus: string;
    runtimeProvider: string;
    runtimeModelName: string;
    runtimeProviderEnv?: string | null;
    runtimeModelEnv?: string | null;
    runtimeEndpointEnv?: string | null;
    capabilities?: { capabilityKey: string; enabled: boolean }[];
    runtimeConfiguration: {
      mode: string;
      binaryPath: string;
      modelPathConfigured: boolean;
      ffmpegPath: string;
      language: string;
      threads: number;
      timeoutMs: number;
    } | null;
    updatedAt: string;
  }[];
  providerCatalog?: {
    registry: {
      url: string;
      profile: string;
      configured: boolean;
      reachable: boolean;
      error: string | null;
    };
    fallbackUsed: boolean;
    providers: Array<{
      providerKey: string;
      displayName: string;
      enabled: boolean;
      adapterKey: string;
      model?: string;
      externalSend: boolean;
      requiredSecretRef?: string;
      capabilities: Array<{ key: string; displayName: string }>;
      health?: { status: string; checkedAt?: string };
    }>;
  };
  providerCapabilities: {
    id: string;
    providerConfigId: string;
    capabilityKey: string;
    enabled: boolean;
    updatedAt: string;
  }[];
  taskKinds: {
    id: string;
    kindKey: string;
    displayName: string;
    description: string | null;
    providerKind: string;
    capabilityKey: string;
    promptFieldsEnabled: boolean;
    enabled: boolean;
    active: boolean;
    updatedAt: string;
  }[];
  aiTasks: {
    id: string;
    taskKey: string;
    displayName: string;
    description: string | null;
    hookKey: string;
    renderLocation: TaskRenderLocation;
    displayOrder: number;
    taskKind: string;
    taskKindId: string | null;
    taskKindDisplayName: string;
    taskKindProviderKind: string;
    taskKindCapabilityKey: string | null;
    promptFieldsEnabled: boolean;
    hookImplemented: boolean;
    routeEnabled: boolean;
    runtimeOptionId: string;
    runtimeOptionPurpose: string;
    runtimeProviderEnv: string;
    runtimeModelEnv: string;
    runtimeEndpointEnv: string | null;
    selectedProviderId: string | null;
    registryProfileKey?: string | null;
    registryProviderKey?: string | null;
    selectedProviderName: string | null;
    selectedProviderDisplayName: string | null;
    selectedModelName: string | null;
    providerModelOverride?: string | null;
    providerAdapterKey: string | null;
    providerExternalSendEnabled: boolean;
    providerSecretEnv: string | null;
    runtimeProvider: string;
    runtimeModelName: string;
    runtimeEndpointConfigured: boolean;
    runtimeReady: boolean;
    unavailableReason: string | null;
    readinessReasons?: Array<{ code?: string; message: string }>;
    prompt: PromptSummary | null;
    updatedAt: string;
  }[];
  appLauncher: {
    manifestVersion: string;
    minLauncherVersion: string;
    runtimeOptionsPresent: boolean;
    nativeLaunchTarget: string;
    secretEnvironmentNames: string[];
    llmRuntime?: {
      provider: string;
      modelName: string;
      endpointConfigured: boolean;
      ready: boolean;
    };
    restartRequiredAfterChange: boolean;
  } | null;
  invokeProviders?: {
    registry: {
      url: string;
      profile: string;
      configured: boolean;
      reachable: boolean;
      error: string | null;
    };
    profile: string;
    commitSha: string;
    diagnostics?: {
      readyTaskCount: number;
      blockedTaskCount: number;
    };
  };
  registeredTaskHooks: {
    hookKey: string;
    displayName: string;
    implemented: boolean;
    status: string;
    statusLabel: string;
    taskUsageCount: number;
    deletable: boolean;
    deleteBlockedReason: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  prompts: PromptSummary[];
  auth: {
    mode: string;
    oidcConfigured: boolean;
  };
}

interface PromptContextConfig {
  freeformText: string;
  systemMessage: string;
  includeProjectSynopsis: boolean;
  includeMemoMetadata: boolean;
  includeMemoTranscriptText: boolean;
}

interface PromptDraft {
  freeformText: string;
  systemMessage: string;
  includeProjectSynopsis: boolean;
  includeMemoMetadata: boolean;
  includeMemoTranscriptText: boolean;
}

const defaultSystemMessage =
  'Return only strict JSON matching this shape: { "expanded_work_item": { "title": "string", "body": "string", "tags": ["string"] } }. Do not include prose outside JSON.';

const defaultSystemMessagesByHook: Record<string, string> = {
  "memo-expansion": defaultSystemMessage,
  "suggest-new-memos":
    'Return only strict JSON matching this shape: { "suggested_work_items": [{ "title": "string", "body": "string", "tags": ["string"], "rationale": "string" }] }. Do not include prose outside JSON.'
};

const defaultPromptContextConfig: PromptContextConfig = {
  freeformText: "",
  systemMessage: defaultSystemMessage,
  includeProjectSynopsis: true,
  includeMemoMetadata: true,
  includeMemoTranscriptText: true
};

function defaultSystemMessageForHook(hookKey: string): string {
  return defaultSystemMessagesByHook[hookKey] ?? defaultSystemMessage;
}

interface AuditEvent {
  id: string;
  eventName: string;
  actorUserId: string | null;
  actorEmailSnapshot: string | null;
  subjectType: string;
  subjectId: string | null;
  requestId: string | null;
  sourceMemoId: string | null;
  workItemId: string | null;
  jobId: string | null;
  metadata: Record<string, unknown>;
  redactionApplied: boolean;
  createdAt: string;
  display?: {
    title: string | null;
    originalFilename: string | null;
    originalPath: string | null;
    projectName: string | null;
  };
}

interface WorkflowEventJournalRecordResponse
  extends Omit<WorkflowEventJournalRecord, "occurredAt"> {
  occurredAt: string;
}

interface RuntimeDebuggerSnapshotResponse
  extends Omit<RuntimeDebuggerSnapshot, "currentStep" | "events" | "views"> {
  currentStep?: WorkflowEventJournalRecordResponse;
  events: WorkflowEventJournalRecordResponse[];
}

const workflowRuntimeEventFilters: readonly { id: WorkflowRuntimeEventFilter; label: string }[] = [
  { id: "journal", label: "All" },
  { id: "debugSteps", label: "Checkpoints" },
  { id: "actions", label: "Actions" },
  { id: "transitions", label: "Transitions" },
  { id: "handlers", label: "Handlers" },
  { id: "handlerResponses", label: "Handler responses" },
  { id: "recordEvents", label: "Record events" },
  { id: "stateHooks", label: "State hooks" },
  { id: "failures", label: "Failures" }
];

const settingsSections: readonly { id: SettingsSectionId; label: string }[] = [
  { id: "watched", label: "Watched folders" },
  { id: "file-types", label: "File types" },
  { id: "suppressed-tags", label: "Suppressed Tags" },
  { id: "providers", label: "Providers" },
  { id: "processing-hooks", label: "Processing Hooks" },
  { id: "tasks", label: "Tasks" },
  { id: "export", label: "Export contract" },
  { id: "operations", label: "Operations" },
  { id: "diagnostics", label: "Diagnostics" }
];
const taskRenderLocationOptions: { value: TaskRenderLocation; label: string }[] = [
  { value: "work_item_detail", label: "Work item detail" },
  { value: "work_item_list", label: "Work item list" },
  { value: "export_page", label: "Export page" }
];

class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody
  ) {
    super(body.error?.message ?? `Request failed with status ${status}`);
  }
}

const apiBaseUrl = (import.meta.env.VITE_MEMO_CAPTURE_API_URL ?? "http://127.0.0.1:4788").replace(
  /\/$/,
  ""
);
const appVersion = "1.0.0";
const photosBucketId = "photos";
const watchedSettingsStorageKey = "memo-capture.watched-text-folders.v1";
const watchedFolderPollingIntervalMs = 5000;
const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const defaultNewFileTypeDraft: NewFileTypeDraft = {
  extension: "",
  mediaKind: "text",
  parserKey: "",
  capabilityState: "inactive"
};
const defaultNewAiTaskDraft: NewAiTaskDraft = {
  displayName: "",
  description: "",
  hookKey: "",
  renderLocation: "work_item_detail",
  displayOrder: 0,
  providerConfigId: "",
  modelName: "",
  promptsEnabled: false,
  promptDraft: {
    freeformText: "",
    systemMessage: defaultSystemMessage,
    includeProjectSynopsis: true,
    includeMemoMetadata: true,
    includeMemoTranscriptText: true
  },
  enabled: false
};
const defaultNewMediaTypeDraft: MediaTypeDraft = {
  mediaKey: "",
  displayName: "",
  description: "",
  capabilityState: "not_supported_yet"
};
const defaultNewParserTypeDraft: ParserTypeDraft = {
  parserKey: "",
  displayName: "",
  description: "",
  mediaKey: "text",
  capabilityState: "not_supported_yet"
};
const defaultPhotoMemoDraft: PhotoMemoDraft = {
  projectId: "",
  title: "",
  body: "",
  tags: ""
};
const defaultExtractionSettings = {
  projectConfidenceThreshold: 0.65,
  contributorConfidenceThreshold: 0.7,
  tagConfidenceThreshold: 0.7,
  updatedAt: new Date(0).toISOString()
};
const primaryNavigation: { id: ActiveView; label: string }[] = [
  { id: "work-items", label: "Work queue" },
  { id: "projects", label: "Projects" },
  { id: "exports", label: "Exports" },
  { id: "settings", label: "Settings" },
  { id: "audit", label: "Audit" }
];

function createDraft(item: WorkItem): DraftState {
  return {
    title: item.title,
    body: item.body,
    projectId: item.projectId ?? "",
    contributorId: item.contributorId ?? "",
    contributorText: item.contributorText ?? "",
    tags: normalizeTagList(item.tags),
    tagInput: ""
  };
}

function parseTagsText(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of value.split(",")) {
    const cleaned = tag.trim().replace(/\s+/g, " ");
    const key = cleaned.toLowerCase();
    if (cleaned === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(cleaned);
  }
  return tags;
}

function normalizeTagList(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const cleaned = tag.trim().replace(/\s+/g, " ");
    const key = cleaned.toLowerCase();
    if (cleaned === "" || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(cleaned);
  }
  return normalized.slice(0, 20);
}

function normalizeTagsForCompare(tags: string[]): string {
  return normalizeTagList(tags)
    .map((tag) => tag.toLowerCase())
    .sort()
    .join("|");
}

function retainAvailablePhotoSelections(current: Set<string>, photoImports: PhotoImport[]): Set<string> {
  const availableIds = new Set(
    photoImports.filter((photoImport) => photoImport.status === "available").map((photoImport) => photoImport.id)
  );
  return new Set([...current].filter((photoImportId) => availableIds.has(photoImportId)));
}

function createEmptyProjectForm(): ProjectFormState {
  return {
    name: "",
    description: ""
  };
}

function createProjectForm(project: Project): ProjectFormState {
  return {
    name: project.name,
    description: project.description
  };
}

function createMemoCaptureWorkflowDebuggerRuntime(token: string | null): WorkflowRuntime {
  const unsupportedRuntimeMethod = async (): Promise<never> => {
    throw new Error("Memo Capture exposes workflow debugger events here; lifecycle mutation remains backend-owned.");
  };
  const unsupportedRegistration = (): never => {
    throw new Error("Memo Capture registers workflow behavior on the backend.");
  };

  return {
    importDefinitionBundle: unsupportedRuntimeMethod,
    listDefinitionVersions: unsupportedRuntimeMethod,
    setActiveDefinitionVersion: unsupportedRuntimeMethod,
    getActiveDefinitionVersion: unsupportedRuntimeMethod,
    getItemWorkflowState: unsupportedRuntimeMethod,
    getAllowedActions: unsupportedRuntimeMethod,
    initializeItemWorkflowState: unsupportedRuntimeMethod,
    executeAction: unsupportedRuntimeMethod,
    registerPermissionGuard: unsupportedRegistration,
    registerHandler: unsupportedRegistration,
    registerMigration: unsupportedRegistration,
    lifecycle: {
      evaluateDueStateHooks: unsupportedRuntimeMethod
    },
    debugger: {
      start: async (options) => {
        await postWorkflowDebuggerCommand(token, "start", { stepMode: options?.stepMode ?? false });
      },
      pause: async (operationId) => {
        await postWorkflowDebuggerCommand(token, "pause", debuggerOperationBody(operationId));
      },
      resume: async (operationId) => {
        await postWorkflowDebuggerCommand(token, "resume", debuggerOperationBody(operationId));
      },
      stop: async (operationId) => {
        await postWorkflowDebuggerCommand(token, "stop", debuggerOperationBody(operationId));
      },
      step: async (operationId) => {
        await postWorkflowDebuggerCommand(token, "step", debuggerOperationBody(operationId));
      },
      getSnapshot: async (itemRef) => fetchWorkflowDebuggerSnapshot(token, itemRef),
      subscribe: () => () => undefined
    }
  };
}

function debuggerOperationBody(operationId: string | undefined): { operationId?: string } {
  return operationId === undefined ? {} : { operationId };
}

async function postWorkflowDebuggerCommand(
  token: string | null,
  command: "start" | "pause" | "resume" | "step" | "stop",
  body: { stepMode?: boolean; operationId?: string }
): Promise<void> {
  if (token === null) {
    throw new Error("Sign in before using the workflow debugger.");
  }
  await authedJson(token, `/api/workflow/debugger/${command}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

async function fetchWorkflowDebuggerSnapshot(
  token: string | null,
  itemRef?: ItemRef
): Promise<RuntimeDebuggerSnapshot> {
  if (token === null) {
    return {
      state: "stopped",
      stepMode: false,
      events: [],
      views: projectWorkflowEventViews([])
    };
  }
  const query =
    itemRef === undefined
      ? ""
      : `?resourceType=${encodeURIComponent(itemRef.resourceType)}&resourceId=${encodeURIComponent(
          itemRef.resourceId
        )}`;
  const snapshot = await authedJson<RuntimeDebuggerSnapshotResponse>(
    token,
    `/api/workflow/debugger/snapshot${query}`
  );
  const events = snapshot.events.map(normalizeWorkflowEvent);
  const currentStep =
    snapshot.currentStep === undefined ? undefined : normalizeWorkflowEvent(snapshot.currentStep);
  return {
    state: snapshot.state,
    stepMode: snapshot.stepMode,
    ...(currentStep === undefined ? {} : { currentStep }),
    events,
    views: projectWorkflowEventViews(events)
  };
}

function normalizeWorkflowEvent(event: WorkflowEventJournalRecordResponse): WorkflowEventJournalRecord {
  return {
    ...event,
    occurredAt: new Date(event.occurredAt)
  };
}

function projectAuditEventsToWorkflowEvents(auditEvents: AuditEvent[]): WorkflowEventJournalRecord[] {
  return [...auditEvents]
    .reverse()
    .map((event, index) => {
      const actionId = typeof event.metadata.actionId === "string" ? event.metadata.actionId : undefined;
      const transitionId =
        event.eventName === "work_item.workflow_action_executed" && event.subjectId !== null
          ? `${event.subjectId}:${event.metadata.previousState ?? "unknown"}:${event.metadata.newState ?? "unknown"}`
          : undefined;
      return {
        eventId: `audit:${event.id}`,
        sequence: index + 1,
        eventType: workflowEventTypeForAuditEvent(event),
        severity: workflowEventSeverityForAuditEvent(event),
        message: workflowEventMessageForAuditEvent(event),
        ...(event.workItemId === null
          ? {}
          : { itemRef: { resourceType: "work_item", resourceId: event.workItemId } }),
        ...(actionId === undefined ? {} : { actionId }),
        ...(transitionId === undefined ? {} : { transitionId }),
        ...(event.requestId === null ? {} : { operationId: event.requestId }),
        ...(event.actorUserId === null ? {} : { actorId: event.actorUserId }),
        metadata: {
          auditEventName: event.eventName,
          subjectType: event.subjectType,
          subjectId: event.subjectId,
          sourceMemoId: event.sourceMemoId,
          jobId: event.jobId,
          actorEmailSnapshot: event.actorEmailSnapshot,
          ...event.metadata
        },
        occurredAt: new Date(event.createdAt)
      };
    });
}

function workflowEventTypeForAuditEvent(event: AuditEvent): string {
  if (event.eventName === "work_item.workflow_action_executed") {
    return "transition_committed";
  }
  if (event.eventName === "work_item.workflow_action_rejected") {
    return "action_rejected";
  }
  if (event.eventName.includes("failed") || event.eventName.includes("blocked")) {
    return "handler_failed";
  }
  return event.eventName.replaceAll(".", "_");
}

function workflowEventSeverityForAuditEvent(event: AuditEvent): WorkflowEventJournalRecord["severity"] {
  if (event.eventName.includes("failed")) {
    return "error";
  }
  if (event.eventName.includes("rejected") || event.eventName.includes("blocked")) {
    return "warn";
  }
  return "info";
}

function workflowEventMessageForAuditEvent(event: AuditEvent): string {
  if (event.eventName === "work_item.workflow_action_executed") {
    return `Workflow action ${String(event.metadata.actionId ?? "unknown")} moved ${String(
      event.metadata.previousState ?? "unknown"
    )} to ${String(event.metadata.newState ?? "unknown")}.`;
  }
  return `${event.actorEmailSnapshot ?? "System"} recorded ${event.eventName} for ${event.subjectType}.`;
}

function projectWorkflowEventViews(events: readonly WorkflowEventJournalRecord[]): WorkflowEventViews {
  return {
    transitions: events.filter(
      (event) =>
        event.eventType === "transition_committed" ||
        event.eventType === "item_initiated" ||
        event.eventType === "item_initialized"
    ),
    actions: events.filter((event) => event.eventType.includes("action") || event.actionId !== undefined),
    handlers: events.filter((event) => event.eventType.startsWith("handler_")),
    handlerResponses: events.filter((event) => event.eventType === "handler_response_received"),
    recordEvents: events.filter((event) => event.eventType === "record_event" || event.eventType.includes("audit")),
    stateHooks: events.filter((event) => event.eventType.startsWith("state_hook_")),
    failures: events.filter(
      (event) =>
        event.severity === "error" || event.eventType.includes("failed") || event.eventType.includes("rejected")
    ),
    debugSteps: events.filter((event) => event.eventType.startsWith("debug_") || event.eventType === "runtime_step")
  };
}

function projectWorkflowRuntimeEvents(
  snapshot: RuntimeDebuggerSnapshot,
  filter: WorkflowRuntimeEventFilter
): WorkflowEventJournalRecord[] {
  const source = filter === "journal" ? snapshot.events : snapshot.views[filter];
  return source.filter((event) => !event.eventType.startsWith("debug_"));
}

interface AuditSummaryContext {
  workItemById: Map<string, WorkItem>;
  projectById: Map<string, Project>;
}

interface AuditEventSummary {
  label: string;
  details: string[];
  title: string;
}

function summarizeAuditEvent(event: AuditEvent, context: AuditSummaryContext): AuditEventSummary {
  const label = auditEventLabel(event);
  const details = uniqueCompact([
    auditEventPrimaryObject(event, context),
    auditEventProjectName(event, context),
    auditEventCountDetail(event)
  ]);

  return {
    label,
    details,
    title: [label, formatDate(event.createdAt), ...details].join(" | ")
  };
}

function auditEventLabel(event: AuditEvent): string {
  switch (event.eventName) {
    case "source_memo.created":
      return "Memo imported";
    case "source_memo.archive_result_recorded":
      return "Archive updated";
    case "work_item.created":
      return "Memo created";
    case "work_item.updated":
      return "Memo updated";
    case "work_item.workflow_action_executed":
      return typeof event.metadata.newState === "string"
        ? `Moved to ${humanizeWorkflowState(event.metadata.newState)}`
        : "Workflow action";
    case "work_item.workflow_action_rejected":
      return "Action unavailable";
    case "project.created":
      return "Project created";
    case "project.updated":
      return "Project updated";
    case "project.deactivated":
      return "Project deactivated";
    case "project.deleted":
      return "Project deleted";
    case "workflow.imported":
      return "Workflow imported";
    case "workflow.import_failed":
      return "Workflow import failed";
    case "workflow.activated":
      return "Workflow activated";
    case "workflow.activation_blocked":
      return "Workflow activation blocked";
    case "workflow.staged_import_discarded":
      return "Workflow import discarded";
    case "processing_job.retry_requested":
      return "Retry requested";
    case "processing_job.cancel_requested":
      return "Job cancelled";
    case "processing_job.failed":
      return "Job failed";
    case "processing_job.exhausted":
      return "Job exhausted";
    case "export_batch.created":
      return "Export created";
    case "export_batch.generation_succeeded":
      return "Export ready";
    case "export_batch.generation_failed":
      return "Export failed";
    case "export_batch.downloaded":
      return "Export downloaded";
    case "ai_expansion.requested":
      return "AI expansion requested";
    case "ai_expansion.validation_failed":
      return "AI output rejected";
    case "ai_suggestion.created":
      return "AI idea created";
    case "ai_suggestion.applied":
      return "AI idea applied";
    case "ai_suggestion.dismissed":
      return "AI idea rejected";
    case "provider_config.updated":
      return "Provider updated";
    case "prompt_version.created":
      return "Prompt created";
    case "prompt_definition.activated_version":
      return "Prompt activated";
    case "file_type_setting.updated":
      return "File type updated";
    case "extraction_settings.updated":
      return "Extraction settings updated";
    case "transcription_settings.updated":
      return "Transcription settings updated";
    default:
      return humanizeAuditEventName(event.eventName);
  }
}

function auditEventPrimaryObject(event: AuditEvent, context: AuditSummaryContext): string | null {
  const filename =
    trimDisplayValue(event.display?.originalFilename) ??
    basename(trimDisplayValue(event.display?.originalPath)) ??
    basename(readStringMetadata(event.metadata, "originalPath")) ??
    basename(readStringMetadata(event.metadata, "archivePath"));
  if (filename !== null) {
    return filename;
  }

  if (event.subjectType === "project") {
    return auditEventProjectName(event, context);
  }
  const title =
    trimDisplayValue(event.display?.title) ??
    auditEventWorkItem(event, context)?.title ??
    readStringMetadata(event.metadata, "title");
  return title;
}

function auditEventProjectName(event: AuditEvent, context: AuditSummaryContext): string | null {
  const displayName = trimDisplayValue(event.display?.projectName);
  if (displayName !== null) {
    return `Project: ${displayName}`;
  }
  if (event.subjectType === "project" && event.subjectId !== null) {
    const project = context.projectById.get(event.subjectId);
    return project === undefined ? null : `Project: ${project.name}`;
  }
  const workItem = auditEventWorkItem(event, context);
  if (workItem?.projectId === null || workItem?.projectId === undefined) {
    return null;
  }
  const project = context.projectById.get(workItem.projectId);
  return project === undefined ? null : `Project: ${project.name}`;
}

function auditEventWorkItem(event: AuditEvent, context: AuditSummaryContext): WorkItem | null {
  if (event.workItemId !== null) {
    return context.workItemById.get(event.workItemId) ?? null;
  }
  if (event.subjectType === "work_item" && event.subjectId !== null) {
    return context.workItemById.get(event.subjectId) ?? null;
  }
  return null;
}

function auditEventCountDetail(event: AuditEvent): string | null {
  const itemCount = event.metadata.itemCount;
  if (typeof itemCount === "number") {
    return `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
  }
  return null;
}

function readStringMetadata(metadata: Record<string, unknown>, key: string): string | null {
  return trimDisplayValue(typeof metadata[key] === "string" ? metadata[key] : null);
}

function trimDisplayValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function basename(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}

function uniqueCompact(values: (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

function humanizeWorkflowState(value: string): string {
  return value.replaceAll("_", " ");
}

function humanizeAuditEventName(value: string): string {
  return value
    .split(".")
    .at(-1)
    ?.replaceAll("_", " ")
    .replace(/^\w/, (character) => character.toUpperCase()) ?? value;
}

function MemoWorkflowDebuggerPanel(props: {
  runtime: WorkflowRuntime;
  classNames: Record<string, string>;
}): ReactElement {
  const initialFilter = useMemo(() => ({ view: "journal" as const }), []);
  const [selectedWorkflowEventId, setSelectedWorkflowEventId] = useState<string | null>(null);
  const [workflowEventFilter, setWorkflowEventFilter] = useState<WorkflowRuntimeEventFilter>("journal");
  const { controller, state, loading, error } = useWorkflowDebugger({
    runtime: props.runtime,
    initialFilter,
    pollingFallbackIntervalMs: 1000
  });

  if (loading) {
    return <section className="memo-debugger">Loading debugger...</section>;
  }
  if (error !== null) {
    return (
      <section className="memo-debugger">
        <p role="alert">{error.message}</p>
      </section>
    );
  }
  if (state === null) {
    return <section className="memo-debugger">Debugger unavailable.</section>;
  }

  const controlEvents = state.snapshot.events.filter((event) => event.eventType.startsWith("debug_"));
  const workflowEvents = projectWorkflowRuntimeEvents(state.snapshot, workflowEventFilter);
  const selectedWorkflowEvent =
    selectedWorkflowEventId === null
      ? null
      : workflowEvents.find((event) => event.eventId === selectedWorkflowEventId) ?? null;

  return (
    <section className="memo-debugger" aria-label="Workflow debugger">
      <div className="memo-debugger-toolbar">
        <button className="row-action-button" type="button" onClick={() => void controller?.startDebugger({ stepMode: false })}>
          Monitor
        </button>
        <button className="row-action-button" type="button" onClick={() => void controller?.startDebugger({ stepMode: true })}>
          Step debug
        </button>
        <button className="row-action-button" type="button" onClick={() => void controller?.pause()}>
          Pause
        </button>
        <button className="row-action-button" type="button" onClick={() => void controller?.resume()}>
          Resume
        </button>
        <button className="row-action-button" type="button" onClick={() => void controller?.step()}>
          Step
        </button>
        <button className="row-action-button" type="button" onClick={() => void controller?.stop()}>
          Stop
        </button>
      </div>

      <div className="memo-debugger-state">
        <span>Debugger: {state.snapshot.state}</span>
        <span>Step mode: {state.snapshot.stepMode ? "on" : "off"}</span>
      </div>

      <div className="memo-debugger-streams">
        <DebuggerControlEventStream
          events={controlEvents}
        />
        <WorkflowRuntimeEventStream
          events={workflowEvents}
          filter={workflowEventFilter}
          onFilterChange={setWorkflowEventFilter}
          selectedEventId={selectedWorkflowEventId}
          onSelect={setSelectedWorkflowEventId}
        />
      </div>

      {selectedWorkflowEvent === null ? (
        <div className="memo-debugger-detail">Select a workflow runtime event to inspect its details.</div>
      ) : (
        <DebuggerEventDetail event={selectedWorkflowEvent} />
      )}
    </section>
  );
}

function DebuggerControlEventStream(props: {
  events: WorkflowEventJournalRecord[];
}): ReactElement {
  return (
    <section className="memo-debugger-stream memo-debugger-control-stream" aria-label="Debugger controls">
      <div className="memo-debugger-stream-header">
        <h3>Debugger controls</h3>
        <span>{props.events.length}</span>
      </div>
      {props.events.length === 0 ? (
        <p className="memo-debugger-empty">No debugger control events yet.</p>
      ) : (
        <ol className="memo-debugger-timeline memo-debugger-control-timeline" aria-label="Debugger controls timeline">
          {props.events.map((event) => (
            <li key={event.eventId} className="memo-debugger-control-event">
              <span>{event.sequence}</span>
              <span>{formatEventDateTime(event.occurredAt)}</span>
              <span>{event.eventType}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function WorkflowRuntimeEventStream(props: {
  events: WorkflowEventJournalRecord[];
  filter: WorkflowRuntimeEventFilter;
  onFilterChange: (filter: WorkflowRuntimeEventFilter) => void;
  selectedEventId: string | null;
  onSelect: (eventId: string) => void;
}): ReactElement {
  return (
    <section className="memo-debugger-stream memo-debugger-workflow-stream" aria-label="Workflow runtime events">
      <div className="memo-debugger-stream-header">
        <h3>Workflow runtime events</h3>
        <span>{props.events.length}</span>
      </div>
      <div className="memo-debugger-views" aria-label="Workflow event filters">
        {workflowRuntimeEventFilters.map((filter) => (
          <button
            key={filter.id}
            className="row-action-button"
            type="button"
            aria-pressed={props.filter === filter.id}
            onClick={() => props.onFilterChange(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      {props.events.length === 0 ? (
        <p className="memo-debugger-empty">No workflow runtime events match this filter.</p>
      ) : (
        <ol className="memo-debugger-timeline memo-debugger-workflow-timeline" aria-label="Workflow runtime events timeline">
          {props.events.map((event) => (
            <li
              key={event.eventId}
              className={`memo-debugger-event${
                props.selectedEventId === event.eventId ? " memo-debugger-event-selected" : ""
              }`}
            >
              <button type="button" onClick={() => props.onSelect(event.eventId)}>
                <span>{event.sequence}</span>
                <span>{formatEventDateTime(event.occurredAt)}</span>
                <span>{event.eventType}</span>
                <span>{event.message}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DebuggerEventDetail(props: { event: WorkflowEventJournalRecord }): ReactElement {
  return (
    <aside className="memo-debugger-detail" aria-label="Selected event detail">
      <h2>{props.event.eventType}</h2>
      <dl>
        <dt>Time</dt>
        <dd>{formatEventDateTime(props.event.occurredAt)}</dd>
        <dt>Severity</dt>
        <dd>{props.event.severity}</dd>
        <dt>Message</dt>
        <dd>{props.event.message}</dd>
        <dt>Operation</dt>
        <dd>{props.event.operationId ?? "none"}</dd>
        <dt>Action</dt>
        <dd>{props.event.actionId ?? "none"}</dd>
      </dl>
      <pre className="memo-debugger-metadata">{JSON.stringify(props.event.metadata ?? {}, null, 2)}</pre>
    </aside>
  );
}

function TagSuggestionRow(props: {
  label: string;
  tags: string[];
  onSelect(tags: string[]): void;
  onSuppress(tag: string): void;
}): ReactElement {
  return (
    <div className="tag-suggestion-row">
      <strong className="tag-suggestion-label">{props.label}</strong>
      <div className="tag-suggestion-list">
        {props.tags.length === 0 ? <span className="tag-empty">None</span> : null}
        {props.tags.map((tag) => (
          <span className="tag-chip split-tag-chip" key={tag}>
            <button
              className="tag-chip-icon-action"
              type="button"
              title={`Suppress ${tag} suggestions`}
              aria-label={`Suppress ${tag} suggestions`}
              onClick={() => props.onSuppress(tag)}
            >
              <Minus size={13} />
            </button>
            <button className="tag-chip-main-action" type="button" onClick={() => props.onSelect([tag])}>
              <span>{tag}</span>
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export function App() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [activeView, setActiveView] = useState<ActiveView>("work-items");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [buckets, setBuckets] = useState<WorkflowBucket[]>([]);
  const [activeBucketId, setActiveBucketId] = useState<string | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [photoImports, setPhotoImports] = useState<PhotoImport[]>([]);
  const [selectedPhotoImportIds, setSelectedPhotoImportIds] = useState<Set<string>>(new Set());
  const [photoMemoDraft, setPhotoMemoDraft] = useState<PhotoMemoDraft>(defaultPhotoMemoDraft);
  const [photoMemoSaving, setPhotoMemoSaving] = useState(false);
  const [photoThumbnailUrls, setPhotoThumbnailUrls] = useState<Record<string, string>>({});
  const [photoViewer, setPhotoViewer] = useState<{ workItemId: string; title: string } | null>(null);
  const [photoViewerLoadState, setPhotoViewerLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [photoViewerError, setPhotoViewerError] = useState<string | null>(null);
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState<WorkItemPhotoAttachmentView[]>([]);
  const [photoGalleryScrollState, setPhotoGalleryScrollState] = useState({
    canScrollLeft: false,
    canScrollRight: false
  });
  const [rowActionsByItemId, setRowActionsByItemId] = useState<Record<string, AllowedWorkflowAction[]>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [search, setSearch] = useState("");
  const [workQueueLastRefreshedAt, setWorkQueueLastRefreshedAt] = useState<Date | null>(null);
  const [workQueueSyncState, setWorkQueueSyncState] = useState<WorkQueueSyncState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [actionIdInFlight, setActionIdInFlight] = useState<string | null>(null);
  const [exportSnapshots, setExportSnapshots] = useState<ExportableSnapshot[]>([]);
  const [selectedExportSnapshotIds, setSelectedExportSnapshotIds] = useState<Set<string>>(new Set());
  const [exportBatches, setExportBatches] = useState<ExportBatch[]>([]);
  const [exportSearch, setExportSearch] = useState("");
  const [exportCreating, setExportCreating] = useState(false);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [watchedFolders, setWatchedFolders] = useState<WatchedFolderSetting[]>([]);
  const [watchedCandidates, setWatchedCandidates] = useState<WatchedFileCandidate[]>([]);
  const [candidateStatuses, setCandidateStatuses] = useState<Record<string, ImportCandidateStatus>>({});
  const [watchScanInFlight, setWatchScanInFlight] = useState(false);
  const [watchedSettingsSaved, setWatchedSettingsSaved] = useState(false);
  const [watchedLastScanAt, setWatchedLastScanAt] = useState<Date | null>(null);
  const [watchedLastProcessedCount, setWatchedLastProcessedCount] = useState(0);
  const [selectedDiagnostics, setSelectedDiagnostics] = useState<WorkItemDiagnostics | null>(null);
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);
  const [audioLoadState, setAudioLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [transcriptSaving, setTranscriptSaving] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestionRows>({ strong: [], related: [], weak: [] });
  const [suppressedTags, setSuppressedTags] = useState<SuppressedTag[]>([]);
  const [suppressedTagsLoading, setSuppressedTagsLoading] = useState(false);
  const [suppressedTagInFlight, setSuppressedTagInFlight] = useState<string | null>(null);
  const [workItemTaskIdInFlight, setWorkItemTaskIdInFlight] = useState<string | null>(null);
  const [suggestionIdInFlight, setSuggestionIdInFlight] = useState<string | null>(null);
  const [pendingWorkflowAction, setPendingWorkflowAction] = useState<PendingWorkflowAction | null>(null);
  const [expandedMemoReview, setExpandedMemoReview] = useState<ExpandedMemoCandidate | null>(null);
  const [suggestedWorkItemReview, setSuggestedWorkItemReview] = useState<{
    parentWorkItemId: string;
    taskDisplayName: string;
    candidates: SuggestedWorkItemCandidate[];
  } | null>(null);
  const [settingsSummary, setSettingsSummary] = useState<SettingsSummary | null>(null);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("watched");
  const [promptDrafts, setPromptDrafts] = useState<Record<string, PromptDraft>>({});
  const [aiTaskRouteDrafts, setAiTaskRouteDrafts] = useState<Record<string, AiTaskRouteDraft>>({});
  const [aiTaskIdInFlight, setAiTaskIdInFlight] = useState<string | null>(null);
  const [newAiTaskDraft, setNewAiTaskDraft] = useState<NewAiTaskDraft>(defaultNewAiTaskDraft);
  const [aiTaskCreateInFlight, setAiTaskCreateInFlight] = useState(false);
  const [newProcessingHookKey, setNewProcessingHookKey] = useState("");
  const [processingHookCreateInFlight, setProcessingHookCreateInFlight] = useState(false);
  const [processingHookKeyInFlight, setProcessingHookKeyInFlight] = useState<string | null>(null);
  const [fileTypeIdInFlight, setFileTypeIdInFlight] = useState<string | null>(null);
  const [mediaTypeIdInFlight, setMediaTypeIdInFlight] = useState<string | null>(null);
  const [parserTypeIdInFlight, setParserTypeIdInFlight] = useState<string | null>(null);
  const [newFileTypeDraft, setNewFileTypeDraft] = useState<NewFileTypeDraft>(defaultNewFileTypeDraft);
  const [newMediaTypeDraft, setNewMediaTypeDraft] = useState<MediaTypeDraft>(defaultNewMediaTypeDraft);
  const [newParserTypeDraft, setNewParserTypeDraft] = useState<ParserTypeDraft>(defaultNewParserTypeDraft);
  const [mediaTypeDrafts, setMediaTypeDrafts] = useState<Record<string, MediaTypeDraft>>({});
  const [parserTypeDrafts, setParserTypeDrafts] = useState<Record<string, ParserTypeDraft>>({});
  const [fileTypeDrafts, setFileTypeDrafts] = useState<Record<string, FileTypeDraft>>({});
  const [fileTypeCreateInFlight, setFileTypeCreateInFlight] = useState(false);
  const [mediaTypeCreateInFlight, setMediaTypeCreateInFlight] = useState(false);
  const [parserTypeCreateInFlight, setParserTypeCreateInFlight] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [workflowStatusLoading, setWorkflowStatusLoading] = useState(false);
  const [workflowImportFile, setWorkflowImportFile] = useState<File | null>(null);
  const [workflowImportNotes, setWorkflowImportNotes] = useState("");
  const [workflowImportResult, setWorkflowImportResult] = useState<WorkflowImportResult | null>(null);
  const [workflowImportError, setWorkflowImportError] = useState<string | null>(null);
  const [workflowImportInFlight, setWorkflowImportInFlight] = useState(false);
  const [workflowActivationNotes, setWorkflowActivationNotes] = useState("");
  const [workflowActivationConfirmed, setWorkflowActivationConfirmed] = useState(false);
  const [workflowActivationInFlight, setWorkflowActivationInFlight] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditFilter, setAuditFilter] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectDrafts, setProjectDrafts] = useState<Record<string, ProjectFormState>>({});
  const [newProjectDrafts, setNewProjectDrafts] = useState<NewProjectDraft[]>([]);
  const [projectIdInFlight, setProjectIdInFlight] = useState<string | null>(null);
  const [projectDeleteConfirmId, setProjectDeleteConfirmId] = useState<string | null>(null);
  const [projectThresholdDraft, setProjectThresholdDraft] = useState("0.65");
  const [projectConfigSaving, setProjectConfigSaving] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [detailPanelWidth, setDetailPanelWidth] = useState(440);
  const nextProjectDraftId = useRef(1);
  const projectListRef = useRef<HTMLDivElement | null>(null);
  const workItemRowButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const photoGalleryRef = useRef<HTMLDivElement | null>(null);
  const photoModalRef = useRef<HTMLElement | null>(null);
  const watchScanInFlightRef = useRef(false);
  const activeBucketIdRef = useRef<string | null>(null);

  const selectedBucket = buckets.find((bucket) => bucket.id === activeBucketId) ?? null;
  const activeBucketIsPhotos = activeBucketId === photosBucketId;
  const workItemById = useMemo(() => new Map(workItems.map((item) => [item.id, item])), [workItems]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const contributorById = useMemo(
    () => new Map(contributors.map((contributor) => [contributor.id, contributor])),
    [contributors]
  );
  const mediaTypeByKey = useMemo(() => {
    const mediaTypes = settingsSummary?.mediaTypes ?? [];
    return new Map(mediaTypes.map((mediaType) => [mediaType.mediaKey, mediaType]));
  }, [settingsSummary]);
  const activeFileExtensions = useMemo(
    () =>
      settingsSummary?.fileTypes
        .filter(
          (fileType) =>
            fileType.capabilityState === "active" &&
            mediaTypeByKey.get(fileType.mediaKind)?.capabilityState === "active"
        )
        .map((fileType) => fileType.extension) ?? [],
    [mediaTypeByKey, settingsSummary]
  );
  const activeFileTypeByExtension = useMemo(() => {
    const fileTypes = settingsSummary?.fileTypes ?? [];
    return new Map(fileTypes.map((fileType) => [fileType.extension.toLowerCase(), fileType]));
  }, [settingsSummary]);
  const registeredTaskHooks = settingsSummary?.registeredTaskHooks ?? [];
  const workItemDetailTasks = useMemo(
    () =>
      [...(settingsSummary?.aiTasks ?? [])]
        .filter((task) => task.renderLocation === "work_item_detail")
        .sort(
          (left, right) =>
            left.displayOrder - right.displayOrder ||
            left.displayName.localeCompare(right.displayName) ||
            left.taskKey.localeCompare(right.taskKey)
        ),
    [settingsSummary]
  );
  const watchableFolders = useMemo(
    () =>
      watchedFolders.filter(
        (folder) => folder.enabled && folder.path.trim() !== "" && folder.archivePath.trim() !== ""
      ),
    [watchedFolders]
  );
  const activeFolderWatching =
    isTauriRuntime &&
    accessToken !== null &&
    machineId !== null &&
    watchedSettingsSaved &&
    activeFileExtensions.length > 0 &&
    watchableFolders.length > 0;
  const watchedFolderStatus = activeFolderWatching
    ? `Active watching every ${Math.round(watchedFolderPollingIntervalMs / 1000)}s`
    : watchedSettingsSaved
      ? "Watching paused"
      : "Save to activate watching";

  function applyActiveBucketId(bucketId: string | null) {
    activeBucketIdRef.current = bucketId;
    setActiveBucketId(bucketId);
  }
  const visibleTagSuggestions = useMemo(() => {
    const selectedNames = new Set((draft?.tags ?? []).map((tag) => tag.trim().toLowerCase()));
    const filterRow = (tags: string[]) => tags.filter((tag) => !selectedNames.has(tag.trim().toLowerCase()));
    return {
      strong: filterRow(tagSuggestions.strong),
      related: filterRow(tagSuggestions.related),
      weak: filterRow(tagSuggestions.weak)
    };
  }, [draft?.tags, tagSuggestions]);
  const selectedTagsAvailable = selectedItem?.tagsAvailable === true;
  const suppressedTagTableRows = useMemo(() => {
    const columns = 3;
    const sortedTags = [...suppressedTags].sort((left, right) =>
      left.displayName.localeCompare(right.displayName)
    );
    const rowCount = Math.ceil(sortedTags.length / columns);
    return Array.from({ length: rowCount }, (_, rowIndex) =>
      Array.from({ length: columns }, (_unused, columnIndex) => sortedTags[rowIndex * columns + columnIndex] ?? null)
    );
  }, [suppressedTags]);
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") {
      return workItems;
    }

    return workItems.filter((item) =>
      [
        item.title,
        item.body,
        item.contributorText ?? "",
        contributorById.get(item.contributorId ?? "")?.displayName ?? "",
        projectById.get(item.projectId ?? "")?.name ?? "",
        item.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [contributorById, projectById, search, workItems]);
  const filteredPhotoImports = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") {
      return photoImports;
    }
    return photoImports.filter((photoImport) =>
      [
        photoImport.originalFilename,
        photoImport.contributorText ?? "",
        photoImport.cameraMake ?? "",
        photoImport.cameraModel ?? "",
        photoImport.status
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [photoImports, search]);
  const filteredExportSnapshots = useMemo(() => {
    const query = exportSearch.trim().toLowerCase();
    if (query === "") {
      return exportSnapshots;
    }

    return exportSnapshots.filter((snapshot) =>
      [
        snapshot.title,
        snapshot.project.name,
        snapshot.project.slug,
        snapshot.contributor?.text ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [exportSearch, exportSnapshots]);
  const workflowDebuggerRuntime = useMemo(
    () => createMemoCaptureWorkflowDebuggerRuntime(accessToken),
    [accessToken]
  );
  const selectedExportCount = filteredExportSnapshots.filter((snapshot) =>
    selectedExportSnapshotIds.has(snapshot.acceptedSnapshotId)
  ).length;
  const isWorkQueueSearchActive = search.trim() !== "";
  const workQueueStatusItems = [
    activeBucketIsPhotos ? formatPhotoCount(photoImports.length) : formatItemCount(workItems.length),
    isWorkQueueSearchActive
      ? `${activeBucketIsPhotos ? filteredPhotoImports.length : filteredItems.length} shown`
      : null,
    workQueueLastRefreshedAt === null ? "Not refreshed yet" : `Last refreshed ${formatRelativeTime(workQueueLastRefreshedAt)}`,
    workQueueSyncState === "syncing" ? "Syncing" : workQueueSyncState === "error" ? "API error" : "API connected"
  ].filter((item): item is string => item !== null);
  const selectedAvailablePhotoCount = [...selectedPhotoImportIds].filter(
    (photoImportId) => photoImports.find((photoImport) => photoImport.id === photoImportId)?.status === "available"
  ).length;
  const canCreatePhotoMemo =
    selectedAvailablePhotoCount > 0 &&
    photoMemoDraft.projectId.trim() !== "" &&
    photoMemoDraft.body.trim() !== "" &&
    !photoMemoSaving;
  const activeProjectCount = projects.filter((project) => project.isActive).length;
  const inactiveProjectCount = projects.length - activeProjectCount;
  const hasDraftChanges =
    draft !== null &&
    selectedItem !== null &&
    (draft.title !== selectedItem.title ||
      draft.body !== selectedItem.body ||
      draft.projectId !== (selectedItem.projectId ?? "") ||
      draft.contributorId !== (selectedItem.contributorId ?? "") ||
      draft.contributorText !== (selectedItem.contributorText ?? "") ||
      (selectedTagsAvailable &&
        normalizeTagsForCompare(draft.tags) !== normalizeTagsForCompare(selectedItem.tags)));
  const audioArtifact =
    selectedDiagnostics?.artifacts.find((artifact) => artifact.artifactKind === "original_audio_file") ?? null;
  const transcriptArtifacts =
    selectedDiagnostics?.artifacts.filter((artifact) => artifact.artifactKind === "derived_transcript") ?? [];
  const transcriptionJobs =
    selectedDiagnostics?.jobs.filter((job) => job.jobKind === "transcribe_audio") ?? [];
  const retryableTranscriptionJob =
    transcriptionJobs.find((job) => job.status === "failed" || job.status === "exhausted") ?? null;
  const pageTitle =
    activeView === "exports"
      ? "Exports"
      : activeView === "projects"
      ? "Projects"
      : activeView === "audit"
      ? "Audit"
      : activeView === "settings"
      ? "Settings"
      : "Work queue";
  const pageDescription =
    activeView === "exports"
      ? "Accepted snapshots and generated export batches."
      : activeView === "projects"
      ? ""
      : activeView === "audit"
      ? "Application audit history and workflow runtime event-journal debugging."
      : activeView === "settings"
      ? "Watched folders, file types, providers, tasks, and diagnostics."
      : "";
  const activeSettingsSectionMeta =
    settingsSections.find((section) => section.id === activeSettingsSection) ?? {
      id: "watched",
      label: "Watched folders"
    };
  const validWorkflowImportReady = workflowImportResult?.validation.ok === true;
  const projectThresholdValue = Number.parseFloat(projectThresholdDraft);
  const projectThresholdDisplay = Number.isFinite(projectThresholdValue)
    ? projectThresholdValue.toFixed(2)
    : "--";

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoadState("loading");
      try {
        const nextSession = await requestJson<SessionResponse>("/api/dev-auth/session", {
          method: "POST"
        });
        const token = nextSession.accessToken;
        if (token === undefined) {
          throw new Error("Local-dev auth did not return an access token.");
        }
        if (cancelled) {
          return;
        }
        setAccessToken(token);
        setSession(nextSession);
        await loadWorkspace(token, null);
        if (!cancelled) {
          setLoadState("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState("error");
          setStatusMessage(error instanceof Error ? error.message : "Unable to load work queue.");
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeView !== "projects" || newProjectDrafts.length === 0) {
      return;
    }
    projectListRef.current?.scrollTo({
      top: projectListRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [activeView, newProjectDrafts.length]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    return () => {
      if (audioObjectUrl !== null) {
        URL.revokeObjectURL(audioObjectUrl);
      }
    };
  }, [audioObjectUrl]);

  useEffect(() => {
    if (accessToken === null || photoImports.length === 0) {
      setPhotoThumbnailUrls((current) => {
        Object.values(current).forEach((url) => URL.revokeObjectURL(url));
        return {};
      });
      return;
    }

    let cancelled = false;
    const thumbnailPhotoImports = photoImports.filter((photoImport) => photoImport.thumbnailArtifactId !== null);
    void Promise.all(
      thumbnailPhotoImports.map(async (photoImport) => {
        const response = await authedFetch(
          accessToken,
          `/api/artifacts/${encodeURIComponent(photoImport.thumbnailArtifactId ?? "")}/download`
        );
        const blob = await response.blob();
        return [photoImport.id, URL.createObjectURL(blob)] as const;
      })
    )
      .then((entries) => {
        if (cancelled) {
          entries.forEach(([, url]) => URL.revokeObjectURL(url));
          return;
        }
        setPhotoThumbnailUrls((current) => {
          Object.values(current).forEach((url) => URL.revokeObjectURL(url));
          return Object.fromEntries(entries);
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPhotoThumbnailUrls((current) => {
            Object.values(current).forEach((url) => URL.revokeObjectURL(url));
            return {};
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, photoImports]);

  useEffect(() => {
    if (accessToken === null || photoViewer === null) {
      setPhotoViewerLoadState("idle");
      setPhotoViewerError(null);
      setPhotoViewerPhotos((current) => {
        current.forEach((photo) => URL.revokeObjectURL(photo.objectUrl));
        return [];
      });
      return;
    }

    const token = accessToken;
    const workItemId = photoViewer.workItemId;
    let cancelled = false;
    const createdUrls: string[] = [];
    setPhotoViewerLoadState("loading");
    setPhotoViewerError(null);
    setPhotoViewerPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.objectUrl));
      return [];
    });
    setPhotoGalleryScrollState({ canScrollLeft: false, canScrollRight: false });

    async function loadPhotoAttachments() {
      try {
        const response = await authedJson<{ workItemId: string; photos: WorkItemPhotoAttachment[] }>(
          token,
          `/api/work-items/${encodeURIComponent(workItemId)}/photo-attachments`
        );
        const photos = await Promise.all(
          response.photos.map(async (photo) => {
            const artifactId = photo.thumbnailArtifactId ?? photo.originalArtifactId;
            const artifactResponse = await authedFetch(
              token,
              `/api/artifacts/${encodeURIComponent(artifactId)}/download`
            );
            const objectUrl = URL.createObjectURL(await artifactResponse.blob());
            createdUrls.push(objectUrl);
            return { ...photo, objectUrl };
          })
        );
        if (cancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        setPhotoViewerPhotos(photos);
        setPhotoViewerLoadState("ready");
        window.requestAnimationFrame(updatePhotoGalleryScrollState);
      } catch (error) {
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        if (!cancelled) {
          setPhotoViewerLoadState("error");
          setPhotoViewerError(error instanceof Error ? error.message : "Unable to load attached photos.");
        }
      }
    }

    void loadPhotoAttachments();
    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [accessToken, photoViewer]);

  useEffect(() => {
    if (photoViewer !== null) {
      photoModalRef.current?.focus();
    }
  }, [photoViewer]);

  useEffect(() => {
    setWatchedFolders(readWatchedFolderSettings());
    setWatchedSettingsSaved(true);
    if (!isTauriRuntime) {
      return;
    }

    invoke<string>("watched_text_machine_id")
      .then(setMachineId)
      .catch((error: unknown) => {
        setStatusMessage(error instanceof Error ? error.message : "Unable to load machine identity.");
      });
  }, []);

  useEffect(() => {
    if (accessToken === null || selectedItemId === null || activeBucketIsPhotos) {
      setTagSuggestions({ strong: [], related: [], weak: [] });
      setExpandedMemoReview(null);
      setSuggestedWorkItemReview(null);
      return;
    }

    const token = accessToken;
    const workItemId = selectedItemId;
    let cancelled = false;
    async function loadSelectedItem() {
      try {
        setExpandedMemoReview(null);
        setSuggestedWorkItemReview(null);
        const [detailResponse, actionsResponse, diagnosticsResponse] =
          await Promise.all([
            authedJson<{ workItem: WorkItem }>(token, `/api/work-items/${encodeURIComponent(workItemId)}`),
            authedJson<{ actions: AllowedWorkflowAction[] }>(
              token,
              `/api/work-items/${encodeURIComponent(workItemId)}/actions`
            ),
            authedJson<WorkItemDiagnostics>(
              token,
              `/api/work-items/${encodeURIComponent(workItemId)}/diagnostics`
            )
          ]);
        const tagSuggestionResponse = detailResponse.workItem.tagsAvailable
          ? await authedJson<TagSuggestionResponse>(
              token,
              `/api/work-items/${encodeURIComponent(workItemId)}/tag-suggestions`
            )
          : { suggestions: { strong: [], related: [], weak: [] } };
        if (cancelled) {
          return;
        }
        setSelectedItem(detailResponse.workItem);
        setDraft(createDraft(detailResponse.workItem));
        setRowActionsByItemId((current) => ({
          ...current,
          [detailResponse.workItem.id]: actionsResponse.actions.filter((action) => action.visible && !action.requiresInput)
        }));
        setSelectedDiagnostics(diagnosticsResponse);
        setTagSuggestions(tagSuggestionResponse.suggestions);
        setAudioObjectUrl((current) => {
          if (current !== null) {
            URL.revokeObjectURL(current);
          }
          return null;
        });
        setAudioLoadState("idle");
        setSaveState("idle");
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Unable to load work item.");
        }
      }
    }

    void loadSelectedItem();
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeBucketIsPhotos, selectedItemId]);

  useEffect(() => {
    if (accessToken === null || activeView !== "exports") {
      return;
    }

    void loadExports(accessToken).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load exports.");
    });
  }, [accessToken, activeView]);

  useEffect(() => {
    if (accessToken === null || activeView !== "projects") {
      return;
    }

    void loadProjects(accessToken).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load projects.");
    });
  }, [accessToken, activeView]);

  useEffect(() => {
    if (accessToken === null) {
      return;
    }
    if (settingsSummary !== null) {
      return;
    }

    void loadSettings(accessToken).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load settings.");
    });
  }, [accessToken, settingsSummary]);

  useEffect(() => {
    if (accessToken === null || activeView !== "settings") {
      return;
    }

    void loadSettings(accessToken).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load settings.");
    });
  }, [accessToken, activeView]);

  useEffect(() => {
    if (accessToken === null || activeView !== "settings" || activeSettingsSection !== "operations") {
      return;
    }

    void loadWorkflowStatus(accessToken).catch((error) => {
      setWorkflowImportError(error instanceof Error ? error.message : "Unable to load workflow status.");
    });
  }, [accessToken, activeView, activeSettingsSection]);

  useEffect(() => {
    if (accessToken === null || activeView !== "settings" || activeSettingsSection !== "suppressed-tags") {
      return;
    }

    void loadSuppressedTags(accessToken).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load suppressed tags.");
    });
  }, [accessToken, activeView, activeSettingsSection]);

  useEffect(() => {
    if (!activeFolderWatching) {
      return;
    }

    void runWatchedFolderScan("auto");
    const interval = window.setInterval(() => {
      void runWatchedFolderScan("auto");
    }, watchedFolderPollingIntervalMs);
    return () => window.clearInterval(interval);
  }, [
    accessToken,
    activeFileExtensions,
    activeFileTypeByExtension,
    activeFolderWatching,
    machineId,
    watchableFolders,
    watchedFolders
  ]);

  useEffect(() => {
    if (settingsSummary === null) {
      setPromptDrafts({});
      return;
    }

    setPromptDrafts(
      Object.fromEntries(
        settingsSummary.aiTasks
          .map((task) => task.prompt)
          .filter((prompt): prompt is PromptSummary => prompt !== null)
          .map((prompt) => [
            prompt.id,
            {
              freeformText: prompt.contextConfig.freeformText || prompt.body || "",
              systemMessage: prompt.contextConfig.systemMessage,
              includeProjectSynopsis: prompt.contextConfig.includeProjectSynopsis,
              includeMemoMetadata: prompt.contextConfig.includeMemoMetadata,
              includeMemoTranscriptText: prompt.contextConfig.includeMemoTranscriptText
            }
          ])
      )
    );
  }, [settingsSummary]);

  useEffect(() => {
    setProjectThresholdDraft(
      String(settingsSummary?.extraction?.projectConfidenceThreshold ?? defaultExtractionSettings.projectConfidenceThreshold)
    );
  }, [settingsSummary?.extraction?.projectConfidenceThreshold]);

  useEffect(() => {
    if (accessToken === null || activeView !== "audit") {
      return;
    }

    void loadAuditEvents(accessToken).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load audit events.");
    });
  }, [accessToken, activeView]);

  async function loadWorkspace(token: string, requestedBucketId: string | null): Promise<void> {
    setWorkQueueSyncState("syncing");
    try {
      const [bucketResponse, projectsResponse, contributorsResponse] = await Promise.all([
        authedJson<{ buckets: WorkflowBucket[] }>(token, "/api/workflow/buckets"),
        authedJson<{ projects: Project[] }>(token, "/api/projects"),
        authedJson<{ contributors: Contributor[] }>(token, "/api/contributors")
      ]);
      const orderedBuckets = [...bucketResponse.buckets].sort((left, right) => left.order - right.order);
      const defaultBucketId =
        orderedBuckets.find((bucket) => bucket.label.toLowerCase() === "memos")?.id ?? orderedBuckets[0]?.id ?? null;
      const nextBucketId = requestedBucketId ?? defaultBucketId;
      const photoBucketSelected = nextBucketId === photosBucketId;
      const itemResponse = photoBucketSelected ? { workItems: [] } : await loadWorkItems(token, nextBucketId);
      const photoResponse = photoBucketSelected ? await loadPhotoImports(token) : { photoImports: [] };

      setBuckets(orderedBuckets);
      applyProjects(projectsResponse.projects);
      setContributors(contributorsResponse.contributors);
      applyActiveBucketId(nextBucketId);
      setWorkItems(itemResponse.workItems);
      setPhotoImports(photoResponse.photoImports);
      const rowActionsLoaded = await loadRowActionsForItems(token, itemResponse.workItems);
      if (!rowActionsLoaded) {
        setStatusMessage("Work items loaded. Some workflow actions could not be loaded.");
      } else {
        setStatusMessage(null);
      }
      if (photoBucketSelected || itemResponse.workItems.length === 0) {
        setSelectedItem(null);
        setDraft(null);
      }
      setSelectedItemId((current) =>
        !photoBucketSelected && current !== null && itemResponse.workItems.some((item) => item.id === current)
          ? current
          : photoBucketSelected
            ? null
            : itemResponse.workItems[0]?.id ?? null
      );
      setSelectedPhotoImportIds((current) => retainAvailablePhotoSelections(current, photoResponse.photoImports));
      setWorkQueueLastRefreshedAt(new Date());
      setWorkQueueSyncState("connected");
    } catch (error) {
      setWorkQueueSyncState("error");
      throw error;
    }
  }

  async function loadPhotoImports(token: string): Promise<{ photoImports: PhotoImport[] }> {
    return authedJson<{ photoImports: PhotoImport[] }>(token, "/api/photo-imports");
  }

  async function loadRowActionsForItems(token: string, items: WorkItem[]): Promise<boolean> {
    if (items.length === 0) {
      setRowActionsByItemId({});
      return true;
    }

    let allRowsLoaded = true;
    const actionEntries = await Promise.all(
      items.map(async (item) => {
        try {
          const response = await authedJson<{ actions: AllowedWorkflowAction[] }>(
            token,
            `/api/work-items/${encodeURIComponent(item.id)}/actions`
          );
          return [item.id, response.actions.filter((action) => action.visible && !action.requiresInput)] as const;
        } catch {
          allRowsLoaded = false;
          return [item.id, []] as const;
        }
      })
    );
    setRowActionsByItemId(Object.fromEntries(actionEntries));
    return allRowsLoaded;
  }

  function applyProjects(nextProjects: Project[]) {
    setProjects(nextProjects);
    setProjectDrafts(Object.fromEntries(nextProjects.map((project) => [project.id, createProjectForm(project)])));
    setProjectDeleteConfirmId(null);
  }

  async function loadProjects(token = accessToken): Promise<void> {
    if (token === null) {
      return;
    }
    setProjectsLoading(true);
    setStatusMessage(null);
    try {
      const projectsResponse = await authedJson<{ projects: Project[] }>(token, "/api/projects");
      applyProjects(projectsResponse.projects);
    } finally {
      setProjectsLoading(false);
    }
  }

  async function refreshBucket(bucketId: string | null = activeBucketIdRef.current): Promise<void> {
    if (accessToken === null) {
      return;
    }

    setWorkQueueSyncState("syncing");
    try {
      const photoBucketSelected = bucketId === photosBucketId;
      const [bucketResponse, itemResponse, photoResponse] = await Promise.all([
        authedJson<{ buckets: WorkflowBucket[] }>(accessToken, "/api/workflow/buckets"),
        photoBucketSelected ? Promise.resolve({ workItems: [] }) : loadWorkItems(accessToken, bucketId),
        photoBucketSelected ? loadPhotoImports(accessToken) : Promise.resolve({ photoImports: [] })
      ]);
      setBuckets([...bucketResponse.buckets].sort((left, right) => left.order - right.order));
      setWorkItems(itemResponse.workItems);
      setPhotoImports(photoResponse.photoImports);
      const rowActionsLoaded = await loadRowActionsForItems(accessToken, itemResponse.workItems);
      if (!rowActionsLoaded) {
        setStatusMessage("Work items loaded. Some workflow actions could not be loaded.");
      } else {
        setStatusMessage(null);
      }
      if (photoBucketSelected || itemResponse.workItems.length === 0) {
        setSelectedItem(null);
        setDraft(null);
      }
      setSelectedItemId((current) =>
        !photoBucketSelected && current !== null && itemResponse.workItems.some((item) => item.id === current)
          ? current
          : photoBucketSelected
            ? null
            : itemResponse.workItems[0]?.id ?? null
      );
      setSelectedPhotoImportIds((current) => retainAvailablePhotoSelections(current, photoResponse.photoImports));
      setWorkQueueLastRefreshedAt(new Date());
      setWorkQueueSyncState("connected");
    } catch (error) {
      setWorkQueueSyncState("error");
      throw error;
    }
  }

  async function loadExports(token = accessToken): Promise<void> {
    if (token === null) {
      return;
    }

    setStatusMessage(null);
    const [snapshotResponse, batchResponse] = await Promise.all([
      authedJson<{ snapshots: ExportableSnapshot[] }>(token, "/api/exports/accepted-snapshots"),
      authedJson<{ batches: ExportBatch[] }>(token, "/api/exports/batches")
    ]);
    setExportSnapshots(snapshotResponse.snapshots);
    setExportBatches(batchResponse.batches);
    setSelectedExportSnapshotIds(
      new Set(
        snapshotResponse.snapshots
          .filter((snapshot) => snapshot.defaultChecked)
          .map((snapshot) => snapshot.acceptedSnapshotId)
      )
    );
  }

  async function loadSettings(token = accessToken): Promise<void> {
    if (token === null) {
      return;
    }
    setSettingsLoading(true);
    setStatusMessage(null);
    try {
      const settingsResponse = await authedJson<SettingsSummary>(token, "/api/settings");
      const normalized = normalizeSettingsSummary(settingsResponse);
      setSettingsSummary(normalized);
      setMediaTypeDrafts(
        Object.fromEntries(
          normalized.mediaTypes.map((mediaType) => [
            mediaType.id,
            {
              mediaKey: mediaType.mediaKey,
              displayName: mediaType.displayName,
              description: mediaType.description ?? "",
              capabilityState: mediaType.capabilityState
            }
          ])
        )
      );
      setParserTypeDrafts(
        Object.fromEntries(
          normalized.parserTypes.map((parserType) => [
            parserType.id,
            {
              parserKey: parserType.parserKey,
              displayName: parserType.displayName,
              description: parserType.description ?? "",
              mediaKey: parserType.mediaKey,
              capabilityState: parserType.capabilityState
            }
          ])
        )
      );
      setFileTypeDrafts(
        Object.fromEntries(
          normalized.fileTypes.map((fileType) => [
            fileType.id,
            {
              mediaKind: fileType.mediaKind,
              parserKey: fileType.parserKey ?? "",
              capabilityState: fileType.capabilityState
            }
          ])
        )
      );
      setAiTaskRouteDrafts(
        Object.fromEntries(
          normalized.aiTasks.map((task) => [
            task.id,
            {
              displayName: task.displayName,
              description: task.description ?? "",
              hookKey: task.hookKey,
              renderLocation: task.renderLocation,
              displayOrder: task.displayOrder,
              providerConfigId: task.selectedProviderId ?? "",
              modelName: task.selectedModelName ?? "",
              promptsEnabled: task.prompt !== null,
              enabled: task.routeEnabled
            }
          ])
        )
      );
    } finally {
      setSettingsLoading(false);
    }
  }

  async function loadSuppressedTags(token = accessToken): Promise<void> {
    if (token === null) {
      return;
    }
    setSuppressedTagsLoading(true);
    try {
      const response = await authedJson<{ suppressedTags: SuppressedTag[] }>(token, "/api/tags/suppressed");
      setSuppressedTags([...response.suppressedTags].sort((left, right) => left.displayName.localeCompare(right.displayName)));
    } finally {
      setSuppressedTagsLoading(false);
    }
  }

  async function loadWorkflowStatus(token = accessToken): Promise<void> {
    if (token === null) {
      return;
    }
    setWorkflowStatusLoading(true);
    try {
      const statusResponse = await authedJson<WorkflowStatus>(token, "/api/workflow/status");
      setWorkflowStatus(statusResponse);
    } finally {
      setWorkflowStatusLoading(false);
    }
  }

  function handleWorkflowImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    setWorkflowImportFile(nextFile);
    setWorkflowImportResult(null);
    setWorkflowActivationConfirmed(false);
    setWorkflowImportError(null);
  }

  async function validateAndStageWorkflowImport(): Promise<void> {
    if (accessToken === null) {
      return;
    }
    if (workflowImportFile === null) {
      setWorkflowImportError("Choose a workflow JSON bundle before staging.");
      return;
    }

    setWorkflowImportInFlight(true);
    setWorkflowImportError(null);
    setWorkflowImportResult(null);
    setWorkflowActivationConfirmed(false);
    try {
      let bundle: unknown;
      try {
        bundle = JSON.parse(await workflowImportFile.text()) as unknown;
      } catch {
        setWorkflowImportError("Workflow bundle JSON could not be parsed.");
        return;
      }
      const response = await authedJson<WorkflowImportResult>(accessToken, "/api/workflow/imports", {
        method: "POST",
        body: JSON.stringify({
          bundle,
          notes: workflowImportNotes.trim()
        })
      });
      setWorkflowImportResult(response);
      setWorkflowActivationNotes("");
      setStatusMessage(response.validation.ok ? "Workflow bundle staged." : "Workflow bundle failed validation.");
    } catch (error) {
      setWorkflowImportError(error instanceof Error ? error.message : "Unable to stage workflow bundle.");
    } finally {
      setWorkflowImportInFlight(false);
    }
  }

  async function activateStagedWorkflow(): Promise<void> {
    if (accessToken === null || workflowImportResult === null || !workflowImportResult.validation.ok) {
      return;
    }
    if (!workflowActivationConfirmed) {
      setWorkflowImportError("Confirm activation before activating the staged workflow.");
      return;
    }

    setWorkflowActivationInFlight(true);
    setWorkflowImportError(null);
    try {
      await authedJson<{
        activated: true;
        activeWorkflowVersion: string;
        contentHash: string;
      }>(
        accessToken,
        `/api/workflow/imports/${encodeURIComponent(workflowImportResult.stagedImportId)}/activate`,
        {
          method: "POST",
          body: JSON.stringify({
            confirmActivation: true,
            activationNotes: workflowActivationNotes.trim()
          })
        }
      );
      setWorkflowImportResult(null);
      setWorkflowActivationConfirmed(false);
      setWorkflowActivationNotes("");
      await Promise.all([loadWorkflowStatus(accessToken), refreshBucket(activeBucketId)]);
      setStatusMessage("Workflow activated and Work queue refreshed.");
    } catch (error) {
      setWorkflowImportError(error instanceof Error ? error.message : "Unable to activate staged workflow.");
    } finally {
      setWorkflowActivationInFlight(false);
    }
  }

  async function loadAuditEvents(token = accessToken): Promise<void> {
    if (token === null) {
      return;
    }
    setAuditLoading(true);
    setStatusMessage(null);
    try {
      const query = auditFilter.trim() === "" ? "" : `?event_name=${encodeURIComponent(auditFilter.trim())}`;
      const auditResponse = await authedJson<{ auditEvents: AuditEvent[] }>(token, `/api/audit-events${query}`);
      setAuditEvents(auditResponse.auditEvents);
    } finally {
      setAuditLoading(false);
    }
  }

  function toggleExportSnapshot(snapshotId: string, checked: boolean) {
    setSelectedExportSnapshotIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(snapshotId);
      } else {
        next.delete(snapshotId);
      }
      return next;
    });
  }

  function selectAllFilteredExports(checked: boolean) {
    setSelectedExportSnapshotIds((current) => {
      const next = new Set(current);
      for (const snapshot of filteredExportSnapshots) {
        if (checked) {
          next.add(snapshot.acceptedSnapshotId);
        } else {
          next.delete(snapshot.acceptedSnapshotId);
        }
      }
      return next;
    });
  }

  async function createExportBatch() {
    if (accessToken === null || selectedExportSnapshotIds.size === 0) {
      return;
    }

    setExportCreating(true);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, "/api/exports/batches", {
        method: "POST",
        body: JSON.stringify({
          acceptedSnapshotIds: [...selectedExportSnapshotIds],
          filterContext: {
            q: exportSearch.trim()
          },
          options: {
            includeContributor: true,
            includeSourceProvenance: true
          }
        })
      });
      await loadExports(accessToken);
      setStatusMessage("Export batch created. The worker will attach download artifacts when generation completes.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to create export batch.");
    } finally {
      setExportCreating(false);
    }
  }

  async function downloadExportBatch(batchId: string) {
    if (accessToken === null) {
      return;
    }

    try {
      const response = await authedFetch(accessToken, `/api/exports/batches/${encodeURIComponent(batchId)}/download`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = readDownloadFilename(response.headers.get("content-disposition")) ?? `export-${batchId}.zip`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to download export batch.");
    }
  }

  async function selectBucket(bucketId: string): Promise<void> {
    if (accessToken === null || bucketId === activeBucketId) {
      return;
    }

    applyActiveBucketId(bucketId);
    setSelectedItem(null);
    setDraft(null);
    setSelectedItemId(null);
    setRowActionsByItemId({});
    setTagSuggestions({ strong: [], related: [], weak: [] });
    setStatusMessage(null);
    setWorkQueueSyncState("syncing");
    try {
      const photoBucketSelected = bucketId === photosBucketId;
      const itemResponse = photoBucketSelected ? { workItems: [] } : await loadWorkItems(accessToken, bucketId);
      const photoResponse = photoBucketSelected ? await loadPhotoImports(accessToken) : { photoImports: [] };
      setWorkItems(itemResponse.workItems);
      setPhotoImports(photoResponse.photoImports);
      const rowActionsLoaded = await loadRowActionsForItems(accessToken, itemResponse.workItems);
      if (!rowActionsLoaded) {
        setStatusMessage("Work items loaded. Some workflow actions could not be loaded.");
      } else {
        setStatusMessage(null);
      }
      setSelectedItemId(photoBucketSelected ? null : itemResponse.workItems[0]?.id ?? null);
      setSelectedPhotoImportIds((current) => retainAvailablePhotoSelections(current, photoResponse.photoImports));
      setWorkQueueLastRefreshedAt(new Date());
      setWorkQueueSyncState("connected");
    } catch (error) {
      setWorkQueueSyncState("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to load bucket.");
    }
  }

  async function saveDraft() {
    if (accessToken === null || selectedItem === null || draft === null || !hasDraftChanges) {
      return;
    }

    setSaveState("saving");
    setStatusMessage(null);
    try {
      const payload = {
        expectedVersion: selectedItem.workflowItemVersion,
        title: draft.title,
        body: draft.body,
        projectId: draft.projectId,
        contributorId: draft.contributorId,
        contributorText: draft.contributorText,
        ...(selectedTagsAvailable ? { tags: draft.tags } : {})
      };
      const response = await authedJson<{ workItem: WorkItem }>(
        accessToken,
        `/api/work-items/${encodeURIComponent(selectedItem.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );
      setSelectedItem(response.workItem);
      setDraft(createDraft(response.workItem));
      setWorkItems((items) => items.map((item) => (item.id === response.workItem.id ? response.workItem : item)));
      if (response.workItem.tagsAvailable) {
        const tagSuggestionResponse = await authedJson<TagSuggestionResponse>(
          accessToken,
          `/api/work-items/${encodeURIComponent(response.workItem.id)}/tag-suggestions`
        );
        setTagSuggestions(tagSuggestionResponse.suggestions);
      } else {
        setTagSuggestions({ strong: [], related: [], weak: [] });
      }
      setSaveState("saved");
      await refreshBucket();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const current = error.body.error?.details?.workItem;
        if (current !== undefined) {
          setSelectedItem(current);
          setDraft(createDraft(current));
          setWorkItems((items) => items.map((item) => (item.id === current.id ? current : item)));
        }
        setSaveState("conflict");
        setStatusMessage("This item changed elsewhere. Review the refreshed version before saving again.");
        return;
      }

      setSaveState("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to save work item.");
    }
  }

  function togglePhotoImportSelection(photoImport: PhotoImport, checked: boolean) {
    if (photoImport.status !== "available") {
      return;
    }
    setSelectedPhotoImportIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(photoImport.id);
      } else {
        next.delete(photoImport.id);
      }
      return next;
    });
  }

  function updatePhotoMemoDraft<Field extends keyof PhotoMemoDraft>(
    field: Field,
    value: PhotoMemoDraft[Field]
  ) {
    setPhotoMemoDraft((current) => ({ ...current, [field]: value }));
  }

  async function createMemoFromSelectedPhotos() {
    if (accessToken === null || !canCreatePhotoMemo) {
      return;
    }

    const selectedAvailableIds = [...selectedPhotoImportIds].filter(
      (photoImportId) => photoImports.find((photoImport) => photoImport.id === photoImportId)?.status === "available"
    );
    const previousPhotoImports = photoImports;
    const optimisticPhotoImports = photoImports.filter((photoImport) => !selectedAvailableIds.includes(photoImport.id));
    setPhotoMemoSaving(true);
    setStatusMessage(null);
    setPhotoImports(optimisticPhotoImports);
    setSelectedPhotoImportIds(new Set());
    try {
      const response = await authedJson<{ workItem: WorkItem; attachedPhotoImportIds: string[] }>(
        accessToken,
        "/api/photo-imports/create-memo",
        {
          method: "POST",
          body: JSON.stringify({
            photoImportIds: selectedAvailableIds,
            projectId: photoMemoDraft.projectId,
            title: photoMemoDraft.title,
            body: photoMemoDraft.body,
            tags: parseTagsText(photoMemoDraft.tags)
          })
        }
      );
      setPhotoMemoDraft(defaultPhotoMemoDraft);
      const bucketResponse = await authedJson<{ buckets: WorkflowBucket[] }>(accessToken, "/api/workflow/buckets");
      setBuckets([...bucketResponse.buckets].sort((left, right) => left.order - right.order));
      if (optimisticPhotoImports.length > 0) {
        await refreshBucket(photosBucketId);
        setStatusMessage("Memo created from selected photos.");
      } else {
        const memosBucketId = bucketResponse.buckets.find((bucket) => bucket.label.toLowerCase() === "memos")?.id ?? null;
        await loadWorkspace(accessToken, memosBucketId);
        setSelectedItemId(response.workItem.id);
        setSelectedItem(response.workItem);
        setDraft(createDraft(response.workItem));
        setStatusMessage("Memo created from selected photos.");
      }
    } catch (error) {
      setPhotoImports(previousPhotoImports);
      setSelectedPhotoImportIds(new Set(selectedAvailableIds));
      setStatusMessage(error instanceof Error ? error.message : "Unable to create memo from photos.");
    } finally {
      setPhotoMemoSaving(false);
    }
  }

  function runAction(action: AllowedWorkflowAction, targetItem: WorkItem) {
    if (accessToken === null) {
      return;
    }

    const intent = workflowActionIntent(action);
    if (hasDraftChanges) {
      setStatusMessage("Save or reset the selected item before running workflow actions.");
      return;
    }

    if (action.confirmationRequired || intent === "danger" || intent === "warning") {
      setPendingWorkflowAction({ action, targetItem, intent });
      return;
    }

    void executeWorkflowAction(action, targetItem, false);
  }

  async function executeWorkflowAction(action: AllowedWorkflowAction, targetItem: WorkItem, confirmed: boolean) {
    if (accessToken === null) {
      return;
    }

    setActionIdInFlight(`${targetItem.id}:${action.id}`);
    setStatusMessage(null);
    try {
      await authedJson(
        accessToken,
        `/api/work-items/${encodeURIComponent(targetItem.id)}/actions/${encodeURIComponent(action.id)}`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: targetItem.workflowItemVersion,
            confirmation: confirmed || action.confirmationRequired
          })
        }
      );
      await refreshBucket();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setStatusMessage(error.body.error?.message ?? "Workflow action is no longer available.");
      } else {
        setStatusMessage(error instanceof Error ? error.message : "Unable to run workflow action.");
      }
    } finally {
      setActionIdInFlight(null);
    }
  }

  function updateDraft<Field extends keyof DraftState>(field: Field, value: DraftState[Field]) {
    setDraft((current) => (current === null ? current : { ...current, [field]: value }));
    if (saveState === "saved" || saveState === "conflict") {
      setSaveState("idle");
    }
  }

  function addDraftTags(tags: string[]) {
    const nextTags = normalizeTagList(tags);
    if (nextTags.length === 0) {
      return;
    }
    setDraft((current) =>
      current === null ? current : { ...current, tags: normalizeTagList([...current.tags, ...nextTags]), tagInput: "" }
    );
    if (saveState === "saved" || saveState === "conflict") {
      setSaveState("idle");
    }
  }

  function removeDraftTag(tagToRemove: string) {
    const normalizedToRemove = tagToRemove.trim().toLowerCase();
    setDraft((current) =>
      current === null
        ? current
        : { ...current, tags: current.tags.filter((tag) => tag.trim().toLowerCase() !== normalizedToRemove) }
    );
    if (saveState === "saved" || saveState === "conflict") {
      setSaveState("idle");
    }
  }

  async function refreshTagSuggestions(workItemId = selectedItem?.id ?? null) {
    if (accessToken === null || workItemId === null) {
      return;
    }

    const response = await authedJson<TagSuggestionResponse>(
      accessToken,
      `/api/work-items/${encodeURIComponent(workItemId)}/tag-suggestions`
    );
    setTagSuggestions(response.suggestions);
  }

  async function suppressTag(tag: string, options: { removeFromDraft: boolean }) {
    if (accessToken === null) {
      return;
    }

    const cleaned = tag.trim().replace(/\s+/g, " ");
    if (cleaned === "") {
      return;
    }
    const normalized = cleaned.toLowerCase();

    setSuppressedTagInFlight(normalized);
    setStatusMessage(null);
    try {
      const response = await authedJson<{ suppressedTag: SuppressedTag }>(
        accessToken,
        "/api/tags/suppressed",
        {
          method: "POST",
          body: JSON.stringify({
            name: cleaned,
            sourceWorkItemId: selectedItem?.id
          })
        }
      );
      setSuppressedTags((current) =>
        [...current.filter((item) => item.normalizedName !== response.suppressedTag.normalizedName), response.suppressedTag]
          .sort((left, right) => left.displayName.localeCompare(right.displayName))
      );
      setTagSuggestions((current) => ({
        strong: current.strong.filter((candidate) => candidate.trim().toLowerCase() !== normalized),
        related: current.related.filter((candidate) => candidate.trim().toLowerCase() !== normalized),
        weak: current.weak.filter((candidate) => candidate.trim().toLowerCase() !== normalized)
      }));
      if (options.removeFromDraft) {
        removeDraftTag(cleaned);
      }
      await refreshTagSuggestions();
      setStatusMessage(`${response.suppressedTag.displayName} suppressed from suggestions.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to suppress tag.");
    } finally {
      setSuppressedTagInFlight(null);
    }
  }

  async function unsuppressTag(tag: SuppressedTag) {
    if (accessToken === null) {
      return;
    }

    setSuppressedTagInFlight(tag.normalizedName);
    setStatusMessage(null);
    try {
      await authedJson<{ suppressedTag: SuppressedTag | null }>(
        accessToken,
        `/api/tags/suppressed/${encodeURIComponent(tag.normalizedName)}`,
        { method: "DELETE" }
      );
      setSuppressedTags((current) => current.filter((item) => item.normalizedName !== tag.normalizedName));
      await refreshTagSuggestions();
      setStatusMessage(`${tag.displayName} restored to suggestions.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to restore suppressed tag.");
    } finally {
      setSuppressedTagInFlight(null);
    }
  }

  function handleTagInputChange(value: string) {
    if (value.includes(",")) {
      addDraftTags(parseTagsText(value));
      return;
    }
    updateDraft("tagInput", value);
  }

  function handleTagInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    addDraftTags(parseTagsText(event.currentTarget.value));
  }

  function handleWorkItemRowKeyDown(event: ReactKeyboardEvent<HTMLElement>, itemId: string) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    const currentIndex = filteredItems.findIndex((item) => item.id === itemId);
    if (currentIndex === -1) {
      return;
    }

    const nextIndex =
      event.key === "ArrowDown"
        ? Math.min(currentIndex + 1, filteredItems.length - 1)
        : Math.max(currentIndex - 1, 0);
    const nextItem = filteredItems[nextIndex];
    if (nextItem === undefined || nextItem.id === itemId) {
      return;
    }

    setSelectedItemId(nextItem.id);
    window.requestAnimationFrame(() => {
      workItemRowButtonRefs.current.get(nextItem.id)?.focus();
    });
  }

  function addWatchedFolder() {
    setWatchedSettingsSaved(false);
    setWatchedFolders((current) => [
      ...current,
      {
        id: `watch-${crypto.randomUUID()}`,
        path: "",
        archivePath: "",
        contributorName: "",
        recursive: false,
        enabled: true,
        stabilityMs: 3000
      }
    ]);
  }

  function updateWatchedFolder<Field extends keyof WatchedFolderSetting>(
    id: string,
    field: Field,
    value: WatchedFolderSetting[Field]
  ) {
    setWatchedSettingsSaved(false);
    setWatchedFolders((current) =>
      current.map((folder) => (folder.id === id ? { ...folder, [field]: value } : folder))
    );
  }

  async function pickWatchedFolderPath(id: string, field: "path" | "archivePath") {
    if (!isTauriRuntime) {
      setStatusMessage("Native folder picking is available in the Tauri desktop app.");
      return;
    }

    const currentPath = watchedFolders.find((folder) => folder.id === id)?.[field] ?? "";
    const label = field === "path" ? "watched folder" : "archive folder";
    try {
      const selectedPath = await invoke<string | null>("pick_folder", {
        title: field === "path" ? "Choose watched folder" : "Choose archive folder",
        defaultPath: currentPath.trim() === "" ? null : currentPath
      });
      if (selectedPath === null) {
        return;
      }
      updateWatchedFolder(id, field, selectedPath);
      setStatusMessage(`Selected ${label}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : `Unable to choose ${label}.`);
    }
  }

  function removeWatchedFolder(id: string) {
    setWatchedSettingsSaved(false);
    setWatchedFolders((current) => current.filter((folder) => folder.id !== id));
    setWatchedCandidates((current) => current.filter((candidate) => candidate.watchFolderId !== id));
  }

  function saveWatchedFolders() {
    localStorage.setItem(watchedSettingsStorageKey, JSON.stringify(watchedFolders));
    setWatchedSettingsSaved(true);
    setStatusMessage("Watched folders saved. Active watching will run while this app is open.");
  }

  async function scanWatchedFolders() {
    await runWatchedFolderScan("manual");
  }

  async function runWatchedFolderScan(mode: "manual" | "auto") {
    if (!isTauriRuntime) {
      if (mode === "manual") {
        setStatusMessage("Watched-folder scanning is available in the Tauri desktop app.");
      }
      return;
    }
    if (accessToken === null || machineId === null) {
      if (mode === "manual") {
        setStatusMessage("Sign in and machine identity are required before checking watched folders.");
      }
      return;
    }
    if (activeFileExtensions.length === 0) {
      if (mode === "manual") {
        setStatusMessage("Enable at least one file type before checking watched folders.");
      }
      return;
    }
    if (mode === "auto" && !watchedSettingsSaved) {
      return;
    }
    if (watchableFolders.length === 0) {
      if (mode === "manual") {
        setStatusMessage("Enable at least one watched folder with watched and archive paths before scanning.");
      }
      return;
    }
    if (watchScanInFlightRef.current) {
      if (mode === "manual") {
        setStatusMessage("Watched-folder scan is already running.");
      }
      return;
    }

    watchScanInFlightRef.current = true;
    setWatchScanInFlight(true);
    if (mode === "manual") {
      setStatusMessage(null);
    }
    try {
      const candidates = await invoke<WatchedFileCandidate[]>("scan_watched_folders", {
        folders: watchableFolders,
        enabledExtensions: activeFileExtensions
      });
      setWatchedCandidates(candidates);
      setCandidateStatuses({});
      const results: ImportCandidateResult[] = [];
      for (const candidate of candidates) {
        results.push(await importWatchedCandidate(candidate));
      }
      const importedCount = results.filter((result) => result.state === "imported").length;
      const duplicateCount = results.filter((result) => result.state === "duplicate").length;
      const errorResults = results.filter((result) => result.state === "error");
      setWatchedLastScanAt(new Date());
      setWatchedLastProcessedCount(importedCount + duplicateCount);
      if (mode === "manual" || candidates.length > 0) {
        if (errorResults.length > 0) {
          const firstError = errorResults[0] ?? { state: "error", filename: "unknown file", message: null };
          setStatusMessage(
            `${errorResults.length} of ${candidates.length} watched file${candidates.length === 1 ? "" : "s"} failed: ${firstError.filename}${firstError.message === null ? "" : ` - ${firstError.message}`}`
          );
        } else {
          const duplicateText =
            duplicateCount === 0 ? "" : `, ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}`;
          setStatusMessage(
            mode === "auto"
              ? `${importedCount} watched file${importedCount === 1 ? "" : "s"} imported automatically${duplicateText}.`
              : `${importedCount} stable watched file${importedCount === 1 ? "" : "s"} imported${duplicateText}.`
          );
        }
      }
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? mode === "auto"
            ? `Active folder watching paused: ${error.message}`
            : error.message
          : "Unable to check watched folders."
      );
    } finally {
      watchScanInFlightRef.current = false;
      setWatchScanInFlight(false);
    }
  }

  async function importWatchedCandidate(candidate: WatchedFileCandidate): Promise<ImportCandidateResult> {
    if (accessToken === null || machineId === null) {
      const message = "Sign in and machine identity are required before importing watched files.";
      setStatusMessage(message);
      return { state: "error", filename: candidate.filename, message };
    }

    const watchFolder = watchedFolders.find((folder) => folder.id === candidate.watchFolderId);
    if (watchFolder === undefined || watchFolder.archivePath.trim() === "") {
      const message = "Archive path is required before import.";
      setCandidateStatus(candidate.path, "error", message);
      return { state: "error", filename: candidate.filename, message };
    }

    setCandidateStatus(candidate.path, "importing", null);
    try {
      const bytes = new Uint8Array(await invoke<number[]>("read_watched_file", { path: candidate.path }));
      const contentHash = await sha256Digest(bytes);
      const fileType = activeFileTypeByExtension.get(candidate.extension.toLowerCase());
      const sourceType =
        fileType?.mediaKind === "audio"
          ? "watched_audio_file"
          : fileType?.mediaKind === "image"
            ? "watched_photo_file"
          : "watched_text_file";
      const uploadSession = await authedJson<UploadSessionResponse>(accessToken, "/api/imports/upload-sessions", {
        method: "POST",
        body: JSON.stringify({
          machineId,
          watchFolderId: candidate.watchFolderId,
          sourceType,
          originalFilename: candidate.filename,
          originalPath: candidate.path,
          originalFileModifiedAt: normalizeWatchedFileTimestamp(candidate.createdAt, candidate.modifiedAt),
          mimeType: mimeTypeForExtension(candidate.extension, fileType?.mediaKind),
          byteSize: bytes.byteLength,
          contentHash,
          contributorText: watchFolder.contributorName.trim() === "" ? null : watchFolder.contributorName.trim()
        })
      });

      if (uploadSession.status === "duplicate_exact") {
        await archiveImportedCandidate({
          token: accessToken,
          machineId,
          candidate,
          archiveRoot: watchFolder.archivePath,
          importEventId: requireValue(uploadSession.importEventId, "Duplicate response did not include an import event.")
        });
        setCandidateStatus(candidate.path, "duplicate", "Exact duplicate archived without creating a new work item.");
        return {
          state: "duplicate",
          filename: candidate.filename,
          message: "Exact duplicate archived without creating a new work item."
        };
      }

      const upload = requireValue(uploadSession.upload, "Upload session did not include upload instructions.");
      await authedFetch(accessToken, upload.url, {
        method: upload.method,
        headers: upload.headers,
        body: bytes
      });
      const finalized = await authedJson<FinalizeUploadSessionResponse>(
        accessToken,
        `/api/imports/upload-sessions/${encodeURIComponent(uploadSession.sessionId)}/finalize`,
        {
          method: "POST",
          body: JSON.stringify({ machineId, archivePlanned: true })
        }
      );
      await archiveImportedCandidate({
        token: accessToken,
        machineId,
        candidate,
        archiveRoot: watchFolder.archivePath,
        importEventId: finalized.importEventId
      });
      setCandidateStatus(
        candidate.path,
        "imported",
        finalized.processingJobs.length === 0
          ? "Imported for review. Parser support is still needed."
          : sourceType === "watched_audio_file"
            ? "Audio imported and queued for transcription."
            : sourceType === "watched_photo_file"
              ? "Photo imported and queued for preprocessing."
            : "Imported, finalized, and archived."
      );
      await refreshBucket();
      return { state: "imported", filename: candidate.filename, message: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      setCandidateStatus(candidate.path, "error", message);
      return { state: "error", filename: candidate.filename, message };
    }
  }

  async function loadAudioPlayback(artifactId: string) {
    if (accessToken === null) {
      return;
    }

    setAudioLoadState("loading");
    try {
      const response = await authedFetch(accessToken, `/api/artifacts/${encodeURIComponent(artifactId)}/download`);
      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      setAudioObjectUrl((current) => {
        if (current !== null) {
          URL.revokeObjectURL(current);
        }
        return nextUrl;
      });
      setAudioLoadState("ready");
    } catch (error) {
      setAudioLoadState("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to load audio artifact.");
    }
  }

  async function retryTranscription(jobId: string) {
    if (accessToken === null || selectedItem === null) {
      return;
    }

    try {
      await authedJson(accessToken, `/api/jobs/${encodeURIComponent(jobId)}/retry`, {
        method: "POST",
        body: JSON.stringify({ reason: "Manual retry from work item detail." })
      });
      const diagnostics = await authedJson<WorkItemDiagnostics>(
        accessToken,
        `/api/work-items/${encodeURIComponent(selectedItem.id)}/diagnostics`
      );
      setSelectedDiagnostics(diagnostics);
      setStatusMessage("Transcription retry queued.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to retry transcription.");
    }
  }

  async function runWorkItemTask(task: SettingsSummary["aiTasks"][number]) {
    if (accessToken === null || selectedItem === null) {
      return;
    }
    if (hasDraftChanges) {
      setStatusMessage("Save or reset edits before running a work item task.");
      return;
    }
    if (!task.runtimeReady) {
      setStatusMessage(task.unavailableReason ?? `${task.displayName} is not ready.`);
      return;
    }
    setWorkItemTaskIdInFlight(task.id);
    setStatusMessage(null);
    try {
      const response = await authedJson<{
        taskResultType: "expanded_memo" | "suggested_work_items";
        expandedWorkItem: { title: string; body: string; tags: string[] } | null;
        suggestedWorkItems: SuggestedWorkItemCandidate[];
        suggestions: unknown[];
        providerName: string;
        modelName: string;
      }>(accessToken, `/api/work-items/${encodeURIComponent(selectedItem.id)}/tasks/${encodeURIComponent(task.id)}/run`, {
        method: "POST",
        body: JSON.stringify({})
      });
      if (response.taskResultType === "expanded_memo" && response.expandedWorkItem !== null) {
        setExpandedMemoReview({
          title: response.expandedWorkItem.title,
          body: response.expandedWorkItem.body,
          tags: response.expandedWorkItem.tags,
          providerName: response.providerName,
          modelName: response.modelName,
          taskDisplayName: task.displayName
        });
        setStatusMessage(`${task.displayName} generated a memo draft for review.`);
      } else if (response.taskResultType === "suggested_work_items") {
        setSuggestedWorkItemReview({
          parentWorkItemId: selectedItem.id,
          taskDisplayName: task.displayName,
          candidates: response.suggestedWorkItems
        });
        setStatusMessage(`${task.displayName} generated ${formatItemCount(response.suggestedWorkItems.length)} for review.`);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : `Unable to run ${task.displayName}.`);
    } finally {
      setWorkItemTaskIdInFlight(null);
    }
  }

  function acceptExpandedMemoReview() {
    if (expandedMemoReview === null) {
      return;
    }
    setDraft((current) =>
      current === null
        ? current
        : {
            ...current,
            title: expandedMemoReview.title,
            body: expandedMemoReview.body
          }
    );
    setExpandedMemoReview(null);
    setStatusMessage("Expanded memo staged in the draft. Save applies it.");
  }

  async function acceptSuggestedWorkItem(candidate: SuggestedWorkItemCandidate) {
    if (accessToken === null) {
      return;
    }
    const parentWorkItemId = suggestedWorkItemReview?.parentWorkItemId ?? candidate.parentWorkItemId;
    setSuggestionIdInFlight(candidate.id);
    setStatusMessage(null);
    try {
      await authedJson<{ workItem: WorkItem }>(
        accessToken,
        `/api/work-items/${encodeURIComponent(parentWorkItemId)}/suggested-work-items/accept`,
        {
          method: "POST",
          body: JSON.stringify({ candidate })
        }
      );
      setSuggestedWorkItemReview((current) =>
        current === null
          ? current
          : {
              ...current,
              candidates: current.candidates.filter((item) => item.id !== candidate.id)
            }
      );
      await refreshBucket();
      setSelectedItemId(parentWorkItemId);
      setStatusMessage("Suggested work item accepted as a new memo.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to accept suggested work item.");
    } finally {
      setSuggestionIdInFlight(null);
    }
  }

  function rejectSuggestedWorkItem(candidateId: string) {
    setSuggestedWorkItemReview((current) =>
      current === null
        ? current
        : {
            ...current,
            candidates: current.candidates.filter((candidate) => candidate.id !== candidateId)
          }
    );
    setStatusMessage("Suggested work item rejected.");
  }

  function updateAiTaskRouteDraft<Field extends keyof AiTaskRouteDraft>(
    taskId: string,
    field: Field,
    value: AiTaskRouteDraft[Field]
  ) {
    setAiTaskRouteDrafts((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? {
          displayName: "",
          description: "",
          hookKey: "",
          renderLocation: "work_item_detail",
          displayOrder: 0,
          providerConfigId: "",
          modelName: "",
          promptsEnabled: false,
          enabled: false
        }),
        [field]: value
      }
    }));
  }

  function updateNewAiTaskDraft<Field extends keyof NewAiTaskDraft>(field: Field, value: NewAiTaskDraft[Field]) {
    setNewAiTaskDraft((current) => {
      const next = { ...current, [field]: value };
      if (
        field === "promptsEnabled" &&
        value === true &&
        Object.values(defaultSystemMessagesByHook).includes(current.promptDraft.systemMessage)
      ) {
        next.promptDraft = {
          ...current.promptDraft,
          systemMessage: defaultSystemMessageForHook(current.hookKey)
        };
      }
      return next;
    });
  }

  function updateNewAiTaskPromptDraft<Field extends keyof PromptDraft>(field: Field, value: PromptDraft[Field]) {
    setNewAiTaskDraft((current) => ({
      ...current,
      promptDraft: {
        ...current.promptDraft,
        [field]: value
      }
    }));
  }

  async function createProcessingHook() {
    if (accessToken === null) {
      return;
    }
    if (newProcessingHookKey.trim() === "") {
      setStatusMessage("Hook key is required.");
      return;
    }
    setProcessingHookCreateInFlight(true);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, "/api/settings/processing-hooks", {
        method: "POST",
        body: JSON.stringify({ hookKey: newProcessingHookKey })
      });
      setNewProcessingHookKey("");
      await loadSettings(accessToken);
      setStatusMessage("Processing hook created.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to create processing hook.");
    } finally {
      setProcessingHookCreateInFlight(false);
    }
  }

  async function deleteProcessingHook(hook: SettingsSummary["registeredTaskHooks"][number]) {
    if (accessToken === null) {
      return;
    }
    setProcessingHookKeyInFlight(hook.hookKey);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/settings/processing-hooks/${encodeURIComponent(hook.hookKey)}`, {
        method: "DELETE"
      });
      await loadSettings(accessToken);
      setStatusMessage("Processing hook deleted.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to delete processing hook.");
    } finally {
      setProcessingHookKeyInFlight(null);
    }
  }

  async function createAiTaskDefinition() {
    if (accessToken === null) {
      return;
    }
    if (newAiTaskDraft.displayName.trim() === "" || newAiTaskDraft.hookKey.trim() === "") {
      setStatusMessage("Task name and hook key are required.");
      return;
    }
    if (newAiTaskDraft.promptsEnabled && newAiTaskDraft.promptDraft.freeformText.trim() === "") {
      setStatusMessage("Prompt text is required when prompts are enabled.");
      return;
    }
    setAiTaskCreateInFlight(true);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, "/api/settings/ai-tasks", {
        method: "POST",
        body: JSON.stringify({
          displayName: newAiTaskDraft.displayName,
          description: newAiTaskDraft.description,
          hookKey: newAiTaskDraft.hookKey,
          renderLocation: newAiTaskDraft.renderLocation,
          displayOrder: newAiTaskDraft.displayOrder,
          providerConfigId: newAiTaskDraft.providerConfigId === "" ? null : newAiTaskDraft.providerConfigId,
          modelName: newAiTaskDraft.modelName,
          promptsEnabled: newAiTaskDraft.promptsEnabled,
          initialPromptText: newAiTaskDraft.promptsEnabled
            ? newAiTaskDraft.promptDraft.freeformText
            : undefined,
          initialSystemMessage: newAiTaskDraft.promptsEnabled
            ? newAiTaskDraft.promptDraft.systemMessage
            : undefined,
          includeProjectSynopsis: newAiTaskDraft.promptDraft.includeProjectSynopsis,
          includeMemoMetadata: newAiTaskDraft.promptDraft.includeMemoMetadata,
          includeMemoTranscriptText: newAiTaskDraft.promptDraft.includeMemoTranscriptText,
          enabled: newAiTaskDraft.enabled
        })
      });
      setNewAiTaskDraft(defaultNewAiTaskDraft);
      await loadSettings(accessToken);
      setStatusMessage("Task added.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to add task.");
    } finally {
      setAiTaskCreateInFlight(false);
    }
  }

  async function saveAiTaskRoute(taskId: string) {
    if (accessToken === null) {
      return;
    }
    const draft = aiTaskRouteDrafts[taskId];
    if (draft === undefined) {
      return;
    }
    const task = settingsSummary?.aiTasks.find((candidate) => candidate.id === taskId);
    const prompt = task?.prompt ?? null;
    const promptDraft = prompt === null ? null : promptDrafts[prompt.id];
    if (draft.promptsEnabled && promptDraft !== null && promptDraft !== undefined && promptDraft.freeformText.trim() === "") {
      setStatusMessage("Prompt text is required when prompts are enabled.");
      return;
    }
    setAiTaskIdInFlight(taskId);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/settings/ai-tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: draft.displayName,
          description: draft.description,
          hookKey: draft.hookKey,
          renderLocation: draft.renderLocation,
          displayOrder: draft.displayOrder,
          providerConfigId: draft.providerConfigId === "" ? null : draft.providerConfigId,
          modelName: draft.modelName,
          promptsEnabled: draft.promptsEnabled,
          ...(draft.promptsEnabled && promptDraft !== null && promptDraft !== undefined
            ? {
                body: promptDraft.freeformText,
                freeformText: promptDraft.freeformText,
                systemMessage: promptDraft.systemMessage,
                includeProjectSynopsis: promptDraft.includeProjectSynopsis,
                includeMemoMetadata: promptDraft.includeMemoMetadata,
                includeMemoTranscriptText: promptDraft.includeMemoTranscriptText,
                outputSchema: prompt?.outputSchema ?? {}
              }
            : {}),
          enabled: draft.enabled
        })
      });
      await loadSettings(accessToken);
      setStatusMessage("Task saved. Relaunch from AppLauncher if runtime options changed.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to save task.");
    } finally {
      setAiTaskIdInFlight(null);
    }
  }

  async function deleteAiTaskDefinition(task: SettingsSummary["aiTasks"][number]) {
    if (accessToken === null) {
      return;
    }
    setAiTaskIdInFlight(task.id);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/settings/ai-tasks/${encodeURIComponent(task.id)}`, {
        method: "DELETE"
      });
      await loadSettings(accessToken);
      setStatusMessage("Task deleted.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to delete task.");
    } finally {
      setAiTaskIdInFlight(null);
    }
  }

  async function toggleFileType(fileTypeId: string, active: boolean) {
    if (accessToken === null) {
      return;
    }
    setFileTypeIdInFlight(fileTypeId);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/settings/file-types/${encodeURIComponent(fileTypeId)}`, {
        method: "PATCH",
        body: JSON.stringify({ active })
      });
      await loadSettings(accessToken);
      setStatusMessage(active ? "File type enabled." : "File type disabled.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to update file type.");
    } finally {
      setFileTypeIdInFlight(null);
    }
  }

  function updateMediaTypeDraft<Field extends keyof MediaTypeDraft>(
    mediaTypeId: string,
    field: Field,
    value: MediaTypeDraft[Field]
  ) {
    setMediaTypeDrafts((current) => ({
      ...current,
      [mediaTypeId]: {
        ...(current[mediaTypeId] ?? defaultNewMediaTypeDraft),
        [field]: value
      }
    }));
  }

  function updateParserTypeDraft<Field extends keyof ParserTypeDraft>(
    parserTypeId: string,
    field: Field,
    value: ParserTypeDraft[Field]
  ) {
    setParserTypeDrafts((current) => ({
      ...current,
      [parserTypeId]: {
        ...(current[parserTypeId] ?? defaultNewParserTypeDraft),
        [field]: value
      }
    }));
  }

  function updateFileTypeDraft<Field extends keyof FileTypeDraft>(
    fileTypeId: string,
    field: Field,
    value: FileTypeDraft[Field]
  ) {
    setFileTypeDrafts((current) => ({
      ...current,
      [fileTypeId]: {
        ...(current[fileTypeId] ?? { mediaKind: "text", parserKey: "", capabilityState: "inactive" }),
        [field]: value,
        ...(field === "mediaKind" ? { parserKey: "" } : {})
      }
    }));
  }

  function updateNewFileTypeDraft<Field extends keyof NewFileTypeDraft>(
    field: Field,
    value: NewFileTypeDraft[Field]
  ) {
    setNewFileTypeDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === "mediaKind") {
        next.parserKey = "";
      }
      return next;
    });
  }

  function updateNewMediaTypeDraft<Field extends keyof MediaTypeDraft>(field: Field, value: MediaTypeDraft[Field]) {
    setNewMediaTypeDraft((current) => ({ ...current, [field]: value }));
  }

  function updateNewParserTypeDraft<Field extends keyof ParserTypeDraft>(
    field: Field,
    value: ParserTypeDraft[Field]
  ) {
    setNewParserTypeDraft((current) => ({ ...current, [field]: value }));
  }

  async function createMediaType() {
    if (accessToken === null) {
      return;
    }
    setMediaTypeCreateInFlight(true);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, "/api/settings/media-types", {
        method: "POST",
        body: JSON.stringify(newMediaTypeDraft)
      });
      setNewMediaTypeDraft(defaultNewMediaTypeDraft);
      await loadSettings(accessToken);
      setStatusMessage("Media type added.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to add media type.");
    } finally {
      setMediaTypeCreateInFlight(false);
    }
  }

  async function saveMediaType(mediaTypeId: string) {
    if (accessToken === null) {
      return;
    }
    const draft = mediaTypeDrafts[mediaTypeId];
    if (draft === undefined) {
      return;
    }
    setMediaTypeIdInFlight(mediaTypeId);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/settings/media-types/${encodeURIComponent(mediaTypeId)}`, {
        method: "PATCH",
        body: JSON.stringify(draft)
      });
      await loadSettings(accessToken);
      setStatusMessage("Media type saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to save media type.");
    } finally {
      setMediaTypeIdInFlight(null);
    }
  }

  async function deleteMediaType(mediaType: MediaTypeSetting) {
    if (accessToken === null || !window.confirm(`Remove media type "${mediaType.displayName}"?`)) {
      return;
    }
    setMediaTypeIdInFlight(mediaType.id);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/settings/media-types/${encodeURIComponent(mediaType.id)}`, {
        method: "DELETE"
      });
      await loadSettings(accessToken);
      setStatusMessage("Media type removed.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to remove media type.");
    } finally {
      setMediaTypeIdInFlight(null);
    }
  }

  async function createParserType() {
    if (accessToken === null) {
      return;
    }
    setParserTypeCreateInFlight(true);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, "/api/settings/parser-types", {
        method: "POST",
        body: JSON.stringify(newParserTypeDraft)
      });
      setNewParserTypeDraft(defaultNewParserTypeDraft);
      await loadSettings(accessToken);
      setStatusMessage("Parser type added.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to add parser type.");
    } finally {
      setParserTypeCreateInFlight(false);
    }
  }

  async function saveParserType(parserTypeId: string) {
    if (accessToken === null) {
      return;
    }
    const draft = parserTypeDrafts[parserTypeId];
    if (draft === undefined) {
      return;
    }
    setParserTypeIdInFlight(parserTypeId);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/settings/parser-types/${encodeURIComponent(parserTypeId)}`, {
        method: "PATCH",
        body: JSON.stringify(draft)
      });
      await loadSettings(accessToken);
      setStatusMessage("Parser type saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to save parser type.");
    } finally {
      setParserTypeIdInFlight(null);
    }
  }

  async function deleteParserType(parserType: ParserTypeSetting) {
    if (accessToken === null || !window.confirm(`Remove parser type "${parserType.displayName}"?`)) {
      return;
    }
    setParserTypeIdInFlight(parserType.id);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/settings/parser-types/${encodeURIComponent(parserType.id)}`, {
        method: "DELETE"
      });
      await loadSettings(accessToken);
      setStatusMessage("Parser type removed.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to remove parser type.");
    } finally {
      setParserTypeIdInFlight(null);
    }
  }

  async function saveFileType(fileTypeId: string) {
    if (accessToken === null) {
      return;
    }
    const draft = fileTypeDrafts[fileTypeId];
    if (draft === undefined) {
      return;
    }
    setFileTypeIdInFlight(fileTypeId);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/settings/file-types/${encodeURIComponent(fileTypeId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          mediaKind: draft.mediaKind,
          parserKey: draft.parserKey === "" ? null : draft.parserKey,
          capabilityState: draft.capabilityState
        })
      });
      await loadSettings(accessToken);
      setStatusMessage("File type saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to save file type.");
    } finally {
      setFileTypeIdInFlight(null);
    }
  }

  async function createFileType() {
    if (accessToken === null) {
      return;
    }
    const extension = newFileTypeDraft.extension.trim();
    if (extension === "") {
      setStatusMessage("Extension is required.");
      return;
    }
    setFileTypeCreateInFlight(true);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, "/api/settings/file-types", {
        method: "POST",
        body: JSON.stringify({
          extension,
          mediaKind: newFileTypeDraft.mediaKind,
          parserKey: newFileTypeDraft.parserKey === "" ? null : newFileTypeDraft.parserKey,
          capabilityState: newFileTypeDraft.capabilityState
        })
      });
      setNewFileTypeDraft(defaultNewFileTypeDraft);
      await loadSettings(accessToken);
      setStatusMessage("File type added.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to add file type.");
    } finally {
      setFileTypeCreateInFlight(false);
    }
  }

  async function deleteFileType(fileType: FileTypeSetting) {
    if (accessToken === null || !window.confirm(`Remove file type "${fileType.extension}"?`)) {
      return;
    }
    setFileTypeIdInFlight(fileType.id);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/settings/file-types/${encodeURIComponent(fileType.id)}`, {
        method: "DELETE"
      });
      await loadSettings(accessToken);
      setStatusMessage("File type removed.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to remove file type.");
    } finally {
      setFileTypeIdInFlight(null);
    }
  }

  function updatePromptDraft(promptId: string, field: keyof PromptDraft, value: string | boolean) {
    setPromptDrafts((current) => ({
      ...current,
      [promptId]: {
        ...(current[promptId] ?? {
          freeformText: "",
          systemMessage: defaultSystemMessage,
          includeProjectSynopsis: true,
          includeMemoMetadata: true,
          includeMemoTranscriptText: true
        }),
        [field]: value
      }
    }));
  }

  function restoreNewTaskSystemMessageDefault() {
    updateNewAiTaskPromptDraft("systemMessage", defaultSystemMessageForHook(newAiTaskDraft.hookKey));
  }

  function restoreTaskSystemMessageDefault(task: SettingsSummary["aiTasks"][number]) {
    if (task.prompt === null) {
      return;
    }
    updatePromptDraft(task.prompt.id, "systemMessage", defaultSystemMessageForHook(task.hookKey));
  }

  function addNewProjectDraft() {
    const draftId = `new-project-${nextProjectDraftId.current}`;
    nextProjectDraftId.current += 1;
    setNewProjectDrafts((current) => [...current, { id: draftId, form: createEmptyProjectForm() }]);
  }

  function updateNewProjectDraft(draftId: string, field: keyof ProjectFormState, value: string) {
    setNewProjectDrafts((current) =>
      current.map((draftProject) =>
        draftProject.id === draftId
          ? {
              ...draftProject,
              form: {
                ...draftProject.form,
                [field]: value
              }
            }
          : draftProject
      )
    );
  }

  function discardNewProjectDraft(draftId: string) {
    setNewProjectDrafts((current) => current.filter((draftProject) => draftProject.id !== draftId));
  }

  function updateProjectDraft(projectId: string, field: keyof ProjectFormState, value: string) {
    setProjectDrafts((current) => ({
      ...current,
      [projectId]: {
        ...(current[projectId] ?? createEmptyProjectForm()),
        [field]: value
      }
    }));
  }

  async function saveProjectConfig() {
    if (accessToken === null) {
      return;
    }
    const threshold = Number.parseFloat(projectThresholdDraft);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      setStatusMessage("Confidence must be from 0 to 1.");
      return;
    }

    const extraction = settingsSummary?.extraction ?? defaultExtractionSettings;
    setProjectConfigSaving(true);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, "/api/settings/extraction", {
        method: "PATCH",
        body: JSON.stringify({
          projectConfidenceThreshold: threshold,
          contributorConfidenceThreshold: extraction.contributorConfidenceThreshold,
          tagConfidenceThreshold: extraction.tagConfidenceThreshold
        })
      });
      await loadSettings(accessToken);
      setStatusMessage("Project config saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to save project config.");
    } finally {
      setProjectConfigSaving(false);
    }
  }

  async function createProject(draftId: string) {
    if (accessToken === null) {
      return;
    }
    const draftProject = newProjectDrafts.find((candidate) => candidate.id === draftId);
    if (draftProject === undefined) {
      return;
    }
    if (draftProject.form.name.trim() === "") {
      setStatusMessage("Project name is required.");
      return;
    }

    setProjectIdInFlight(draftId);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, "/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: draftProject.form.name,
          description: draftProject.form.description
        })
      });
      discardNewProjectDraft(draftId);
      await loadProjects(accessToken);
      setStatusMessage("Project created.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to create project.");
    } finally {
      setProjectIdInFlight(null);
    }
  }

  async function saveProject(projectId: string) {
    if (accessToken === null) {
      return;
    }
    const projectDraft = projectDrafts[projectId];
    if (projectDraft === undefined) {
      return;
    }
    if (projectDraft.name.trim() === "") {
      setStatusMessage("Project name is required.");
      return;
    }

    setProjectIdInFlight(projectId);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: projectDraft.name,
          description: projectDraft.description
        })
      });
      await loadProjects(accessToken);
      setStatusMessage("Project saved.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to save project.");
    } finally {
      setProjectIdInFlight(null);
    }
  }

  async function deactivateProject(projectId: string) {
    if (accessToken === null) {
      return;
    }

    setProjectIdInFlight(projectId);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/projects/${encodeURIComponent(projectId)}/deactivate`, {
        method: "POST"
      });
      await loadProjects(accessToken);
      setStatusMessage("Project deactivated.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to deactivate project.");
    } finally {
      setProjectIdInFlight(null);
    }
  }

  async function deleteProject(project: Project) {
    if (accessToken === null) {
      return;
    }

    setProjectIdInFlight(project.id);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/projects/${encodeURIComponent(project.id)}`, {
        method: "DELETE"
      });
      await loadProjects(accessToken);
      setStatusMessage("Project deleted.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to delete project.");
    } finally {
      setProjectIdInFlight(null);
    }
  }

  function refreshCurrentView() {
    void (activeView === "exports"
      ? loadExports()
      : activeView === "projects"
      ? loadProjects()
      : activeView === "settings"
      ? loadSettings()
      : activeView === "audit"
      ? loadAuditEvents()
      : refreshBucket());
  }

  function handlePanelResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = detailPanelWidth;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = startWidth - (moveEvent.clientX - startX);
      setDetailPanelWidth(Math.min(920, Math.max(360, nextWidth)));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function handlePanelResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    setDetailPanelWidth((current) => {
      const delta = event.key === "ArrowLeft" ? 32 : -32;
      return Math.min(920, Math.max(360, current + delta));
    });
  }

  function openPhotoViewer(workItem: WorkItem) {
    setPhotoViewer({ workItemId: workItem.id, title: workItem.title });
  }

  function closePhotoViewer() {
    setPhotoViewer(null);
  }

  function updatePhotoGalleryScrollState() {
    const gallery = photoGalleryRef.current;
    if (gallery === null) {
      setPhotoGalleryScrollState({ canScrollLeft: false, canScrollRight: false });
      return;
    }

    setPhotoGalleryScrollState({
      canScrollLeft: gallery.scrollLeft > 1,
      canScrollRight: gallery.scrollLeft + gallery.clientWidth < gallery.scrollWidth - 1
    });
  }

  function scrollPhotoGallery(direction: "left" | "right") {
    const gallery = photoGalleryRef.current;
    if (gallery === null) {
      return;
    }

    gallery.scrollBy({
      left: direction === "left" ? -gallery.clientWidth : gallery.clientWidth,
      behavior: "smooth"
    });
    window.setTimeout(updatePhotoGalleryScrollState, 220);
  }

  function handlePhotoModalKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePhotoViewer();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      scrollPhotoGallery(event.key === "ArrowLeft" ? "left" : "right");
    }
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setStatusMessage(`${label} copied.`);
  }

  async function saveManualTranscript() {
    if (accessToken === null || selectedItem === null || draft === null || draft.body.trim() === "") {
      return;
    }

    setTranscriptSaving(true);
    setStatusMessage(null);
    try {
      const response = await authedJson<{ workItem: WorkItem }>(
        accessToken,
        `/api/work-items/${encodeURIComponent(selectedItem.id)}/manual-transcript`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: selectedItem.workflowItemVersion,
            title: draft.title,
            transcriptText: draft.body
          })
        }
      );
      setSelectedItem(response.workItem);
      setDraft(createDraft(response.workItem));
      await refreshBucket();
      const diagnostics = await authedJson<WorkItemDiagnostics>(
        accessToken,
        `/api/work-items/${encodeURIComponent(response.workItem.id)}/diagnostics`
      );
      setSelectedDiagnostics(diagnostics);
      setStatusMessage("Manual transcript saved as a derived artifact.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const current = error.body.error?.details?.workItem;
        if (current !== undefined) {
          setSelectedItem(current);
          setDraft(createDraft(current));
        }
      }
      setStatusMessage(error instanceof Error ? error.message : "Unable to save manual transcript.");
    } finally {
      setTranscriptSaving(false);
    }
  }

  function setCandidateStatus(path: string, state: ImportCandidateState, message: string | null) {
    setCandidateStatuses((current) => ({ ...current, [path]: { state, message } }));
  }

  if (loadState === "loading") {
    return (
      <main className="center-stage">
        <RefreshCcw className="spin" size={22} />
        <span>Loading work queue</span>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="center-stage">
        <AlertTriangle size={24} />
        <strong>Work queue unavailable</strong>
        <p>{statusMessage}</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">MC</div>
          <div className="brand-copy">
            <div className="brand-title-row">
              <p className="brand-name">Memo Capture</p>
              <span className="brand-version">v{appVersion}</span>
              <button
                className="theme-toggle"
                type="button"
                title={themeMode === "light" ? "Switch to dark mode" : "Switch to light mode"}
                aria-label={themeMode === "light" ? "Switch to dark mode" : "Switch to light mode"}
                onClick={() => setThemeMode((current) => (current === "light" ? "dark" : "light"))}
              >
                {themeMode === "light" ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </div>
            <p className="brand-meta">{session?.user.displayName ?? session?.user.email ?? "Signed in"}</p>
          </div>
        </div>

        <nav className="top-nav" aria-label="Primary navigation">
          {primaryNavigation.map((item) => (
            <button
              className={`top-nav-tab ${activeView === item.id ? "active" : ""}`}
              type="button"
              key={item.id}
              onClick={() => setActiveView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="workspace" aria-label={pageTitle}>
        <header className="workspace-header">
          <div>
            <div className="workspace-title-row">
              <h1>{pageTitle}</h1>
              {activeView === "projects" ? (
                <div className="project-summary-row header-project-summary" aria-label="Project counts">
                  <span>{projects.length} total</span>
                  <span>{activeProjectCount} active</span>
                  <span>{inactiveProjectCount} inactive</span>
                  {newProjectDrafts.length > 0 ? <span>{newProjectDrafts.length} draft</span> : null}
                </div>
              ) : null}
            </div>
            {pageDescription === "" ? null : <p>{pageDescription}</p>}
          </div>
          <div className="workspace-header-actions">
            {activeView === "projects" ? (
              <button
                className="primary-button"
                type="button"
                title="+ Create"
                aria-label="+ Create project"
                onClick={addNewProjectDraft}
              >
                <Plus size={18} />
                Create
              </button>
            ) : null}
            <button
              className="icon-button"
              type="button"
              title="Refresh current view"
              aria-label="Refresh current view"
              onClick={refreshCurrentView}
            >
              {activeView === "settings" && settingsLoading ? (
                <RefreshCcw className="spin" size={18} />
              ) : activeView === "projects" && projectsLoading ? (
                <RefreshCcw className="spin" size={18} />
              ) : activeView === "audit" && auditLoading ? (
                <RefreshCcw className="spin" size={18} />
              ) : (
                <RefreshCcw size={18} />
              )}
            </button>
          </div>
        </header>

        {statusMessage !== null ? (
          <div className={`status-banner ${saveState === "conflict" ? "warning" : ""}`} role="status">
            <AlertTriangle size={18} />
            <span>{statusMessage}</span>
          </div>
        ) : null}

        {activeView === "work-items" ? (
          <div className="toolbar search-toolbar" role="search">
            <label htmlFor="work-item-search">{activeBucketIsPhotos ? "Search photos" : "Search work items"}</label>
            <div className="search-field">
              <Search size={18} />
              <input
                id="work-item-search"
                placeholder="Title, body, project, tags, or contributor"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
            </div>
            <div className={`work-queue-status sync-${workQueueSyncState}`} aria-label="Work queue status">
              {workQueueStatusItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        ) : activeView === "exports" ? (
          <div className="toolbar export-toolbar" role="search">
            <label htmlFor="export-search">Search snapshots</label>
            <div className="search-field">
              <Search size={18} />
              <input
                id="export-search"
                placeholder="Title, project, tags, or contributor"
                value={exportSearch}
                onChange={(event) => setExportSearch(event.currentTarget.value)}
              />
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => selectAllFilteredExports(selectedExportCount !== filteredExportSnapshots.length)}
            >
              <Check size={18} />
              {selectedExportCount === filteredExportSnapshots.length ? "Clear filtered" : "Select filtered"}
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={selectedExportSnapshotIds.size === 0 || exportCreating}
              onClick={() => void createExportBatch()}
            >
              {exportCreating ? <RefreshCcw className="spin" size={18} /> : <PackagePlus size={18} />}
              Create batch
            </button>
          </div>
        ) : activeView === "audit" ? (
          <div className="toolbar settings-toolbar" role="search">
            <label htmlFor="audit-filter">Audit event name</label>
            <div className="search-field">
              <Search size={18} />
              <input
                id="audit-filter"
                placeholder="Exact event name"
                value={auditFilter}
                onChange={(event) => setAuditFilter(event.currentTarget.value)}
              />
            </div>
            <button className="secondary-button" type="button" onClick={() => void loadAuditEvents()}>
              {auditLoading ? <RefreshCcw className="spin" size={18} /> : <RefreshCcw size={18} />}
              Apply filter
            </button>
          </div>
        ) : null}

        {activeView === "work-items" ? (
        <div
          className="content-grid"
          style={{ "--detail-panel-width": `${detailPanelWidth}px` } as CSSProperties}
        >
          <aside className="scope-rail" aria-label="Workflow buckets">
            <div className="scope-rail-header">
              <strong>{selectedBucket?.label ?? "None"}</strong>
            </div>
            <nav className="bucket-list" aria-label="Workflow buckets">
              {buckets.map((bucket) => (
                <button
                  className={`bucket-button ${bucket.id === activeBucketId ? "active" : ""}`}
                  type="button"
                  key={bucket.id}
                  onClick={() => {
                    setActiveView("work-items");
                    void selectBucket(bucket.id);
                  }}
                >
                  <span>{bucket.label}</span>
                  <span className="bucket-count">{bucket.count ?? 0}</span>
                </button>
              ))}
            </nav>
          </aside>

          <section className="item-list" aria-label="Filtered work items">
            {activeBucketIsPhotos ? (
              <>
                {filteredPhotoImports.length === 0 ? null : (
                  <div className="item-list-header photo-list-header" aria-hidden="true">
                    <span>Photo / Metadata</span>
                  </div>
                )}
                {filteredPhotoImports.length === 0 ? (
                  <div className="empty-state">
                    <CircleSlash size={20} />
                    <span>No photos available</span>
                  </div>
                ) : null}
                {filteredPhotoImports.map((photoImport) => {
                  const checked = selectedPhotoImportIds.has(photoImport.id);
                  const available = photoImport.status === "available";
                  const thumbnailUrl = photoThumbnailUrls[photoImport.id] ?? null;
                  return (
                    <article
                      className={`item-row photo-row ${checked ? "selected" : ""} ${available ? "" : "disabled"}`}
                      key={photoImport.id}
                    >
                      <label className="photo-row-select">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!available}
                          onChange={(event) => togglePhotoImportSelection(photoImport, event.currentTarget.checked)}
                        />
                        <span className="photo-thumb">
                          {thumbnailUrl === null ? (
                            <Image size={20} />
                          ) : (
                            <img src={thumbnailUrl} alt="" loading="lazy" />
                          )}
                        </span>
                        <span className="photo-row-main">
                          <strong>{photoImport.originalFilename}</strong>
                          <span>
                            {photoImport.capturedAt === null ? "No captured date" : formatDate(photoImport.capturedAt)}
                          </span>
                        </span>
                      </label>
                      <span className={`item-row-state state-chip state-${photoImport.status}`}>
                        {statusLabel(photoImport.status)}
                      </span>
                      <div className="photo-row-metadata">
                        <span>{[photoImport.cameraMake, photoImport.cameraModel].filter(Boolean).join(" ") || "No camera"}</span>
                        <span>{photoImport.gpsLatitude === null || photoImport.gpsLongitude === null ? "No GPS" : "GPS"}</span>
                        {photoImport.preprocessingErrorMessage === null ? null : (
                          <span className="error-text">{photoImport.preprocessingErrorMessage}</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </>
            ) : (
              <>
            {filteredItems.length === 0 ? null : (
              <div className="item-list-header" aria-hidden="true">
                <span>Title / Body</span>
              </div>
            )}
            {filteredItems.length === 0 ? (
              <div className="empty-state">
                <CircleSlash size={20} />
                <span>No work items in this bucket</span>
              </div>
            ) : null}

            {filteredItems.map((item) => {
              const rowActions = rowActionsByItemId[item.id] ?? [];
              return (
                <article
                  className={`item-row ${item.id === selectedItemId ? "selected" : ""}`}
                  key={item.id}
                  onKeyDown={(event) => handleWorkItemRowKeyDown(event, item.id)}
                >
                  <button
                    className="item-row-select"
                    type="button"
                    ref={(element) => {
                      if (element === null) {
                        workItemRowButtonRefs.current.delete(item.id);
                        return;
                      }
                      workItemRowButtonRefs.current.set(item.id, element);
                    }}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <div className="item-row-main">
                      <div className="item-title-line">
                        <FileText size={18} />
                        <h2>{item.title}</h2>
                        {item.photoAttachmentCount > 0 ? (
                          <span
                            className="photo-attachment-indicator"
                            aria-label={`${item.photoAttachmentCount} attached photos`}
                            title={`${item.photoAttachmentCount} attached photos`}
                          >
                            <Camera size={14} aria-hidden="true" />
                            <span>{item.photoAttachmentCount}</span>
                          </span>
                        ) : null}
                        <p>{item.body}</p>
                      </div>
                    </div>
                  </button>
                  <span className={`item-row-state state-chip state-${item.workflowState}`}>
                    {stateLabel(item.workflowState)}
                  </span>
                  <button
                    className="item-row-meta-select"
                    type="button"
                    onClick={() => setSelectedItemId(item.id)}
                    aria-label={`Select ${item.title}`}
                  >
                    <span className="item-project">{projectById.get(item.projectId ?? "")?.name ?? "No project"}</span>
                    <span className="updated-time">{formatDate(item.originalFileModifiedAt ?? item.createdAt)}</span>
                  </button>
                  <div className="row-action-groups" aria-label={`Workflow actions for ${item.title}`}>
                    {rowActions.length === 0 ? <span className="row-action-empty">No actions</span> : null}
                    {rowActions.map((action) => {
                      const intent = workflowActionIntent(action);
                      const actionInFlightKey = `${item.id}:${action.id}`;
                      return (
                        <button
                          className={`row-action-button ${intent}${hasDraftChanges ? " blocked" : ""}`}
                          type="button"
                          key={action.id}
                          title={
                            hasDraftChanges
                              ? "Save or reset the selected item before running workflow actions"
                              : workflowActionTitle(action)
                          }
                          aria-disabled={hasDraftChanges}
                          disabled={actionIdInFlight !== null}
                          onClick={() => runAction(action, item)}
                        >
                          {actionInFlightKey === actionIdInFlight ? (
                            <RefreshCcw className="spin" size={16} />
                          ) : intent === "danger" || intent === "warning" ? (
                            <AlertTriangle size={16} />
                          ) : (
                            <CheckCircle2 size={16} />
                          )}
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                </article>
              );
            })}
              </>
            )}
          </section>

          <div
            className="panel-resizer"
            role="separator"
            aria-label="Resize list and detail panels"
            aria-orientation="vertical"
            title="Drag or use arrow keys to resize the list and detail panels"
            tabIndex={0}
            onPointerDown={handlePanelResizeStart}
            onKeyDown={handlePanelResizeKeyDown}
          />

          <aside className="detail-panel" aria-label={activeBucketIsPhotos ? "Photo memo creation" : "Work item detail"}>
            {activeBucketIsPhotos ? (
              <>
                <div className="detail-header">
                  <div>
                    <p className="eyebrow">{formatPhotoCount(selectedAvailablePhotoCount)} selected</p>
                    <h2>Create memo</h2>
                  </div>
                </div>
                <div className="detail-actions detail-header-actions">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!canCreatePhotoMemo}
                    onClick={() => void createMemoFromSelectedPhotos()}
                  >
                    {photoMemoSaving ? <RefreshCcw className="spin" size={18} /> : <Plus size={18} />}
                    Create Memo
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={photoMemoSaving}
                    onClick={() => {
                      setPhotoMemoDraft(defaultPhotoMemoDraft);
                      setSelectedPhotoImportIds(new Set());
                    }}
                  >
                    Reset
                  </button>
                </div>
                <div className="detail-meta">
                  <span>Available: {photoImports.filter((photoImport) => photoImport.status === "available").length}</span>
                  <span>Preprocessing: {photoImports.filter((photoImport) => photoImport.status === "preprocessing").length}</span>
                  <span>Failed: {photoImports.filter((photoImport) => photoImport.status === "preprocessing_failed").length}</span>
                </div>
                <div className="field-group">
                  <label htmlFor="photo-memo-project">Project</label>
                  <select
                    id="photo-memo-project"
                    value={photoMemoDraft.projectId}
                    disabled={photoMemoSaving}
                    onChange={(event) => updatePhotoMemoDraft("projectId", event.currentTarget.value)}
                  >
                    <option value="">Select project</option>
                    {projects
                      .filter((project) => project.isActive)
                      .map((project) => (
                        <option value={project.id} key={project.id}>
                          {project.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field-group">
                  <label htmlFor="photo-memo-title">Title</label>
                  <input
                    id="photo-memo-title"
                    value={photoMemoDraft.title}
                    disabled={photoMemoSaving}
                    onChange={(event) => updatePhotoMemoDraft("title", event.currentTarget.value)}
                  />
                </div>
                <div className="field-group grow">
                  <label htmlFor="photo-memo-body">Memo body</label>
                  <textarea
                    id="photo-memo-body"
                    value={photoMemoDraft.body}
                    disabled={photoMemoSaving}
                    rows={12}
                    onChange={(event) => updatePhotoMemoDraft("body", event.currentTarget.value)}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="photo-memo-tags">Tags</label>
                  <input
                    id="photo-memo-tags"
                    value={photoMemoDraft.tags}
                    disabled={photoMemoSaving}
                    onChange={(event) => updatePhotoMemoDraft("tags", event.currentTarget.value)}
                  />
                </div>
                {selectedAvailablePhotoCount === 0 ? (
                  <div className="empty-detail inline-empty">
                    <Image size={22} />
                    <span>Select available photos</span>
                  </div>
                ) : null}
              </>
            ) : selectedItem === null || draft === null ? (
              <div className="empty-detail">
                <FileText size={22} />
                <span>Select a work item</span>
              </div>
            ) : (
              <>
                <div className="detail-header">
                  <div>
                    <p className="eyebrow">{projectById.get(selectedItem.projectId ?? "")?.name ?? "No project"}</p>
                    <h2>{selectedItem.title}</h2>
                  </div>
                </div>

                <div className="detail-meta">
                  <span>Version {selectedItem.workflowItemVersion}</span>
                  <span>Original {formatDate(selectedItem.originalFileModifiedAt ?? selectedItem.createdAt)}</span>
                  {selectedItem.acceptedUnexportedChanges ? <span>Accepted changes pending export</span> : null}
                </div>

                <div className="detail-action-bar detail-header-actions">
                  <div className="detail-actions">
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!hasDraftChanges || saveState === "saving"}
                      onClick={() => void saveDraft()}
                    >
                      {saveState === "saving" ? <RefreshCcw className="spin" size={18} /> : <Save size={18} />}
                      Save
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={!hasDraftChanges}
                      onClick={() => setDraft(createDraft(selectedItem))}
                    >
                      Reset
                    </button>
                    {saveState === "saved" ? (
                      <span className="inline-status">
                        <Check size={16} />
                        Saved
                      </span>
                    ) : null}
                  </div>
                  {selectedItem.photoAttachmentCount > 0 ? (
                    <button
                      className="secondary-button detail-photo-action"
                      type="button"
                      onClick={() => openPhotoViewer(selectedItem)}
                    >
                      <Camera size={18} />
                      Photos
                    </button>
                  ) : null}
                </div>

                <div className="field-group">
                  <label htmlFor="work-item-project">Project</label>
                  <select
                    id="work-item-project"
                    value={draft.projectId}
                    onChange={(event) => updateDraft("projectId", event.currentTarget.value)}
                  >
                    <option value="">No project</option>
                    {projects.map((project) => (
                      <option value={project.id} key={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-grid">
                  <div className="field-group">
                    <label htmlFor="work-item-contributor">Contributor</label>
                    <select
                      id="work-item-contributor"
                      value={draft.contributorId}
                      onChange={(event) => updateDraft("contributorId", event.currentTarget.value)}
                    >
                      <option value="">Unlinked</option>
                      {contributors.map((contributor) => (
                        <option value={contributor.id} key={contributor.id}>
                          {contributor.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label htmlFor="work-item-contributor-text">Contributor text</label>
                    <input
                      id="work-item-contributor-text"
                      value={draft.contributorText}
                      onChange={(event) => updateDraft("contributorText", event.currentTarget.value)}
                    />
                  </div>
                </div>

                <div className="field-group">
                  <label htmlFor="work-item-title">Title</label>
                  <input
                    id="work-item-title"
                    value={draft.title}
                    onChange={(event) => updateDraft("title", event.currentTarget.value)}
                  />
                </div>

                <div className="field-group grow">
                  <label htmlFor="work-item-body">Memo body</label>
                  <textarea
                    id="work-item-body"
                    value={draft.body}
                    onChange={(event) => updateDraft("body", event.currentTarget.value)}
                    rows={10}
                  />
                </div>

                {selectedTagsAvailable ? (
                  <div className="field-group">
                    <label htmlFor="work-item-tag-input">Tags</label>
                    <div className="tag-editor">
                      <section className="tag-editor-section" aria-label="Selected tags">
                        <h3>Selected</h3>
                        <div className="tag-chip-list">
                          {draft.tags.length === 0 ? <span className="tag-empty">No tags selected</span> : null}
                          {draft.tags.map((tag) => (
                            <span className="tag-chip selected split-tag-chip" key={tag}>
                              <button
                                className="tag-chip-icon-action"
                                type="button"
                                title={`Suppress ${tag} suggestions`}
                                aria-label={`Suppress ${tag} suggestions`}
                                disabled={suppressedTagInFlight === tag.trim().toLowerCase()}
                                onClick={() => void suppressTag(tag, { removeFromDraft: true })}
                              >
                                <Minus size={13} />
                              </button>
                              <span className="tag-chip-label">{tag}</span>
                              <button
                                className="tag-chip-icon-action"
                                type="button"
                                title={`Remove ${tag}`}
                                aria-label={`Remove ${tag}`}
                                onClick={() => removeDraftTag(tag)}
                              >
                                <X size={13} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </section>
                      <div className="tag-input-row">
                        <input
                          id="work-item-tag-input"
                          value={draft.tagInput}
                          onChange={(event) => handleTagInputChange(event.currentTarget.value)}
                          onKeyDown={handleTagInputKeyDown}
                          placeholder="Add tag"
                        />
                        <button
                          className="icon-button"
                          type="button"
                          disabled={parseTagsText(draft.tagInput).length === 0}
                          onClick={() => addDraftTags(parseTagsText(draft.tagInput))}
                          title="Add tag"
                        >
                          <Plus size={17} />
                        </button>
                      </div>
                      <div className="tag-suggestion-rows" aria-label="Tag suggestions">
                        <TagSuggestionRow
                          label="Strong"
                          tags={visibleTagSuggestions.strong}
                          onSelect={addDraftTags}
                          onSuppress={(tag) => void suppressTag(tag, { removeFromDraft: false })}
                        />
                        <TagSuggestionRow
                          label="Related"
                          tags={visibleTagSuggestions.related}
                          onSelect={addDraftTags}
                          onSuppress={(tag) => void suppressTag(tag, { removeFromDraft: false })}
                        />
                        <TagSuggestionRow
                          label="Weak"
                          tags={visibleTagSuggestions.weak}
                          onSelect={addDraftTags}
                          onSuppress={(tag) => void suppressTag(tag, { removeFromDraft: false })}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {workItemDetailTasks.length === 0 ? null : (
                  <div className="work-item-task-actions" aria-label="Work item detail tasks">
                    {workItemDetailTasks.map((task) => {
                      const inFlight = workItemTaskIdInFlight === task.id;
                      const disabled = workItemTaskIdInFlight !== null || hasDraftChanges || !task.runtimeReady;
                      const title = hasDraftChanges
                        ? "Save or reset edits before running this task."
                        : task.runtimeReady
                          ? `Run ${task.displayName}`
                          : task.unavailableReason ?? `${task.displayName} is not ready.`;
                      return (
                        <button
                          className="secondary-button"
                          type="button"
                          key={task.id}
                          disabled={disabled}
                          title={title}
                          onClick={() => void runWorkItemTask(task)}
                        >
                          {inFlight ? <RefreshCcw className="spin" size={18} /> : <Settings size={18} />}
                          {task.displayName}
                        </button>
                      );
                    })}
                  </div>
                )}

                {audioArtifact !== null ? (
                  <section className="detail-section" aria-label="Audio and transcription recovery">
                    <div className="section-title">
                      <Headphones size={18} />
                      <h3>Audio transcript</h3>
                    </div>
                    <div className="audio-recovery">
                      <div className="audio-meta">
                        <span>{audioArtifact.originalFilename ?? "Audio artifact"}</span>
                        <span>{formatBytes(audioArtifact.byteSize)}</span>
                        <span>{transcriptArtifacts.length} transcript artifacts</span>
                      </div>
                      {audioObjectUrl === null ? (
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={audioLoadState === "loading"}
                          onClick={() => void loadAudioPlayback(audioArtifact.id)}
                        >
                          {audioLoadState === "loading" ? (
                            <RefreshCcw className="spin" size={18} />
                          ) : (
                            <Headphones size={18} />
                          )}
                          Load audio
                        </button>
                      ) : (
                        <audio className="audio-player" controls src={audioObjectUrl} />
                      )}
                      {transcriptionJobs.length === 0 ? null : (
                        <div className="job-list">
                          {transcriptionJobs.map((job) => (
                            <div className="job-row" key={job.id}>
                              <div>
                                <strong>{statusLabel(job.status)}</strong>
                                <span>
                                  Attempt {job.attemptCount} of {job.maxAttempts}
                                </span>
                                {job.userSafeErrorMessage === null ? null : (
                                  <p className="error-text">{job.userSafeErrorMessage}</p>
                                )}
                              </div>
                              {retryableTranscriptionJob?.id === job.id ? (
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => void retryTranscription(job.id)}
                                >
                                  <RefreshCcw size={18} />
                                  Retry
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={draft.body.trim() === "" || transcriptSaving}
                        onClick={() => void saveManualTranscript()}
                      >
                        {transcriptSaving ? <RefreshCcw className="spin" size={18} /> : <Save size={18} />}
                        Save transcript
                      </button>
                    </div>
                  </section>
                ) : null}

                <section className="detail-section" aria-label="Memo metadata">
                  <div className="section-title">
                    <FileText size={18} />
                    <h3>Metadata</h3>
                  </div>
                  <dl className="metadata-list">
                    <div>
                      <dt>Source ID</dt>
                      <dd>
                        <span>{selectedItem.sourceMemoId}</span>
                        <button
                          className="copy-button"
                          type="button"
                          title="Copy source ID"
                          aria-label="Copy source ID"
                          onClick={() => void copyText(selectedItem.sourceMemoId, "Source ID")}
                        >
                          <Copy size={15} />
                        </button>
                      </dd>
                    </div>
                    <div>
                      <dt>Body format</dt>
                      <dd>
                        <span>{selectedItem.bodyFormat}</span>
                        <button
                          className="copy-button"
                          type="button"
                          title="Copy body format"
                          aria-label="Copy body format"
                          onClick={() => void copyText(selectedItem.bodyFormat, "Body format")}
                        >
                          <Copy size={15} />
                        </button>
                      </dd>
                    </div>
                  </dl>
                </section>
              </>
            )}
          </aside>
        </div>
        ) : activeView === "exports" ? (
          <div className="export-grid">
            <section className="export-list" aria-label="Accepted snapshots">
              <div className="export-summary">
                <div>
                  <strong>{selectedExportSnapshotIds.size} selected</strong>
                  <span>{filteredExportSnapshots.length} snapshots in view</span>
                </div>
                <span>{exportSnapshots.filter((snapshot) => !snapshot.alreadyExported).length} unexported</span>
              </div>

              {filteredExportSnapshots.length === 0 ? (
                <div className="empty-state">
                  <CircleSlash size={20} />
                  <span>No accepted snapshots match this filter</span>
                </div>
              ) : null}

              {filteredExportSnapshots.map((snapshot) => (
                <label className="export-row" key={snapshot.acceptedSnapshotId}>
                  <input
                    type="checkbox"
                    checked={selectedExportSnapshotIds.has(snapshot.acceptedSnapshotId)}
                    onChange={(event) =>
                      toggleExportSnapshot(snapshot.acceptedSnapshotId, event.currentTarget.checked)
                    }
                  />
                  <div className="item-row-main">
                    <div className="item-title-line">
                      <FileText size={18} />
                      <h2>{snapshot.title}</h2>
                    </div>
                    <div className="item-meta">
                      <span>{snapshot.project.name}</span>
                      {snapshot.contributor === null ? null : <span>{snapshot.contributor.text}</span>}
                    </div>
                    <p>Snapshot {formatDate(snapshot.snapshotCreatedAt)}</p>
                  </div>
                  <span className={`export-status ${snapshot.alreadyExported ? "exported" : "new"}`}>
                    {snapshot.alreadyExported ? "Exported" : "New"}
                  </span>
                </label>
              ))}
            </section>

            <aside className="detail-panel" aria-label="Export batches">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Generated artifacts</p>
                  <h2>Export batches</h2>
                </div>
                <PackageCheck size={22} />
              </div>

              {exportBatches.length === 0 ? (
                <div className="empty-detail">
                  <PackagePlus size={22} />
                  <span>No export batches yet</span>
                </div>
              ) : null}

              <div className="batch-list">
                {exportBatches.map((batch) => (
                  <article className="batch-row" key={batch.id}>
                    <div>
                      <div className="batch-title">
                        <strong>{batchStatusLabel(batch.status)}</strong>
                        <span>{batch.itemCount} items</span>
                      </div>
                      <p>{formatDate(batch.createdAt)}</p>
                      {batch.errorMessage === null ? null : <p className="error-text">{batch.errorMessage}</p>}
                    </div>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={batch.status !== "succeeded" || batch.bundleArtifactId === null}
                      onClick={() => void downloadExportBatch(batch.id)}
                    >
                      <Download size={18} />
                      Download
                    </button>
                  </article>
                ))}
              </div>
            </aside>
          </div>
        ) : activeView === "projects" ? (
          <div className="projects-grid">
            <section className="detail-panel projects-list-panel" aria-label="Projects">
              <article className="settings-row project-config-row">
                <div className="settings-row-header">
                  <div>
                    <strong>Project Config</strong>
                    <p>Auto-promotion confidence</p>
                  </div>
                  <span className="detail-count">
                    {projectThresholdDisplay}
                  </span>
                </div>
                <div className="project-threshold-controls">
                  <input
                    aria-label="Auto-promotion confidence"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={projectThresholdDraft}
                    onChange={(event) => setProjectThresholdDraft(event.currentTarget.value)}
                  />
                  <input
                    aria-label="Auto-promotion confidence value"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={projectThresholdDraft}
                    onChange={(event) => setProjectThresholdDraft(event.currentTarget.value)}
                  />
                  <button
                    className="row-action-button primary"
                    type="button"
                    disabled={projectConfigSaving}
                    onClick={() => void saveProjectConfig()}
                  >
                    {projectConfigSaving ? <RefreshCcw className="spin" size={16} /> : <Save size={16} />}
                    Save
                  </button>
                </div>
              </article>

              {projects.length === 0 && newProjectDrafts.length === 0 ? (
                <div className="empty-detail">
                  <FolderOpen size={22} />
                  <span>No projects configured</span>
                </div>
              ) : null}

              <div className="settings-list project-page-list" ref={projectListRef}>
                {projects.map((project) => {
                  const projectDraft = projectDrafts[project.id] ?? createProjectForm(project);
                  return (
                    <article className="settings-row project-settings-row project-row-compact" key={project.id}>
                      <div className="project-row-top">
                        <input
                          className="project-name-input"
                          aria-label="Project name"
                          value={projectDraft.name}
                          onChange={(event) =>
                            updateProjectDraft(project.id, "name", event.currentTarget.value)
                          }
                        />
                        <p className="project-updated">Updated {formatDate(project.updatedAt)}</p>
                        <div className="suggestion-actions">
                          <button
                            className="row-action-button"
                            type="button"
                            disabled={projectIdInFlight !== null}
                            onClick={() => void saveProject(project.id)}
                          >
                            {projectIdInFlight === project.id ? (
                              <RefreshCcw className="spin" size={16} />
                            ) : (
                              <Save size={16} />
                            )}
                            Save
                          </button>
                          {project.isActive ? (
                            <button
                              className="row-action-button warning"
                              type="button"
                              disabled={projectIdInFlight !== null}
                              onClick={() => void deactivateProject(project.id)}
                            >
                              <CircleSlash size={16} />
                              Deactivate
                            </button>
                          ) : null}
                          {projectDeleteConfirmId === project.id ? (
                            <>
                              <button
                                className="row-action-button danger"
                                type="button"
                                disabled={projectIdInFlight !== null}
                                onClick={() => void deleteProject(project)}
                              >
                                {projectIdInFlight === project.id ? (
                                  <RefreshCcw className="spin" size={16} />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                                Delete
                              </button>
                              <button
                                className="row-action-button icon-only"
                                type="button"
                                title="Cancel delete"
                                aria-label="Cancel delete"
                                disabled={projectIdInFlight === project.id}
                                onClick={() => setProjectDeleteConfirmId(null)}
                              >
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <button
                              className="row-action-button danger icon-only"
                              type="button"
                              title="Delete project"
                              aria-label={`Delete ${project.name.trim() === "" ? "blank project" : project.name}`}
                              disabled={projectIdInFlight !== null}
                              onClick={() => setProjectDeleteConfirmId(project.id)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="field-group project-synopsis-field">
                        <label htmlFor={`project-${project.id}-description`}>Synopsis</label>
                        <textarea
                          id={`project-${project.id}-description`}
                          value={projectDraft.description}
                          onChange={(event) =>
                            updateProjectDraft(project.id, "description", event.currentTarget.value)
                          }
                          rows={2}
                        />
                      </div>
                    </article>
                  );
                })}

                {newProjectDrafts.map((draftProject) => (
                  <article className="settings-row project-settings-row project-row-compact" key={draftProject.id}>
                    <div className="project-row-top">
                      <input
                        className="project-name-input"
                        aria-label="Project name"
                        placeholder="New project"
                        value={draftProject.form.name}
                        onChange={(event) =>
                          updateNewProjectDraft(draftProject.id, "name", event.currentTarget.value)
                        }
                      />
                      <p className="project-updated">Unsaved project</p>
                      <div className="suggestion-actions">
                        <button
                          className="row-action-button primary"
                          type="button"
                          disabled={projectIdInFlight !== null}
                          onClick={() => void createProject(draftProject.id)}
                        >
                          {projectIdInFlight === draftProject.id ? (
                            <RefreshCcw className="spin" size={16} />
                          ) : (
                            <Save size={16} />
                          )}
                          Save
                        </button>
                        <button
                          className="row-action-button"
                          type="button"
                          disabled={projectIdInFlight === draftProject.id}
                          onClick={() => discardNewProjectDraft(draftProject.id)}
                        >
                          <X size={16} />
                          Discard
                        </button>
                      </div>
                    </div>

                    <div className="field-group project-synopsis-field">
                      <label htmlFor={`${draftProject.id}-description`}>Synopsis</label>
                      <textarea
                        id={`${draftProject.id}-description`}
                        value={draftProject.form.description}
                        onChange={(event) =>
                          updateNewProjectDraft(draftProject.id, "description", event.currentTarget.value)
                        }
                        rows={2}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : activeView === "settings" ? (
          <div className="settings-workspace">
            <aside className="settings-nav-panel" aria-label="Settings sections">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Settings</p>
                  <h2>Settings</h2>
                </div>
                <Settings size={22} />
              </div>
              <nav className="settings-section-nav">
                {settingsSections.map((section) => (
                  <button
                    className={section.id === activeSettingsSection ? "settings-section-active" : ""}
                    type="button"
                    key={section.id}
                    onClick={() => setActiveSettingsSection(section.id)}
                  >
                    {section.label}
                  </button>
                ))}
              </nav>
            </aside>

            <section className="detail-panel" aria-label={`${activeSettingsSectionMeta.label} settings`}>
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Backend canonical</p>
                  <h2>{activeSettingsSectionMeta.label}</h2>
                </div>
                <Settings size={22} />
              </div>

              {settingsSummary === null ? (
                <div className="empty-detail">
                  <RefreshCcw size={22} />
                  <span>Settings not loaded</span>
                </div>
              ) : activeSettingsSection === "watched" ? (
                <section className="detail-section watched-settings-section" aria-label="Watched folders">
                  <div className="settings-row-header">
                    <div className="section-title">
                      <FolderInput size={18} />
                      <h3>Watched folders</h3>
                    </div>
                    <div className="suggestion-actions">
                      <button className="secondary-button" type="button" onClick={addWatchedFolder}>
                        <Plus size={18} />
                        Add folder
                      </button>
                      <button className="secondary-button" type="button" onClick={() => void scanWatchedFolders()}>
                        {watchScanInFlight ? <RefreshCcw className="spin" size={18} /> : <FolderSearch size={18} />}
                        Check now
                      </button>
                      <button className="primary-button" type="button" onClick={saveWatchedFolders}>
                        <Save size={18} />
                        Save
                      </button>
                    </div>
                  </div>
                  <div className="detail-meta watched-status-strip">
                    <span>Machine: {machineId ?? "not loaded"}</span>
                    <span>Enabled: {watchedFolders.filter((folder) => folder.enabled).length}</span>
                    <span>Status: {watchedFolderStatus}</span>
                    <span>Types: {activeFileExtensions.length}</span>
                    <span>Scan: {watchedLastScanAt === null ? "not run" : formatRelativeTime(watchedLastScanAt)}</span>
                    <span>Processed: {watchedLastProcessedCount}</span>
                    <span>{watchedSettingsSaved ? "Saved" : "Unsaved"}</span>
                  </div>

                  {watchedFolders.length === 0 ? (
                    <div className="empty-detail compact-empty">
                      <FolderInput size={22} />
                      <span>No watched folders configured</span>
                    </div>
                  ) : null}

                  <div className="watch-folder-list dense-watch-folder-list">
                    {watchedFolders.length > 0 ? (
                      <div className="watch-folder-table-header" aria-hidden="true">
                        <span>On</span>
                        <span>Contributor name</span>
                        <span>Watched path</span>
                        <span>Archive path</span>
                        <span>Recursive</span>
                        <span>Stability</span>
                        <span>Actions</span>
                      </div>
                    ) : null}
                    {watchedFolders.map((folder) => (
                      <article className="watch-folder-row" key={folder.id}>
                        <label className="watch-folder-check" title="Enable watched folder">
                          <span className="sr-only">Enabled</span>
                          <input
                            type="checkbox"
                            checked={folder.enabled}
                            onChange={(event) =>
                              updateWatchedFolder(folder.id, "enabled", event.currentTarget.checked)
                            }
                          />
                        </label>
                        <label className="watch-folder-cell">
                          <span className="watch-folder-mobile-label">Contributor name</span>
                          <input
                            id={`${folder.id}-contributor`}
                            value={folder.contributorName}
                            placeholder="Contributor name"
                            onChange={(event) =>
                              updateWatchedFolder(folder.id, "contributorName", event.currentTarget.value)
                            }
                          />
                        </label>
                        <div className="watch-folder-cell">
                          <label className="watch-folder-mobile-label" htmlFor={`${folder.id}-path`}>
                            Watched path
                          </label>
                          <div className="path-picker-field">
                            <input
                              id={`${folder.id}-path`}
                              value={folder.path}
                              onChange={(event) => updateWatchedFolder(folder.id, "path", event.currentTarget.value)}
                            />
                            <button
                              className="secondary-button icon-only"
                              type="button"
                              title="Choose watched folder"
                              aria-label="Choose watched folder"
                              onClick={() => void pickWatchedFolderPath(folder.id, "path")}
                            >
                              <FolderOpen size={18} />
                            </button>
                          </div>
                        </div>
                        <div className="watch-folder-cell">
                          <label className="watch-folder-mobile-label" htmlFor={`${folder.id}-archive`}>
                            Archive path
                          </label>
                          <div className="path-picker-field">
                            <input
                              id={`${folder.id}-archive`}
                              value={folder.archivePath}
                              onChange={(event) =>
                                updateWatchedFolder(folder.id, "archivePath", event.currentTarget.value)
                              }
                            />
                            <button
                              className="secondary-button icon-only"
                              type="button"
                              title="Choose archive folder"
                              aria-label="Choose archive folder"
                              onClick={() => void pickWatchedFolderPath(folder.id, "archivePath")}
                            >
                              <FolderOpen size={18} />
                            </button>
                          </div>
                        </div>
                        <label className="watch-folder-check" title="Scan child folders">
                          <span className="sr-only">Recursive</span>
                          <input
                            type="checkbox"
                            checked={folder.recursive}
                            onChange={(event) =>
                              updateWatchedFolder(folder.id, "recursive", event.currentTarget.checked)
                            }
                          />
                        </label>
                        <label className="watch-folder-cell">
                          <span className="watch-folder-mobile-label">Stability ms</span>
                          <input
                            id={`${folder.id}-stability`}
                            type="number"
                            min={1000}
                            step={500}
                            value={folder.stabilityMs}
                            onChange={(event) =>
                              updateWatchedFolder(
                                folder.id,
                                "stabilityMs",
                                Number.parseInt(event.currentTarget.value, 10) || 3000
                              )
                            }
                          />
                        </label>
                        <div className="watch-folder-actions">
                          <button
                            className="secondary-button icon-only"
                            type="button"
                            title="Remove watched folder"
                            aria-label="Remove watched folder"
                            onClick={() => removeWatchedFolder(folder.id)}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : activeSettingsSection === "file-types" ? (
                <section className="detail-section" aria-label="File types">
                  <div className="settings-row-header">
                    <div className="section-title">
                      <Settings size={18} />
                      <h3>Media types</h3>
                    </div>
                    <span className="detail-count">{settingsSummary.mediaTypes.length} configured</span>
                  </div>
                  <form
                    className="settings-inline-form registry-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createMediaType();
                    }}
                  >
                    <label>
                      Key
                      <input
                        value={newMediaTypeDraft.mediaKey}
                        onChange={(event) => updateNewMediaTypeDraft("mediaKey", event.currentTarget.value)}
                        placeholder="document"
                      />
                    </label>
                    <label>
                      Name
                      <input
                        value={newMediaTypeDraft.displayName}
                        onChange={(event) => updateNewMediaTypeDraft("displayName", event.currentTarget.value)}
                        placeholder="Document"
                      />
                    </label>
                    <label>
                      Description
                      <input
                        value={newMediaTypeDraft.description}
                        onChange={(event) => updateNewMediaTypeDraft("description", event.currentTarget.value)}
                        placeholder="Future document imports"
                      />
                    </label>
                    <label>
                      Status
                      <select
                        value={newMediaTypeDraft.capabilityState}
                        onChange={(event) =>
                          updateNewMediaTypeDraft(
                            "capabilityState",
                            event.currentTarget.value as FileTypeCapabilityState
                          )
                        }
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                        <option value="not_supported_yet">not supported yet</option>
                      </select>
                    </label>
                    <button className="secondary-button" type="submit" disabled={mediaTypeCreateInFlight}>
                      <Plus size={16} />
                      Add media
                    </button>
                  </form>
                  <div className="settings-table registry-table">
                    <div className="settings-table-header">
                      <span>Key</span>
                      <span>Name</span>
                      <span>Description</span>
                      <span>Status</span>
                      <span>Actions</span>
                    </div>
                    {settingsSummary.mediaTypes.map((mediaType) => {
                      const draft = mediaTypeDrafts[mediaType.id] ?? {
                        mediaKey: mediaType.mediaKey,
                        displayName: mediaType.displayName,
                        description: mediaType.description ?? "",
                        capabilityState: mediaType.capabilityState
                      };
                      return (
                        <div className="settings-table-row" key={mediaType.id}>
                          <input
                            value={draft.mediaKey}
                            onChange={(event) => updateMediaTypeDraft(mediaType.id, "mediaKey", event.currentTarget.value)}
                          />
                          <input
                            value={draft.displayName}
                            onChange={(event) =>
                              updateMediaTypeDraft(mediaType.id, "displayName", event.currentTarget.value)
                            }
                          />
                          <input
                            value={draft.description}
                            onChange={(event) =>
                              updateMediaTypeDraft(mediaType.id, "description", event.currentTarget.value)
                            }
                          />
                          <select
                            value={draft.capabilityState}
                            onChange={(event) =>
                              updateMediaTypeDraft(
                                mediaType.id,
                                "capabilityState",
                                event.currentTarget.value as FileTypeCapabilityState
                              )
                            }
                          >
                            <option value="active">active</option>
                            <option value="inactive">inactive</option>
                            <option value="not_supported_yet">not supported yet</option>
                          </select>
                          <div className="settings-table-actions">
                            <button
                              className="secondary-button icon-only"
                              type="button"
                              title="Save media type"
                              aria-label="Save media type"
                              disabled={mediaTypeIdInFlight === mediaType.id}
                              onClick={() => void saveMediaType(mediaType.id)}
                            >
                              <Save size={15} />
                            </button>
                            <button
                              className="row-action-button danger icon-only"
                              type="button"
                              title="Remove media type"
                              aria-label="Remove media type"
                              disabled={mediaTypeIdInFlight === mediaType.id}
                              onClick={() => void deleteMediaType(mediaType)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="settings-row-header">
                    <div className="section-title">
                      <Settings size={18} />
                      <h3>Parser types</h3>
                    </div>
                    <span className="detail-count">{settingsSummary.parserTypes.length} configured</span>
                  </div>
                  <form
                    className="settings-inline-form parser-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createParserType();
                    }}
                  >
                    <label>
                      Key
                      <input
                        value={newParserTypeDraft.parserKey}
                        onChange={(event) => updateNewParserTypeDraft("parserKey", event.currentTarget.value)}
                        placeholder="whisper-cpp"
                      />
                    </label>
                    <label>
                      Name
                      <input
                        value={newParserTypeDraft.displayName}
                        onChange={(event) => updateNewParserTypeDraft("displayName", event.currentTarget.value)}
                        placeholder="Whisper.cpp"
                      />
                    </label>
                    <label>
                      Description
                      <input
                        value={newParserTypeDraft.description}
                        onChange={(event) => updateNewParserTypeDraft("description", event.currentTarget.value)}
                        placeholder="Transcribe audio files"
                      />
                    </label>
                    <label>
                      Media
                      <select
                        value={newParserTypeDraft.mediaKey}
                        onChange={(event) => updateNewParserTypeDraft("mediaKey", event.currentTarget.value)}
                      >
                        {settingsSummary.mediaTypes.map((mediaType) => (
                          <option value={mediaType.mediaKey} key={mediaType.id}>
                            {mediaType.displayName} ({mediaType.capabilityState})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Status
                      <select
                        value={newParserTypeDraft.capabilityState}
                        onChange={(event) =>
                          updateNewParserTypeDraft(
                            "capabilityState",
                            event.currentTarget.value as FileTypeCapabilityState
                          )
                        }
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                        <option value="not_supported_yet">not supported yet</option>
                      </select>
                    </label>
                    <button className="secondary-button" type="submit" disabled={parserTypeCreateInFlight}>
                      <Plus size={16} />
                      Add parser
                    </button>
                  </form>
                  <div className="settings-table registry-table parser-registry-table">
                    <div className="settings-table-header">
                      <span>Key</span>
                      <span>Name</span>
                      <span>Description</span>
                      <span>Media</span>
                      <span>Status</span>
                      <span>Actions</span>
                    </div>
                    {settingsSummary.parserTypes.map((parserType) => {
                      const draft = parserTypeDrafts[parserType.id] ?? {
                        parserKey: parserType.parserKey,
                        displayName: parserType.displayName,
                        description: parserType.description ?? "",
                        mediaKey: parserType.mediaKey,
                        capabilityState: parserType.capabilityState
                      };
                      return (
                        <div className="settings-table-row" key={parserType.id}>
                          <input
                            value={draft.parserKey}
                            onChange={(event) =>
                              updateParserTypeDraft(parserType.id, "parserKey", event.currentTarget.value)
                            }
                          />
                          <input
                            value={draft.displayName}
                            onChange={(event) =>
                              updateParserTypeDraft(parserType.id, "displayName", event.currentTarget.value)
                            }
                          />
                          <input
                            value={draft.description}
                            onChange={(event) =>
                              updateParserTypeDraft(parserType.id, "description", event.currentTarget.value)
                            }
                          />
                          <select
                            value={draft.mediaKey}
                            onChange={(event) =>
                              updateParserTypeDraft(parserType.id, "mediaKey", event.currentTarget.value)
                            }
                          >
                            {settingsSummary.mediaTypes.map((mediaType) => (
                              <option value={mediaType.mediaKey} key={mediaType.id}>
                                {mediaType.displayName} ({mediaType.capabilityState})
                              </option>
                            ))}
                          </select>
                          <select
                            value={draft.capabilityState}
                            onChange={(event) =>
                              updateParserTypeDraft(
                                parserType.id,
                                "capabilityState",
                                event.currentTarget.value as FileTypeCapabilityState
                              )
                            }
                          >
                            <option value="active">active</option>
                            <option value="inactive">inactive</option>
                            <option value="not_supported_yet">not supported yet</option>
                          </select>
                          <div className="settings-table-actions">
                            <button
                              className="secondary-button icon-only"
                              type="button"
                              title="Save parser type"
                              aria-label="Save parser type"
                              disabled={parserTypeIdInFlight === parserType.id}
                              onClick={() => void saveParserType(parserType.id)}
                            >
                              <Save size={15} />
                            </button>
                            <button
                              className="row-action-button danger icon-only"
                              type="button"
                              title="Remove parser type"
                              aria-label="Remove parser type"
                              disabled={parserTypeIdInFlight === parserType.id}
                              onClick={() => void deleteParserType(parserType)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="settings-row-header">
                    <div className="section-title">
                      <FolderInput size={18} />
                      <h3>File extension mappings</h3>
                    </div>
                    <span className="detail-count">{settingsSummary.fileTypes.length} configured</span>
                  </div>
                  <form
                    className="settings-inline-form file-type-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createFileType();
                    }}
                  >
                    <label>
                      Extension
                      <input
                        value={newFileTypeDraft.extension}
                        onChange={(event) => updateNewFileTypeDraft("extension", event.currentTarget.value)}
                        placeholder=".html"
                      />
                    </label>
                    <label>
                      Media
                      <select
                        value={newFileTypeDraft.mediaKind}
                        onChange={(event) => updateNewFileTypeDraft("mediaKind", event.currentTarget.value)}
                      >
                        {settingsSummary.mediaTypes.map((mediaType) => (
                          <option value={mediaType.mediaKey} key={mediaType.id}>
                            {mediaType.displayName} ({mediaType.capabilityState})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Parser
                      <select
                        value={newFileTypeDraft.parserKey}
                        onChange={(event) => updateNewFileTypeDraft("parserKey", event.currentTarget.value)}
                      >
                        <option value="">Needs parser support</option>
                        {settingsSummary.parserTypes
                          .filter((parserType) => parserType.mediaKey === newFileTypeDraft.mediaKind)
                          .map((parserType) => (
                            <option value={parserType.parserKey} key={parserType.id}>
                              {parserType.displayName} ({parserType.capabilityState})
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Status
                      <select
                        value={newFileTypeDraft.capabilityState}
                        onChange={(event) =>
                          updateNewFileTypeDraft(
                            "capabilityState",
                            event.currentTarget.value as FileTypeCapabilityState
                          )
                        }
                      >
                        <option value="inactive">inactive</option>
                        <option value="active">active</option>
                        <option value="not_supported_yet">not supported yet</option>
                      </select>
                    </label>
                    <button className="secondary-button" type="submit" disabled={fileTypeCreateInFlight}>
                      <Plus size={16} />
                      Add file type
                    </button>
                  </form>
                  <div className="settings-table">
                    <div className="settings-table-header">
                      <span>Extension</span>
                      <span>Media</span>
                      <span>Parser</span>
                      <span>Status</span>
                      <span>Actions</span>
                    </div>
                    {settingsSummary.fileTypes.map((fileType) => {
                      const draft = fileTypeDrafts[fileType.id] ?? {
                        mediaKind: fileType.mediaKind,
                        parserKey: fileType.parserKey ?? "",
                        capabilityState: fileType.capabilityState
                      };
                      return (
                        <div className="settings-table-row" key={fileType.id}>
                          <strong>{fileType.extension}</strong>
                          <select
                            value={draft.mediaKind}
                            onChange={(event) => updateFileTypeDraft(fileType.id, "mediaKind", event.currentTarget.value)}
                          >
                            {settingsSummary.mediaTypes.map((mediaType) => (
                              <option value={mediaType.mediaKey} key={mediaType.id}>
                                {mediaType.displayName} ({mediaType.capabilityState})
                              </option>
                            ))}
                          </select>
                          <select
                            value={draft.parserKey}
                            onChange={(event) => updateFileTypeDraft(fileType.id, "parserKey", event.currentTarget.value)}
                          >
                            <option value="">Needs parser support</option>
                            {settingsSummary.parserTypes
                              .filter((parserType) => parserType.mediaKey === draft.mediaKind)
                              .map((parserType) => (
                                <option value={parserType.parserKey} key={parserType.id}>
                                  {parserType.displayName} ({parserType.capabilityState})
                                </option>
                              ))}
                          </select>
                          <select
                            value={draft.capabilityState}
                            onChange={(event) =>
                              updateFileTypeDraft(
                                fileType.id,
                                "capabilityState",
                                event.currentTarget.value as FileTypeCapabilityState
                              )
                            }
                          >
                            <option value="inactive">inactive</option>
                            <option value="active">active</option>
                            <option value="not_supported_yet">not supported yet</option>
                          </select>
                          <div className="settings-table-actions">
                            <button
                              className="secondary-button icon-only"
                              type="button"
                              title="Save file type"
                              aria-label="Save file type"
                              disabled={fileTypeIdInFlight === fileType.id}
                              onClick={() => void saveFileType(fileType.id)}
                            >
                              <Save size={15} />
                            </button>
                            <button
                              className="row-action-button danger icon-only"
                              type="button"
                              title="Remove file type"
                              aria-label="Remove file type"
                              disabled={fileTypeIdInFlight === fileType.id}
                              onClick={() => void deleteFileType(fileType)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : activeSettingsSection === "suppressed-tags" ? (
                <section className="detail-section" aria-label="Suppressed Tags">
                  <div className="settings-row-header">
                    <div className="section-title">
                      <Minus size={18} />
                      <h3>Suppressed Tags</h3>
                    </div>
                    <div className="detail-meta">
                      <span>{suppressedTags.length} labels</span>
                      <span>{suppressedTagsLoading ? "Loading" : "Loaded"}</span>
                    </div>
                  </div>

                  {suppressedTags.length === 0 ? (
                    <div className="empty-detail compact-empty">
                      <Plus size={22} />
                      <span>No suppressed tags</span>
                    </div>
                  ) : (
                    <div className="suppressed-tags-table" role="table" aria-label="Suppressed Tags">
                      {suppressedTagTableRows.map((row, rowIndex) => (
                        <div className="suppressed-tags-row" role="row" key={`suppressed-row-${rowIndex}`}>
                          {row.map((tag, columnIndex) => (
                            <div className="suppressed-tag-cell" role="cell" key={`${rowIndex}-${columnIndex}`}>
                              {tag === null ? null : (
                                <>
                                  <button
                                    className="tag-chip-icon-action restore-tag-action"
                                    type="button"
                                    title={`Restore ${tag.displayName} suggestions`}
                                    aria-label={`Restore ${tag.displayName} suggestions`}
                                    disabled={suppressedTagInFlight === tag.normalizedName}
                                    onClick={() => void unsuppressTag(tag)}
                                  >
                                    <Plus size={14} />
                                  </button>
                                  <span>{tag.displayName}</span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ) : activeSettingsSection === "providers" ? (
                <section className="detail-section" aria-label="Providers">
                  <div className="settings-list">
                    {(() => {
                      const providerCatalog = settingsSummary.providerCatalog;
                      const registryReachable = providerCatalog?.registry.reachable === true;
                      const registryProviders = registryReachable ? providerCatalog.providers : [];
                      if (!registryReachable) {
                        return (
                          <article className="settings-row">
                            <div className="batch-title">
                              <strong>Provider registry unavailable</strong>
                              <span>Unavailable</span>
                            </div>
                            <p>Provider registry records are managed outside Memo Capture.</p>
                            {providerCatalog?.registry.error ? <p>{providerCatalog.registry.error}</p> : null}
                          </article>
                        );
                      }
                      if (registryProviders.length === 0) {
                        return (
                          <article className="settings-row">
                            <div className="batch-title">
                              <strong>No registry providers</strong>
                              <span>Empty</span>
                            </div>
                            <p>The active provider registry profile does not contain any providers.</p>
                          </article>
                        );
                      }
                      return registryProviders.map((provider) => (
                        <article className="settings-row provider-registry-row" key={provider.providerKey}>
                          <div className="batch-title">
                            <strong>{provider.displayName}</strong>
                            <span className={provider.enabled ? "status-pill ready" : "status-pill"}>
                              {provider.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <div className="provider-registry-meta">
                            <span>Key {provider.providerKey}</span>
                            {provider.model === undefined ? null : <span>Model {provider.model}</span>}
                            <span>Health {provider.health?.status ?? "unknown"}</span>
                          </div>
                          <div className="tag-chip-list">
                            {provider.capabilities.length === 0 ? (
                              <span className="tag-chip">No capabilities</span>
                            ) : (
                              provider.capabilities.map((capability) => (
                                <span className="tag-chip" key={`${provider.providerKey}-${capability.key}`}>
                                  {capability.displayName}
                                </span>
                              ))
                            )}
                          </div>
                        </article>
                      ));
                    })()}
                  </div>
                </section>
              ) : activeSettingsSection === "processing-hooks" ? (
                <section className="detail-section" aria-label="Processing Hooks">
                  <div className="settings-row-header">
                    <div className="section-title">
                      <Settings size={18} />
                      <h3>Processing Hooks</h3>
                    </div>
                    <span className="detail-count">{registeredTaskHooks.length} registered</span>
                  </div>
                  <article className="settings-row provider-task-row">
                    <div>
                      <div className="batch-title">
                        <strong>Create hook</strong>
                        <span>Default no-op</span>
                      </div>
                      <div className="provider-route-controls processing-hook-create-row">
                        <label>
                          <span>Hook Key</span>
                          <input
                            type="text"
                            value={newProcessingHookKey}
                            disabled={processingHookCreateInFlight}
                            onChange={(event) => setNewProcessingHookKey(event.currentTarget.value)}
                          />
                        </label>
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={processingHookCreateInFlight}
                          onClick={() => void createProcessingHook()}
                        >
                          {processingHookCreateInFlight ? (
                            <RefreshCcw className="spin" size={18} />
                          ) : (
                            <Plus size={18} />
                          )}
                          Create Hook
                        </button>
                      </div>
                    </div>
                  </article>
                  {registeredTaskHooks.length === 0 ? (
                    <div className="empty-detail">
                      <Settings size={22} />
                      <span>No processing hooks registered</span>
                    </div>
                  ) : (
                    <div className="processing-hooks-table" role="table" aria-label="Processing Hooks">
                      <div className="processing-hooks-row processing-hooks-header" role="row">
                        <div role="columnheader">Hook key</div>
                        <div role="columnheader">Display name</div>
                        <div role="columnheader">Status</div>
                        <div role="columnheader">Tasks</div>
                        <div role="columnheader">Actions</div>
                      </div>
                      {registeredTaskHooks.map((hook) => (
                        <div className="processing-hooks-row" role="row" key={hook.hookKey}>
                          <div role="cell">
                            <code>{hook.hookKey}</code>
                          </div>
                          <div role="cell">{hook.displayName}</div>
                          <div role="cell">
                            <span className={hook.implemented ? "status-pill ready" : "status-pill muted"}>
                              {hook.statusLabel}
                            </span>
                          </div>
                          <div role="cell">{hook.taskUsageCount}</div>
                          <div className="settings-table-actions" role="cell">
                            <button
                              className="row-action-button danger"
                              type="button"
                              disabled={
                                processingHookKeyInFlight === hook.hookKey ||
                                !hook.deletable
                              }
                              title={hook.deleteBlockedReason ?? `Delete ${hook.displayName}`}
                              onClick={() => void deleteProcessingHook(hook)}
                            >
                              {processingHookKeyInFlight === hook.hookKey ? (
                                <RefreshCcw className="spin" size={18} />
                              ) : (
                                <Trash2 size={18} />
                              )}
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ) : activeSettingsSection === "tasks" ? (
                <section className="detail-section" aria-label="Tasks">
                  <div className="settings-row-header">
                    <div className="section-title">
                      <Settings size={18} />
                      <h3>Tasks</h3>
                    </div>
                    <span className="detail-count">{settingsSummary.aiTasks.length} configured</span>
                  </div>
                  <article className="settings-row provider-task-row task-create-card">
                    <div>
                      <div className="batch-title">
                        <strong>Add task</strong>
                      </div>
                      <div className="provider-route-controls task-route-controls task-create-route-controls">
                        <label>
                          <span>Task Name</span>
                          <input
                            type="text"
                            value={newAiTaskDraft.displayName}
                            disabled={aiTaskCreateInFlight}
                            onChange={(event) => updateNewAiTaskDraft("displayName", event.currentTarget.value)}
                          />
                        </label>
                        <label>
                          <span>Hook Key</span>
                          <select
                            value={newAiTaskDraft.hookKey}
                            disabled={aiTaskCreateInFlight}
                            onChange={(event) => updateNewAiTaskDraft("hookKey", event.currentTarget.value)}
                          >
                            <option value="">Select hook</option>
                            {registeredTaskHooks.map((hook) => (
                              <option value={hook.hookKey} key={hook.hookKey}>
                                {hook.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Render Location</span>
                          <select
                            value={newAiTaskDraft.renderLocation}
                            disabled={aiTaskCreateInFlight}
                            onChange={(event) =>
                              updateNewAiTaskDraft("renderLocation", event.currentTarget.value as TaskRenderLocation)
                            }
                          >
                            {taskRenderLocationOptions.map((option) => (
                              <option value={option.value} key={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Order</span>
                          <input
                            type="number"
                            value={newAiTaskDraft.displayOrder}
                            disabled={aiTaskCreateInFlight}
                            onChange={(event) =>
                              updateNewAiTaskDraft("displayOrder", Number.parseInt(event.currentTarget.value, 10) || 0)
                            }
                          />
                        </label>
                        <label>
                          <span>Provider Key</span>
                          <select
                            value={newAiTaskDraft.providerConfigId}
                            disabled={aiTaskCreateInFlight}
                            onChange={(event) => {
                              const provider = settingsSummary.providers.find(
                                (candidate) => candidate.id === event.currentTarget.value
                              );
                              updateNewAiTaskDraft("providerConfigId", event.currentTarget.value);
                              updateNewAiTaskDraft("modelName", provider?.modelName ?? "");
                            }}
                          >
                            <option value="">No provider</option>
                            {settingsSummary.providers.map((provider) => (
                              <option value={provider.id} key={provider.id}>
                                {provider.providerName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Provider Kind</span>
                          <input
                            type="text"
                            value={
                              settingsSummary.providers.find(
                                (provider) => provider.id === newAiTaskDraft.providerConfigId
                              )?.providerKind ?? ""
                            }
                            readOnly
                          />
                        </label>
                        <label>
                          <span>Task Description</span>
                          <input
                            type="text"
                            value={newAiTaskDraft.description}
                            disabled={aiTaskCreateInFlight}
                            onChange={(event) => updateNewAiTaskDraft("description", event.currentTarget.value)}
                          />
                        </label>
                        <label className="toggle-row">
                          <input
                            type="checkbox"
                            checked={newAiTaskDraft.promptsEnabled}
                            disabled={aiTaskCreateInFlight}
                            onChange={(event) => updateNewAiTaskDraft("promptsEnabled", event.currentTarget.checked)}
                          />
                          Prompts
                        </label>
                        <label className="toggle-row">
                          <input
                            type="checkbox"
                            checked={newAiTaskDraft.enabled}
                            disabled={
                              aiTaskCreateInFlight ||
                              !registeredTaskHooks.some(
                                (hook) => hook.hookKey === newAiTaskDraft.hookKey && hook.implemented
                              )
                            }
                            onChange={(event) => updateNewAiTaskDraft("enabled", event.currentTarget.checked)}
                          />
                          Enabled
                        </label>
                        <div className="task-route-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={aiTaskCreateInFlight}
                            onClick={() => void createAiTaskDefinition()}
                          >
                            {aiTaskCreateInFlight ? <RefreshCcw className="spin" size={18} /> : <Plus size={18} />}
                            Add task
                          </button>
                        </div>
                      </div>
                      {!newAiTaskDraft.promptsEnabled ? null : (
                        <div className="prompt-editor-row task-prompt-editor">
                          <div className="prompt-editor-header">
                            <div>
                              <div className="batch-title">
                                <strong>Prompt options</strong>
                                <span>Initial prompt</span>
                              </div>
                              <p>These settings create the task-owned current prompt.</p>
                            </div>
                          </div>
                          <div className="field-group">
                            <label htmlFor="new-task-prompt-freeform">Prompt text</label>
                            <textarea
                              id="new-task-prompt-freeform"
                              value={newAiTaskDraft.promptDraft.freeformText}
                              rows={6}
                              disabled={aiTaskCreateInFlight}
                              onChange={(event) =>
                                updateNewAiTaskPromptDraft("freeformText", event.currentTarget.value)
                              }
                            />
                          </div>
                          <div className="field-group">
                            <div className="field-label-row">
                              <label htmlFor="new-task-prompt-system">System message</label>
                              <button
                                className="icon-button compact-icon-button"
                                type="button"
                                title="Restore default system message"
                                aria-label="Restore default system message"
                                disabled={aiTaskCreateInFlight}
                                onClick={restoreNewTaskSystemMessageDefault}
                              >
                                <RotateCcw size={15} />
                              </button>
                            </div>
                            <textarea
                              id="new-task-prompt-system"
                              value={newAiTaskDraft.promptDraft.systemMessage}
                              rows={3}
                              disabled={aiTaskCreateInFlight}
                              onChange={(event) =>
                                updateNewAiTaskPromptDraft("systemMessage", event.currentTarget.value)
                              }
                            />
                          </div>
                          <div className="prompt-toggle-grid">
                            <label>
                              <input
                                type="checkbox"
                                checked={newAiTaskDraft.promptDraft.includeProjectSynopsis}
                                disabled={aiTaskCreateInFlight}
                                onChange={(event) =>
                                  updateNewAiTaskPromptDraft("includeProjectSynopsis", event.currentTarget.checked)
                                }
                              />
                              Project synopsis
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={newAiTaskDraft.promptDraft.includeMemoMetadata}
                                disabled={aiTaskCreateInFlight}
                                onChange={(event) =>
                                  updateNewAiTaskPromptDraft("includeMemoMetadata", event.currentTarget.checked)
                                }
                              />
                              Memo metadata
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={newAiTaskDraft.promptDraft.includeMemoTranscriptText}
                                disabled={aiTaskCreateInFlight}
                                onChange={(event) =>
                                  updateNewAiTaskPromptDraft("includeMemoTranscriptText", event.currentTarget.checked)
                                }
                              />
                              Memo text/transcript
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>

                  <div className="settings-subsection-divider">
                    <span>Configured tasks</span>
                    <strong>{settingsSummary.aiTasks.length}</strong>
                  </div>

                  <div className="settings-list task-card-list">
                    {settingsSummary.aiTasks.map((task) => {
                      const draft = aiTaskRouteDrafts[task.id] ?? {
                        displayName: task.displayName,
                        description: task.description ?? "",
                        hookKey: task.hookKey,
                        renderLocation: task.renderLocation,
                        displayOrder: task.displayOrder,
                        providerConfigId: task.selectedProviderId ?? "",
                        modelName: task.selectedModelName ?? "",
                        promptsEnabled: task.prompt !== null,
                        enabled: task.routeEnabled
                      };
                      const selectedProvider = settingsSummary.providers.find(
                        (provider) => provider.id === draft.providerConfigId
                      );
                      const prompt = task.prompt;
                      const promptDraft =
                        prompt === null
                          ? null
                          : promptDrafts[prompt.id] ?? {
                              freeformText: prompt.body ?? "",
                              systemMessage: defaultSystemMessage,
                              includeProjectSynopsis: true,
                              includeMemoMetadata: true,
                              includeMemoTranscriptText: true
                            };
                      return (
                        <article className="settings-row provider-task-row task-configured-card" key={task.id}>
                          <div className="task-card-title">
                            <strong>{draft.displayName || task.displayName}</strong>
                          </div>
                          <div>
                            <div className="provider-route-controls task-route-controls task-existing-route-controls">
                              <label>
                                <span>Task Name</span>
                                <input
                                  type="text"
                                  value={draft.displayName}
                                  disabled={aiTaskIdInFlight === task.id}
                                  onChange={(event) =>
                                    updateAiTaskRouteDraft(task.id, "displayName", event.currentTarget.value)
                                  }
                                />
                              </label>
                              <label>
                                <span>Hook Key</span>
                                <select
                                  value={draft.hookKey}
                                  disabled={aiTaskIdInFlight === task.id}
                                  onChange={(event) =>
                                    updateAiTaskRouteDraft(task.id, "hookKey", event.currentTarget.value)
                                  }
                                >
                                  {!registeredTaskHooks.some((hook) => hook.hookKey === draft.hookKey) &&
                                  draft.hookKey.trim() !== "" ? (
                                    <option value={draft.hookKey}>{draft.hookKey}</option>
                                  ) : null}
                                  {registeredTaskHooks.map((hook) => (
                                    <option value={hook.hookKey} key={hook.hookKey}>
                                      {hook.displayName}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Render Location</span>
                                <select
                                  value={draft.renderLocation}
                                  disabled={aiTaskIdInFlight === task.id}
                                  onChange={(event) =>
                                    updateAiTaskRouteDraft(
                                      task.id,
                                      "renderLocation",
                                      event.currentTarget.value as TaskRenderLocation
                                    )
                                  }
                                >
                                  {taskRenderLocationOptions.map((option) => (
                                    <option value={option.value} key={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Order</span>
                                <input
                                  type="number"
                                  value={draft.displayOrder}
                                  disabled={aiTaskIdInFlight === task.id}
                                  onChange={(event) =>
                                    updateAiTaskRouteDraft(
                                      task.id,
                                      "displayOrder",
                                      Number.parseInt(event.currentTarget.value, 10) || 0
                                    )
                                  }
                                />
                              </label>
                              <label>
                                <span>Provider Key</span>
                                <select
                                  value={draft.providerConfigId}
                                  disabled={aiTaskIdInFlight === task.id}
                                  onChange={(event) => {
                                    const provider = settingsSummary.providers.find(
                                      (candidate) => candidate.id === event.currentTarget.value
                                    );
                                    updateAiTaskRouteDraft(task.id, "providerConfigId", event.currentTarget.value);
                                    updateAiTaskRouteDraft(task.id, "modelName", provider?.modelName ?? "");
                                  }}
                                >
                                  <option value="">No provider</option>
                                  {settingsSummary.providers.map((provider) => (
                                    <option key={provider.id} value={provider.id}>
                                      {provider.providerName}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Provider Kind</span>
                                <input type="text" value={selectedProvider?.providerKind ?? ""} readOnly />
                              </label>
                              <label>
                                <span>Task Description</span>
                                <input
                                  type="text"
                                  value={draft.description}
                                  disabled={aiTaskIdInFlight === task.id}
                                  onChange={(event) =>
                                    updateAiTaskRouteDraft(task.id, "description", event.currentTarget.value)
                                  }
                                />
                              </label>
                              <label>
                                <span title="Optional per-task model override. Leave blank to use the selected provider default.">
                                  Model override
                                </span>
                                <input
                                  type="text"
                                  value={draft.modelName}
                                  disabled={aiTaskIdInFlight === task.id}
                                  onChange={(event) =>
                                    updateAiTaskRouteDraft(task.id, "modelName", event.currentTarget.value)
                                  }
                                />
                              </label>
                              <label className="toggle-row">
                                <input
                                  type="checkbox"
                                  checked={draft.promptsEnabled}
                                  disabled={aiTaskIdInFlight === task.id}
                                  onChange={(event) =>
                                    updateAiTaskRouteDraft(task.id, "promptsEnabled", event.currentTarget.checked)
                                  }
                                />
                                Prompts
                              </label>
                              <label className="toggle-row">
                                <input
                                  type="checkbox"
                                  checked={draft.enabled}
                                  disabled={
                                    aiTaskIdInFlight === task.id ||
                                    !registeredTaskHooks.some(
                                      (hook) => hook.hookKey === draft.hookKey && hook.implemented
                                    )
                                  }
                                  onChange={(event) =>
                                    updateAiTaskRouteDraft(task.id, "enabled", event.currentTarget.checked)
                                  }
                                />
                                Enabled
                              </label>
                            </div>
                            {!draft.promptsEnabled || prompt === null || promptDraft === null ? null : (
                              <div className="prompt-editor-row task-prompt-editor">
                                <div className="field-group">
                                  <label htmlFor={`prompt-${prompt.id}-freeform`}>Prompt text</label>
                                  <textarea
                                    id={`prompt-${prompt.id}-freeform`}
                                    value={promptDraft.freeformText}
                                    rows={6}
                                    onChange={(event) =>
                                      updatePromptDraft(prompt.id, "freeformText", event.currentTarget.value)
                                    }
                                  />
                                </div>
                                <div className="field-group">
                                  <div className="field-label-row">
                                    <label htmlFor={`prompt-${prompt.id}-system`}>System message</label>
                                    <button
                                      className="icon-button compact-icon-button"
                                      type="button"
                                      title="Restore default system message"
                                      aria-label="Restore default system message"
                                      disabled={aiTaskIdInFlight === task.id}
                                      onClick={() => restoreTaskSystemMessageDefault(task)}
                                    >
                                      <RotateCcw size={15} />
                                    </button>
                                  </div>
                                  <textarea
                                    id={`prompt-${prompt.id}-system`}
                                    value={promptDraft.systemMessage}
                                    rows={3}
                                    onChange={(event) =>
                                      updatePromptDraft(prompt.id, "systemMessage", event.currentTarget.value)
                                    }
                                  />
                                </div>
                                <div className="prompt-toggle-grid">
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={promptDraft.includeProjectSynopsis}
                                      onChange={(event) =>
                                        updatePromptDraft(prompt.id, "includeProjectSynopsis", event.currentTarget.checked)
                                      }
                                    />
                                    Project synopsis
                                  </label>
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={promptDraft.includeMemoMetadata}
                                      onChange={(event) =>
                                        updatePromptDraft(prompt.id, "includeMemoMetadata", event.currentTarget.checked)
                                      }
                                    />
                                    Memo metadata
                                  </label>
                                  <label>
                                    <input
                                      type="checkbox"
                                      checked={promptDraft.includeMemoTranscriptText}
                                      onChange={(event) =>
                                        updatePromptDraft(prompt.id, "includeMemoTranscriptText", event.currentTarget.checked)
                                      }
                                    />
                                    Memo text/transcript
                                  </label>
                                </div>
                              </div>
                            )}
                            <div className="task-card-actions task-card-footer-actions">
                              <button
                                className="row-action-button danger"
                                type="button"
                                disabled={aiTaskIdInFlight === task.id}
                                onClick={() => void deleteAiTaskDefinition(task)}
                              >
                                <Trash2 size={18} />
                                Delete task
                              </button>
                              <button
                                className="primary-button"
                                type="button"
                                disabled={aiTaskIdInFlight === task.id}
                                onClick={() => void saveAiTaskRoute(task.id)}
                              >
                                {aiTaskIdInFlight === task.id ? (
                                  <RefreshCcw className="spin" size={18} />
                                ) : (
                                  <Save size={18} />
                                )}
                                Save task
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : activeSettingsSection === "export" ? (
                <section className="detail-section" aria-label="Export contract">
                  <dl className="metadata-list compact-metadata">
                    <div>
                      <dt>Schema</dt>
                      <dd>
                        <span>{MEMO_CAPTURE_EXPORT_SCHEMA_VERSION}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Text</dt>
                      <dd>
                        <span>
                          {settingsSummary.fileTypes
                            .filter((fileType) => fileType.mediaKind === "text" && fileType.capabilityState === "active")
                            .map((fileType) => fileType.extension)
                            .join(", ")}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Audio</dt>
                      <dd>
                        <span>
                          {settingsSummary.fileTypes
                            .filter((fileType) => fileType.mediaKind === "audio" && fileType.capabilityState === "active")
                            .map((fileType) => fileType.extension)
                            .join(", ")}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </section>
              ) : activeSettingsSection === "operations" ? (
                <section className="detail-section operations-section" aria-label="Workflow operations">
                  <div className="settings-row-header">
                    <div className="section-title">
                      <PackageCheck size={18} />
                      <h3>Active workflow</h3>
                    </div>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={workflowStatusLoading}
                      onClick={() => void loadWorkflowStatus()}
                    >
                      <RefreshCcw className={workflowStatusLoading ? "spin" : ""} size={18} />
                      Refresh
                    </button>
                  </div>
                  {workflowStatus?.active === null ? (
                    <div className="empty-detail compact-empty">
                      <CircleSlash size={22} />
                      <span>No active workflow bundle</span>
                    </div>
                  ) : (
                    <dl className="metadata-list compact-metadata">
                      <div>
                        <dt>Workflow ID</dt>
                        <dd>
                          <span>{workflowStatus?.active?.workflowId ?? "not loaded"}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>Workflow</dt>
                        <dd>
                          <span>{workflowStatus?.active?.workflowVersion ?? "not loaded"}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>State machine</dt>
                        <dd>
                          <span>{workflowStatus?.active?.stateMachineVersion ?? "not loaded"}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>Content hash</dt>
                        <dd>
                          <span>{workflowStatus?.active?.contentHash ?? "not loaded"}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>Activated</dt>
                        <dd>
                          <span>
                            {workflowStatus?.active?.activatedAt === undefined
                              ? "not loaded"
                              : formatDate(workflowStatus.active.activatedAt)}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>Hook handlers</dt>
                        <dd>
                          <span>
                            {(workflowStatus?.supportedHookHandlers ?? []).length === 0
                              ? "none"
                              : (workflowStatus?.supportedHookHandlers ?? []).join(", ")}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  )}

                  <div className="settings-row workflow-import-panel">
                    <div className="settings-row-header">
                      <div className="section-title">
                        <PackagePlus size={18} />
                        <h3>Workflow bundle import</h3>
                      </div>
                      <span className="detail-count">
                        {workflowImportFile === null ? "No file selected" : workflowImportFile.name}
                      </span>
                    </div>
                    <div className="field-grid">
                      <div className="field-group">
                        <label htmlFor="workflow-bundle-file">JSON bundle</label>
                        <input
                          id="workflow-bundle-file"
                          type="file"
                          accept="application/json,.json"
                          onChange={handleWorkflowImportFileChange}
                        />
                      </div>
                      <div className="field-group">
                        <label htmlFor="workflow-import-notes">Notes</label>
                        <input
                          id="workflow-import-notes"
                          value={workflowImportNotes}
                          onChange={(event) => setWorkflowImportNotes(event.currentTarget.value)}
                          placeholder="Why this workflow is being staged"
                        />
                      </div>
                    </div>
                    <div className="detail-actions">
                      <button
                        className="primary-button"
                        type="button"
                        disabled={workflowImportInFlight}
                        onClick={() => void validateAndStageWorkflowImport()}
                      >
                        {workflowImportInFlight ? <RefreshCcw className="spin" size={18} /> : <CheckCircle2 size={18} />}
                        Validate and stage
                      </button>
                      {workflowImportError === null ? null : <span className="muted-text">{workflowImportError}</span>}
                    </div>
                  </div>

                  {workflowImportResult === null ? null : (
                    <div className="settings-row workflow-staged-panel">
                      <div className="settings-row-header">
                        <div className="section-title">
                          {workflowImportResult.validation.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                          <h3>Staged validation</h3>
                        </div>
                        <span className={`state-chip state-${workflowImportResult.validation.ok ? "accepted" : "failed"}`}>
                          {workflowImportResult.status}
                        </span>
                      </div>
                      <dl className="metadata-list compact-metadata">
                        <div>
                          <dt>Staged ID</dt>
                          <dd>
                            <span>{workflowImportResult.stagedImportId}</span>
                          </dd>
                        </div>
                        <div>
                          <dt>Validation</dt>
                          <dd>
                            <span>{workflowImportResult.validation.ok ? "valid" : "invalid"}</span>
                          </dd>
                        </div>
                        <div>
                          <dt>Workflow ID</dt>
                          <dd>
                            <span>{workflowImportResult.identity?.workflowId ?? "unavailable"}</span>
                          </dd>
                        </div>
                        <div>
                          <dt>Workflow</dt>
                          <dd>
                            <span>{workflowImportResult.identity?.workflowVersion ?? "unavailable"}</span>
                          </dd>
                        </div>
                        <div>
                          <dt>State machine</dt>
                          <dd>
                            <span>{workflowImportResult.identity?.stateMachineVersion ?? "unavailable"}</span>
                          </dd>
                        </div>
                        <div>
                          <dt>Content hash</dt>
                          <dd>
                            <span>{workflowImportResult.identity?.contentHash ?? "unavailable"}</span>
                          </dd>
                        </div>
                      </dl>
                      <div className="workflow-validation-grid">
                        <div>
                          <strong>Warnings</strong>
                          {workflowImportResult.validation.warnings.length === 0 ? (
                            <p className="muted-text">None</p>
                          ) : (
                            <ul>
                              {workflowImportResult.validation.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <strong>Errors</strong>
                          {workflowImportResult.validation.errors.length === 0 ? (
                            <p className="muted-text">None</p>
                          ) : (
                            <ul>
                              {workflowImportResult.validation.errors.map((error) => (
                                <li key={error}>{error}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                      <div className="status-banner warning">
                        <AlertTriangle size={18} />
                        <span>
                          Memo Capture stores only the active workflow bundle body. Rollback requires re-importing a
                          known-good bundle.
                        </span>
                      </div>
                    </div>
                  )}

                  {!validWorkflowImportReady ? null : (
                    <div className="settings-row workflow-activation-panel">
                      <div className="settings-row-header">
                        <div className="section-title">
                          <Check size={18} />
                          <h3>Activation</h3>
                        </div>
                      </div>
                      <div className="field-group">
                        <label htmlFor="workflow-activation-notes">Activation notes</label>
                        <input
                          id="workflow-activation-notes"
                          value={workflowActivationNotes}
                          onChange={(event) => setWorkflowActivationNotes(event.currentTarget.value)}
                          placeholder="Operator note for this activation"
                        />
                      </div>
                      <label className="toggle-row workflow-confirmation-row">
                        <input
                          type="checkbox"
                          checked={workflowActivationConfirmed}
                          onChange={(event) => setWorkflowActivationConfirmed(event.currentTarget.checked)}
                        />
                        I understand activation replaces the active workflow bundle and rollback requires re-import.
                      </label>
                      <div className="detail-actions">
                        <button
                          className="primary-button"
                          type="button"
                          disabled={!workflowActivationConfirmed || workflowActivationInFlight}
                          onClick={() => void activateStagedWorkflow()}
                        >
                          {workflowActivationInFlight ? (
                            <RefreshCcw className="spin" size={18} />
                          ) : (
                            <PackageCheck size={18} />
                          )}
                          Activate workflow
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              ) : (
                <>
                  <section className="detail-section" aria-label="Diagnostics">
                    <dl className="metadata-list compact-metadata">
                      <div>
                        <dt>Auth</dt>
                        <dd>
                          <span>{settingsSummary.auth.mode}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>OIDC</dt>
                        <dd>
                          <span>{settingsSummary.auth.oidcConfigured ? "Configured" : "Not configured"}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>Transcription</dt>
                        <dd>
                          <span>
                            {settingsSummary.transcription?.runtimeProvider ?? "not configured"} /{" "}
                            {settingsSummary.transcription?.runtimeModelName ?? "not configured"}
                          </span>
                        </dd>
                      </div>
                    </dl>
                  </section>
                </>
              )}
            </section>
          </div>
        ) : activeView === "audit" ? (
          <div className="audit-grid">
            <section className="detail-panel audit-events-panel" aria-label="Audit events">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Diagnostics</p>
                  <h2>Audit events</h2>
                </div>
                <FileText size={22} />
              </div>
              {auditEvents.length === 0 ? (
                <div className="empty-detail">
                  <CircleSlash size={22} />
                  <span>No audit events match this filter</span>
                </div>
              ) : null}
              <div className="audit-event-list">
                {auditEvents.map((event) => {
                  const summary = summarizeAuditEvent(event, {
                    workItemById,
                    projectById
                  });
                  return (
                    <article className="audit-event-row" key={event.id} title={summary.title}>
                      <div className="audit-event-line">
                        <strong>{summary.label}</strong>
                        <time className="audit-event-time" dateTime={event.createdAt}>
                          {formatDate(event.createdAt)}
                        </time>
                        {summary.details.map((detail) => (
                          <span className="audit-event-detail" key={detail}>
                            {detail}
                          </span>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="detail-panel runtime-debugger-panel" aria-label="Runtime event-journal debugger">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">State Workflow Runtime</p>
                  <h2>Event journal debugger</h2>
                </div>
                <Settings size={22} />
              </div>
              <MemoWorkflowDebuggerPanel
                runtime={workflowDebuggerRuntime}
                classNames={{
                  root: "memo-debugger",
                  toolbar: "memo-debugger-toolbar",
                  button: "row-action-button",
                  state: "memo-debugger-state",
                  views: "memo-debugger-views",
                  timeline: "memo-debugger-timeline",
                  event: "memo-debugger-event",
                  selectedEvent: "memo-debugger-event-selected",
                  detail: "memo-debugger-detail",
                  metadata: "memo-debugger-metadata"
                }}
              />
            </section>
          </div>
        ) : null}

        {photoViewer === null ? null : (
          <div className="modal-backdrop" role="presentation">
            <section
              className="review-modal photos-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="photos-modal-title"
              tabIndex={-1}
              ref={photoModalRef}
              onKeyDown={handlePhotoModalKeyDown}
            >
              <header className="review-modal-header">
                <div className="photos-modal-title">
                  <h2 id="photos-modal-title">Photos</h2>
                  <span>{photoViewer.title}</span>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  title="Close photos"
                  aria-label="Close photos"
                  onClick={closePhotoViewer}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="review-modal-body photos-modal-body">
                {photoViewerLoadState === "loading" ? (
                  <div className="empty-detail inline-empty">
                    <RefreshCcw className="spin" size={22} />
                    <span>Loading photos</span>
                  </div>
                ) : null}
                {photoViewerLoadState === "error" ? (
                  <div className="status-banner warning">
                    <AlertTriangle size={18} />
                    <span>{photoViewerError ?? "Unable to load attached photos."}</span>
                  </div>
                ) : null}
                {photoViewerLoadState === "ready" && photoViewerPhotos.length === 0 ? (
                  <div className="empty-detail inline-empty">
                    <Camera size={22} />
                    <span>No attached photos</span>
                  </div>
                ) : null}
                {photoViewerPhotos.length === 0 ? null : (
                  <div className="photos-gallery-shell">
                    <button
                      className="photos-gallery-arrow"
                      type="button"
                      title="Previous photos"
                      aria-label="Previous photos"
                      disabled={!photoGalleryScrollState.canScrollLeft}
                      onClick={() => scrollPhotoGallery("left")}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div
                      className="photos-gallery"
                      ref={photoGalleryRef}
                      tabIndex={0}
                      onScroll={updatePhotoGalleryScrollState}
                    >
                      {photoViewerPhotos.map((photo) => (
                        <figure className="photos-gallery-tile" key={photo.originalArtifactId}>
                          <img
                            src={photo.objectUrl}
                            alt={photo.originalFilename ?? "Attached photo"}
                            onLoad={updatePhotoGalleryScrollState}
                          />
                          <figcaption>
                            <strong>{photo.originalFilename ?? "Attached photo"}</strong>
                            <span>
                              {photo.capturedAt === null ? "No captured date" : formatDate(photo.capturedAt)}
                            </span>
                            <span>
                              {[photo.cameraMake, photo.cameraModel].filter(Boolean).join(" ") || photo.mimeType}
                            </span>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                    <button
                      className="photos-gallery-arrow"
                      type="button"
                      title="Next photos"
                      aria-label="Next photos"
                      disabled={!photoGalleryScrollState.canScrollRight}
                      onClick={() => scrollPhotoGallery("right")}
                    >
                      <ChevronRight size={20} />
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {pendingWorkflowAction === null ? null : (
          <div className="modal-backdrop" role="presentation">
            <section
              className="review-modal workflow-action-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="workflow-action-confirm-title"
            >
              <header className="review-modal-header">
                <div>
                  <p className="eyebrow">Workflow action</p>
                  <h2 id="workflow-action-confirm-title">Run {pendingWorkflowAction.action.label}?</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  title="Close"
                  aria-label="Close workflow action confirmation"
                  disabled={actionIdInFlight !== null}
                  onClick={() => setPendingWorkflowAction(null)}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="review-modal-body">
                <article className={`workflow-action-summary ${pendingWorkflowAction.intent}`}>
                  <AlertTriangle size={20} />
                  <div>
                    <strong>{pendingWorkflowAction.targetItem.title}</strong>
                    <p>
                      This will move the memo from {stateLabel(pendingWorkflowAction.targetItem.workflowState)} using the
                      workflow action {pendingWorkflowAction.action.label}.
                    </p>
                  </div>
                </article>
              </div>
              <footer className="review-modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={actionIdInFlight !== null}
                  onClick={() => setPendingWorkflowAction(null)}
                >
                  <CircleSlash size={18} />
                  Cancel
                </button>
                <button
                  className={`row-action-button ${pendingWorkflowAction.intent}`}
                  type="button"
                  disabled={actionIdInFlight !== null}
                  onClick={() => {
                    const pending = pendingWorkflowAction;
                    setPendingWorkflowAction(null);
                    void executeWorkflowAction(pending.action, pending.targetItem, true);
                  }}
                >
                  {actionIdInFlight === `${pendingWorkflowAction.targetItem.id}:${pendingWorkflowAction.action.id}` ? (
                    <RefreshCcw className="spin" size={18} />
                  ) : (
                    <AlertTriangle size={18} />
                  )}
                  Run {pendingWorkflowAction.action.label}
                </button>
              </footer>
            </section>
          </div>
        )}

        {expandedMemoReview === null ? null : (
          <div className="modal-backdrop" role="presentation">
            <section
              className="review-modal expanded-memo-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="expanded-memo-review-title"
            >
              <header className="review-modal-header">
                <div>
                  <p className="eyebrow">{expandedMemoReview.taskDisplayName}</p>
                  <h2 id="expanded-memo-review-title">Expanded memo</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  title="Close"
                  aria-label="Close expanded memo review"
                  onClick={() => setExpandedMemoReview(null)}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="review-modal-body">
                <article className="review-candidate">
                  <div className="batch-title">
                    <strong>{expandedMemoReview.title}</strong>
                    <span>{expandedMemoReview.providerName}/{expandedMemoReview.modelName}</span>
                  </div>
                  <p>{expandedMemoReview.body}</p>
                  <div className="item-meta">
                    {expandedMemoReview.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </article>
              </div>
              <footer className="review-modal-actions">
                <button className="secondary-button" type="button" onClick={() => setExpandedMemoReview(null)}>
                  <CircleSlash size={18} />
                  Reject
                </button>
                <button className="primary-button" type="button" onClick={acceptExpandedMemoReview}>
                  <Check size={18} />
                  Accept
                </button>
              </footer>
            </section>
          </div>
        )}

        {suggestedWorkItemReview === null || suggestedWorkItemReview.candidates.length === 0 ? null : (
          <div className="modal-backdrop" role="presentation">
            <section
              className="review-modal suggested-items-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="suggested-items-review-title"
            >
              <header className="review-modal-header">
                <div>
                  <p className="eyebrow">{suggestedWorkItemReview.taskDisplayName}</p>
                  <h2 id="suggested-items-review-title">Suggested work items</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  title="Close"
                  aria-label="Close suggested work item review"
                  onClick={() => setSuggestedWorkItemReview(null)}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="review-modal-body review-candidate-list">
                {suggestedWorkItemReview.candidates.map((candidate) => (
                  <article className="review-candidate" key={candidate.id}>
                    <div>
                      <div className="suggestion-kicker">
                        <PackagePlus size={15} />
                        <span>Suggested new work item</span>
                      </div>
                      <div className="batch-title">
                        <strong>{candidate.title}</strong>
                        <span>{candidate.providerName}/{candidate.modelName}</span>
                      </div>
                      <p>{candidate.body}</p>
                      <div className="item-meta">
                        {candidate.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                      <p className="candidate-message">{candidate.rationale}</p>
                    </div>
                    <div className="suggestion-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={suggestionIdInFlight !== null}
                        onClick={() => rejectSuggestedWorkItem(candidate.id)}
                      >
                        <CircleSlash size={18} />
                        Reject
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={suggestionIdInFlight !== null}
                        onClick={() => void acceptSuggestedWorkItem(candidate)}
                      >
                        {suggestionIdInFlight === candidate.id ? (
                          <RefreshCcw className="spin" size={18} />
                        ) : (
                          <Check size={18} />
                        )}
                        Accept
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

      </section>
    </main>
  );
}

async function loadWorkItems(token: string, bucketId: string | null): Promise<{ workItems: WorkItem[] }> {
  const query = bucketId === null ? "" : `?bucketId=${encodeURIComponent(bucketId)}`;
  return authedJson<{ workItems: WorkItem[] }>(token, `/api/work-items${query}`);
}

async function authedJson<Result>(token: string, path: string, init: RequestInit = {}): Promise<Result> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");
  return requestJson<Result>(path, { ...init, headers });
}

async function authedFetch(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    let errorBody: ApiErrorBody = {};
    try {
      errorBody = (await response.json()) as ApiErrorBody;
    } catch {
      errorBody = {
        error: {
          code: "request_failed",
          message: `Request failed with status ${response.status}`
        }
      };
    }
    throw new ApiError(response.status, errorBody);
  }
  return response;
}

async function requestJson<Result>(path: string, init: RequestInit = {}): Promise<Result> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    throw new ApiError(response.status, body as ApiErrorBody);
  }
  return body as Result;
}

function normalizeSettingsSummary(summary: SettingsSummary): SettingsSummary {
  return {
    ...summary,
    mediaTypes: Array.isArray(summary.mediaTypes) ? summary.mediaTypes : [],
    parserTypes: Array.isArray(summary.parserTypes) ? summary.parserTypes : [],
    fileTypes: Array.isArray(summary.fileTypes) ? summary.fileTypes : [],
    extraction: summary.extraction ?? defaultExtractionSettings,
    providers: Array.isArray(summary.providers) ? summary.providers : [],
    providerCapabilities: Array.isArray(summary.providerCapabilities) ? summary.providerCapabilities : [],
    taskKinds: Array.isArray(summary.taskKinds) ? summary.taskKinds : [],
    aiTasks: Array.isArray(summary.aiTasks)
      ? summary.aiTasks.map((task) => ({
          ...task,
          renderLocation: normalizeTaskRenderLocation(task.renderLocation),
          displayOrder: typeof task.displayOrder === "number" ? task.displayOrder : 0,
          prompt: task.prompt == null ? null : normalizePromptSummary(task.prompt)
        }))
      : [],
    appLauncher: summary.appLauncher ?? null,
    registeredTaskHooks: Array.isArray(summary.registeredTaskHooks)
      ? summary.registeredTaskHooks
          .filter((hook) => typeof hook.hookKey === "string" && hook.hookKey.trim() !== "")
          .map((hook) => ({
            hookKey: hook.hookKey,
            displayName:
              typeof hook.displayName === "string" && hook.displayName.trim() !== ""
                ? hook.displayName
                : hook.hookKey,
            implemented: hook.implemented === true,
            status: typeof hook.status === "string" ? hook.status : hook.implemented === true ? "custom_function_implemented" : "default_noop",
            statusLabel:
              typeof hook.statusLabel === "string" && hook.statusLabel.trim() !== ""
                ? hook.statusLabel
                : hook.implemented === true
                  ? "Custom function implemented"
                  : "Default no-op",
            taskUsageCount: typeof hook.taskUsageCount === "number" ? hook.taskUsageCount : 0,
            deletable: hook.deletable === true,
            deleteBlockedReason:
              typeof hook.deleteBlockedReason === "string" ? hook.deleteBlockedReason : null,
            createdAt: typeof hook.createdAt === "string" ? hook.createdAt : "",
            updatedAt: typeof hook.updatedAt === "string" ? hook.updatedAt : ""
          }))
      : [],
    prompts: Array.isArray(summary.prompts)
      ? summary.prompts.map((prompt) => normalizePromptSummary(prompt))
      : [],
    auth: summary.auth ?? {
      mode: "unknown",
      oidcConfigured: false
    }
  };
}

function normalizePromptSummary(prompt: PromptSummary): PromptSummary {
  const contextConfig = prompt.contextConfig ?? {
    ...defaultPromptContextConfig,
    freeformText: prompt.body ?? ""
  };
  return {
    ...prompt,
    contextConfig: {
      ...defaultPromptContextConfig,
      ...contextConfig,
      freeformText: contextConfig.freeformText || prompt.body || ""
    },
    outputSchema: prompt.outputSchema ?? {}
  };
}

function normalizeTaskRenderLocation(value: unknown): TaskRenderLocation {
  return value === "work_item_list" || value === "export_page" ? value : "work_item_detail";
}

function stateLabel(state: string): string {
  return state.replaceAll("_", " ");
}

function batchStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

function readDownloadFilename(contentDisposition: string | null): string | null {
  if (contentDisposition === null) {
    return null;
  }

  const match = /filename="([^"]+)"/.exec(contentDisposition);
  return match?.[1] ?? null;
}

function readWatchedFolderSettings(): WatchedFolderSetting[] {
  const raw = localStorage.getItem(watchedSettingsStorageKey);
  if (raw === null) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is Partial<WatchedFolderSetting> => item !== null && typeof item === "object")
      .map((item) => ({
        id: typeof item.id === "string" && item.id !== "" ? item.id : `watch-${crypto.randomUUID()}`,
        path: typeof item.path === "string" ? item.path : "",
        archivePath: typeof item.archivePath === "string" ? item.archivePath : "",
        contributorName: typeof item.contributorName === "string" ? item.contributorName : "",
        recursive: item.recursive === true,
        enabled: item.enabled !== false,
        stabilityMs: typeof item.stabilityMs === "number" && item.stabilityMs >= 1000 ? item.stabilityMs : 3000
      }));
  } catch {
    return [];
  }
}

function normalizeWatchedFileTimestamp(value: string, fallbackValue?: string): string {
  const trimmed = value.trim();
  const parsedValue = parseTimestampValue(trimmed);
  if (parsedValue !== null) {
    return parsedValue;
  }

  if (fallbackValue !== undefined) {
    return normalizeWatchedFileTimestamp(fallbackValue);
  }

  return new Date(0).toISOString();
}

function parseTimestampValue(value: string): string | null {
  if (value === "") {
    return null;
  }
  const date = /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function archiveImportedCandidate(input: {
  token: string;
  machineId: string;
  candidate: WatchedFileCandidate;
  archiveRoot: string;
  importEventId: string;
}): Promise<void> {
  try {
    const archivePath = await invoke<string>("archive_watched_file", {
      originalPath: input.candidate.path,
      archiveRoot: input.archiveRoot,
      archiveLeaf: buildArchiveLeaf(input.importEventId, input.candidate.filename)
    });
    await authedJson(input.token, `/api/imports/${encodeURIComponent(input.importEventId)}/archive-result`, {
      method: "POST",
      body: JSON.stringify({
        machineId: input.machineId,
        archivePath,
        status: "archived",
        warning: null
      })
    });
  } catch (error) {
    await authedJson(input.token, `/api/imports/${encodeURIComponent(input.importEventId)}/archive-result`, {
      method: "POST",
      body: JSON.stringify({
        machineId: input.machineId,
        archivePath: null,
        status: "archive_failed",
        warning: error instanceof Error ? error.message : "Archive move failed."
      })
    });
    throw error;
  }
}

function buildArchiveLeaf(importEventId: string, filename: string): string {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}/${importEventId.slice(0, 8)}-${filename}`;
}

async function sha256Digest(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

function mimeTypeForExtension(extension: string, mediaKind?: string): string {
  switch (extension.toLowerCase()) {
    case ".m4a":
      return "audio/mp4";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    case ".md":
    case ".markdown":
      return "text/markdown";
    default:
      if (mediaKind === "audio") {
        return "application/octet-stream";
      }
      if (mediaKind === "image") {
        return "image/*";
      }
      return "text/plain";
  }
}

function requireValue<Value>(value: Value | null | undefined, message: string): Value {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

function statusLabel(state: string): string {
  return state.replaceAll("_", " ");
}

function workflowActionIntent(action: AllowedWorkflowAction): "primary" | "secondary" | "warning" | "danger" {
  const key = `${action.id} ${action.label}`.toLowerCase();
  if (key.includes("accept") || key.includes("review")) {
    return "primary";
  }
  if (key.includes("fail")) {
    return "warning";
  }
  if (key.includes("reject")) {
    return "danger";
  }
  return "secondary";
}

function workflowActionTitle(action: AllowedWorkflowAction): string {
  const intent = workflowActionIntent(action);
  if (intent === "primary") {
    return "Primary next workflow action";
  }
  if (intent === "warning") {
    return "Marks this memo as failed after confirmation";
  }
  if (intent === "danger") {
    return "Rejects this memo after confirmation";
  }
  return "Secondary workflow action";
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const dateValue = /^\d+$/.test(value) ? Number.parseInt(value, 10) : value;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateValue));
}

function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

function formatPhotoCount(count: number): string {
  return `${count} ${count === 1 ? "photo" : "photos"}`;
}

function formatRelativeTime(value: Date): string {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - value.getTime()) / 1000));
  if (elapsedSeconds < 10) {
    return "just now";
  }
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }
  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }
  return formatDate(value.toISOString());
}

function formatEventDateTime(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(value);
}
