import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { WorkflowDebuggerPanelView, useWorkflowDebugger } from "@state-workflow/debugger-react";
import type {
  ItemRef,
  RuntimeDebuggerSnapshot,
  WorkflowDebuggerController,
  WorkflowDebuggerState,
  WorkflowEventJournalRecord,
  WorkflowEventViews,
  WorkflowRuntime
} from "state-workflow-runtime";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleSlash,
  Copy,
  Download,
  FileText,
  FolderInput,
  FolderOpen,
  FolderSearch,
  Headphones,
  Moon,
  PackageCheck,
  PackagePlus,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings,
  Sun,
  Trash2,
  Upload
} from "lucide-react";
import {
  ACTIVE_AUDIO_FILE_EXTENSIONS,
  ACTIVE_TEXT_FILE_EXTENSIONS,
  MEMO_CAPTURE_EXPORT_SCHEMA_VERSION
} from "@memo-capture/domain";

type LoadState = "loading" | "ready" | "error";
type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
type ActiveView = "work-items" | "audit" | "exports" | "watched-folders" | "settings";
type ThemeMode = "light" | "dark";

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

interface WorkItem {
  id: string;
  sourceMemoId: string;
  projectId: string | null;
  featureGroupId: string | null;
  contributorText: string | null;
  contributorId: string | null;
  title: string;
  body: string;
  bodyFormat: string;
  workflowState: string;
  workflowItemVersion: number;
  acceptedSnapshotId: string | null;
  acceptedUnexportedChanges: boolean;
  createdAt: string;
  updatedAt: string;
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
  context: string;
  isActive: boolean;
  updatedAt: string;
}

interface ProjectFormState {
  name: string;
  slug: string;
  description: string;
  context: string;
}

interface FeatureGroup {
  id: string;
  name: string;
  isActive: boolean;
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

interface DraftState {
  title: string;
  body: string;
  projectId: string;
  featureGroupId: string;
  contributorId: string;
  contributorText: string;
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
  featureGroup: {
    id: string;
    name: string;
  } | null;
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
  modifiedAt: string;
}

type ImportCandidateState = "idle" | "importing" | "imported" | "duplicate" | "error";

interface ImportCandidateStatus {
  state: ImportCandidateState;
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
  workItemId: string;
  artifactId: string;
  importEventId: string;
  initialWorkflowState: string;
  processingJobs: string[];
}

interface AiSuggestion {
  id: string;
  parentWorkItemId: string;
  status: "pending" | "applied" | "dismissed";
  title: string;
  body: string;
  tags: string[];
  featureGroup: string | null;
  rationale: string | null;
  providerName: string | null;
  modelName: string | null;
  appliedWorkItemId: string | null;
  createdAt: string;
}

interface SettingsSummary {
  fileTypes: {
    id: string;
    extension: string;
    mediaKind: string;
    capabilityState: string;
    parserKey: string | null;
    updatedAt: string;
  }[];
  extraction: {
    projectConfidenceThreshold: number;
    featureGroupConfidenceThreshold: number;
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
    enabled: boolean;
    endpointConfigured: boolean;
    modelName: string | null;
    secretSource: string;
    secretConfigured: boolean;
    healthStatus: string;
    runtimeProvider: string;
    runtimeModelName: string;
    updatedAt: string;
  }[];
  prompts: {
    id: string;
    name: string;
    purpose: string;
    activeVersion: number;
    body: string | null;
    updatedAt: string;
  }[];
  auth: {
    mode: string;
    oidcConfigured: boolean;
  };
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
}

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
const appVersion = "0.1.0";
const watchedSettingsStorageKey = "memo-capture.watched-text-folders.v1";
const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const primaryNavigation: { id: ActiveView; label: string }[] = [
  { id: "work-items", label: "Work queue" },
  { id: "audit", label: "Audit" },
  { id: "exports", label: "Exports" },
  { id: "watched-folders", label: "Watched folders" },
  { id: "settings", label: "Settings" }
];

const MemoWorkflowDebuggerPanelView = WorkflowDebuggerPanelView as unknown as (props: {
  state: WorkflowDebuggerState;
  controller?: WorkflowDebuggerController | undefined;
  classNames: Record<string, string>;
}) => ReactElement | null;

function createDraft(item: WorkItem): DraftState {
  return {
    title: item.title,
    body: item.body,
    projectId: item.projectId ?? "",
    featureGroupId: item.featureGroupId ?? "",
    contributorId: item.contributorId ?? "",
    contributorText: item.contributorText ?? ""
  };
}

function createEmptyProjectForm(): ProjectFormState {
  return {
    name: "",
    slug: "",
    description: "",
    context: ""
  };
}

function createProjectForm(project: Project): ProjectFormState {
  return {
    name: project.name,
    slug: project.slug,
    description: project.description,
    context: project.context
  };
}

function createMemoCaptureWorkflowDebuggerRuntime(auditEvents: AuditEvent[]): WorkflowRuntime {
  let debuggerState: RuntimeDebuggerSnapshot["state"] = "running";
  let stepMode = false;
  let currentStep: WorkflowEventJournalRecord | undefined;
  const listeners = new Set<(event: WorkflowEventJournalRecord) => void>();

  const buildSnapshot = (itemRef?: ItemRef): RuntimeDebuggerSnapshot => {
    const events = projectAuditEventsToWorkflowEvents(auditEvents).filter((event) =>
      itemRef === undefined
        ? true
        : event.itemRef?.resourceType === itemRef.resourceType && event.itemRef.resourceId === itemRef.resourceId
    );
    const views = projectWorkflowEventViews(events);
    return {
      state: debuggerState,
      stepMode,
      ...(currentStep === undefined ? {} : { currentStep }),
      events,
      views
    };
  };

  const notify = () => {
    const latestEvent = projectAuditEventsToWorkflowEvents(auditEvents).at(-1);
    if (latestEvent === undefined) {
      return;
    }
    for (const listener of listeners) {
      listener(latestEvent);
    }
  };

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
        debuggerState = "running";
        stepMode = options?.stepMode ?? false;
        notify();
      },
      pause: async () => {
        debuggerState = "paused";
        notify();
      },
      resume: async () => {
        debuggerState = "running";
        notify();
      },
      stop: async () => {
        debuggerState = "stopped";
        notify();
      },
      step: async () => {
        currentStep = projectAuditEventsToWorkflowEvents(auditEvents).at(-1);
        notify();
      },
      getSnapshot: async (itemRef) => buildSnapshot(itemRef),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    }
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

function MemoWorkflowDebuggerPanel(props: {
  runtime: WorkflowRuntime;
  classNames: Record<string, string>;
}): ReactElement {
  const initialFilter = useMemo(() => ({ view: "journal" as const }), []);
  const { controller, state, loading, error } = useWorkflowDebugger({
    runtime: props.runtime,
    initialFilter
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

  return (
    <MemoWorkflowDebuggerPanelView
      state={state}
      controller={controller ?? undefined}
      classNames={props.classNames}
    />
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
  const [actions, setActions] = useState<AllowedWorkflowAction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [featureGroups, setFeatureGroups] = useState<FeatureGroup[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [search, setSearch] = useState("");
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
  const [selectedDiagnostics, setSelectedDiagnostics] = useState<WorkItemDiagnostics | null>(null);
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);
  const [audioLoadState, setAudioLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [transcriptSaving, setTranscriptSaving] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiExpanding, setAiExpanding] = useState(false);
  const [suggestionIdInFlight, setSuggestionIdInFlight] = useState<string | null>(null);
  const [settingsSummary, setSettingsSummary] = useState<SettingsSummary | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditFilter, setAuditFilter] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [projectDrafts, setProjectDrafts] = useState<Record<string, ProjectFormState>>({});
  const [newProjectDraft, setNewProjectDraft] = useState<ProjectFormState>(() => createEmptyProjectForm());
  const [projectIdInFlight, setProjectIdInFlight] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [detailPanelWidth, setDetailPanelWidth] = useState(560);

  const selectedBucket = buckets.find((bucket) => bucket.id === activeBucketId) ?? null;
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const featureGroupById = useMemo(
    () => new Map(featureGroups.map((featureGroup) => [featureGroup.id, featureGroup])),
    [featureGroups]
  );
  const contributorById = useMemo(
    () => new Map(contributors.map((contributor) => [contributor.id, contributor])),
    [contributors]
  );
  const visibleActions = actions.filter((action) => action.visible && !action.requiresInput);
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
        featureGroupById.get(item.featureGroupId ?? "")?.name ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [contributorById, featureGroupById, projectById, search, workItems]);
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
        snapshot.featureGroup?.name ?? "",
        snapshot.contributor?.text ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [exportSearch, exportSnapshots]);
  const workflowDebuggerRuntime = useMemo(
    () => createMemoCaptureWorkflowDebuggerRuntime(auditEvents),
    [auditEvents]
  );
  const selectedExportCount = filteredExportSnapshots.filter((snapshot) =>
    selectedExportSnapshotIds.has(snapshot.acceptedSnapshotId)
  ).length;
  const hasDraftChanges =
    draft !== null &&
    selectedItem !== null &&
    (draft.title !== selectedItem.title ||
      draft.body !== selectedItem.body ||
      draft.projectId !== (selectedItem.projectId ?? "") ||
      draft.featureGroupId !== (selectedItem.featureGroupId ?? "") ||
      draft.contributorId !== (selectedItem.contributorId ?? "") ||
      draft.contributorText !== (selectedItem.contributorText ?? ""));
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
      : activeView === "audit"
      ? "Audit"
      : activeView === "watched-folders"
      ? "Watched folders"
      : activeView === "settings"
      ? "Settings"
      : "Work queue";
  const pageDescription =
    activeView === "exports"
      ? "Accepted snapshots and generated export batches."
      : activeView === "audit"
      ? "Application audit history and workflow runtime event-journal debugging."
      : activeView === "watched-folders"
      ? "Desktop-local watched folders and import candidates."
      : activeView === "settings"
      ? "Provider, prompt, settings, and export contract details."
      : selectedBucket === null
      ? "No workflow scope is selected."
      : `${selectedBucket.label} scope selected.`;

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
    setWatchedFolders(readWatchedFolderSettings());
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
    if (accessToken === null || selectedItemId === null) {
      return;
    }

    const token = accessToken;
    const workItemId = selectedItemId;
    let cancelled = false;
    async function loadSelectedItem() {
      try {
        const [detailResponse, actionsResponse, diagnosticsResponse, suggestionsResponse] = await Promise.all([
          authedJson<{ workItem: WorkItem }>(token, `/api/work-items/${encodeURIComponent(workItemId)}`),
          authedJson<{ actions: AllowedWorkflowAction[] }>(
            token,
            `/api/work-items/${encodeURIComponent(workItemId)}/actions`
          ),
          authedJson<WorkItemDiagnostics>(
            token,
            `/api/work-items/${encodeURIComponent(workItemId)}/diagnostics`
          ),
          authedJson<{ suggestions: AiSuggestion[] }>(
            token,
            `/api/work-items/${encodeURIComponent(workItemId)}/ai-suggestions`
          )
        ]);
        if (cancelled) {
          return;
        }
        setSelectedItem(detailResponse.workItem);
        setDraft(createDraft(detailResponse.workItem));
        setActions(actionsResponse.actions);
        setSelectedDiagnostics(diagnosticsResponse);
        setAiSuggestions(suggestionsResponse.suggestions);
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
  }, [accessToken, selectedItemId]);

  useEffect(() => {
    if (accessToken === null || activeView !== "exports") {
      return;
    }

    void loadExports(accessToken).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load exports.");
    });
  }, [accessToken, activeView]);

  useEffect(() => {
    if (accessToken === null || activeView !== "settings") {
      return;
    }

    void loadSettings(accessToken).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load settings.");
    });
  }, [accessToken, activeView]);

  useEffect(() => {
    if (accessToken === null || activeView !== "audit") {
      return;
    }

    void loadAuditEvents(accessToken).catch((error) => {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load audit events.");
    });
  }, [accessToken, activeView]);

  async function loadWorkspace(token: string, requestedBucketId: string | null): Promise<void> {
    const [bucketResponse, projectsResponse, featureGroupsResponse, contributorsResponse] = await Promise.all([
      authedJson<{ buckets: WorkflowBucket[] }>(token, "/api/workflow/buckets"),
      authedJson<{ projects: Project[] }>(token, "/api/projects"),
      authedJson<{ featureGroups: FeatureGroup[] }>(token, "/api/feature-groups"),
      authedJson<{ contributors: Contributor[] }>(token, "/api/contributors")
    ]);
    const orderedBuckets = [...bucketResponse.buckets].sort((left, right) => left.order - right.order);
    const defaultBucketId =
      orderedBuckets.find((bucket) => bucket.label.toLowerCase() === "memos")?.id ?? orderedBuckets[0]?.id ?? null;
    const nextBucketId = requestedBucketId ?? defaultBucketId;
    const itemResponse = await loadWorkItems(token, nextBucketId);

    setBuckets(orderedBuckets);
    setProjects(projectsResponse.projects);
    setProjectDrafts(
      Object.fromEntries(projectsResponse.projects.map((project) => [project.id, createProjectForm(project)]))
    );
    setFeatureGroups(featureGroupsResponse.featureGroups);
    setContributors(contributorsResponse.contributors);
    setActiveBucketId(nextBucketId);
    setWorkItems(itemResponse.workItems);
    if (itemResponse.workItems.length === 0) {
      setSelectedItem(null);
      setDraft(null);
      setActions([]);
    }
    setSelectedItemId((current) =>
      current !== null && itemResponse.workItems.some((item) => item.id === current)
        ? current
        : itemResponse.workItems[0]?.id ?? null
    );
  }

  async function refreshBucket(bucketId = activeBucketId): Promise<void> {
    if (accessToken === null) {
      return;
    }

    const [bucketResponse, itemResponse] = await Promise.all([
      authedJson<{ buckets: WorkflowBucket[] }>(accessToken, "/api/workflow/buckets"),
      loadWorkItems(accessToken, bucketId)
    ]);
    setBuckets([...bucketResponse.buckets].sort((left, right) => left.order - right.order));
    setWorkItems(itemResponse.workItems);
    if (itemResponse.workItems.length === 0) {
      setSelectedItem(null);
      setDraft(null);
      setActions([]);
    }
    setSelectedItemId((current) =>
      current !== null && itemResponse.workItems.some((item) => item.id === current)
        ? current
        : itemResponse.workItems[0]?.id ?? null
    );
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
      const [settingsResponse, projectsResponse] = await Promise.all([
        authedJson<SettingsSummary>(token, "/api/settings"),
        authedJson<{ projects: Project[] }>(token, "/api/projects")
      ]);
      setSettingsSummary(settingsResponse);
      setProjects(projectsResponse.projects);
      setProjectDrafts(
        Object.fromEntries(projectsResponse.projects.map((project) => [project.id, createProjectForm(project)]))
      );
    } finally {
      setSettingsLoading(false);
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

    setActiveBucketId(bucketId);
    setSelectedItem(null);
    setDraft(null);
    setActions([]);
    setStatusMessage(null);
    try {
      const itemResponse = await loadWorkItems(accessToken, bucketId);
      setWorkItems(itemResponse.workItems);
      setSelectedItemId(itemResponse.workItems[0]?.id ?? null);
    } catch (error) {
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
      const response = await authedJson<{ workItem: WorkItem }>(
        accessToken,
        `/api/work-items/${encodeURIComponent(selectedItem.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: selectedItem.workflowItemVersion,
            title: draft.title,
            body: draft.body,
            projectId: draft.projectId,
            featureGroupId: draft.featureGroupId,
            contributorId: draft.contributorId,
            contributorText: draft.contributorText
          })
        }
      );
      setSelectedItem(response.workItem);
      setDraft(createDraft(response.workItem));
      setWorkItems((items) => items.map((item) => (item.id === response.workItem.id ? response.workItem : item)));
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

  async function runAction(action: AllowedWorkflowAction) {
    if (accessToken === null || selectedItem === null) {
      return;
    }

    const intent = workflowActionIntent(action);
    if (
      (action.confirmationRequired || intent === "danger" || intent === "warning") &&
      !window.confirm(`Run "${action.label}" on "${selectedItem.title}"?`)
    ) {
      return;
    }

    setActionIdInFlight(action.id);
    setStatusMessage(null);
    try {
      await authedJson(
        accessToken,
        `/api/work-items/${encodeURIComponent(selectedItem.id)}/actions/${encodeURIComponent(action.id)}`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: selectedItem.workflowItemVersion,
            confirmation: action.confirmationRequired
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

  function addWatchedFolder() {
    setWatchedSettingsSaved(false);
    setWatchedFolders((current) => [
      ...current,
      {
        id: `watch-${crypto.randomUUID()}`,
        path: "",
        archivePath: "",
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
  }

  async function scanWatchedFolders() {
    if (!isTauriRuntime) {
      setStatusMessage("Watched-folder scanning is available in the Tauri desktop app.");
      return;
    }

    setWatchScanInFlight(true);
    setStatusMessage(null);
    try {
      const candidates = await invoke<WatchedFileCandidate[]>("scan_watched_folders", {
        folders: watchedFolders
      });
      setWatchedCandidates(candidates);
      setCandidateStatuses({});
      setStatusMessage(`${candidates.length} stable watched files found.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to scan watched folders.");
    } finally {
      setWatchScanInFlight(false);
    }
  }

  async function importWatchedCandidate(candidate: WatchedFileCandidate) {
    if (accessToken === null || machineId === null) {
      setStatusMessage("Sign in and machine identity are required before importing watched files.");
      return;
    }

    const watchFolder = watchedFolders.find((folder) => folder.id === candidate.watchFolderId);
    if (watchFolder === undefined || watchFolder.archivePath.trim() === "") {
      setCandidateStatus(candidate.path, "error", "Archive path is required before import.");
      return;
    }

    setCandidateStatus(candidate.path, "importing", null);
    try {
      const bytes = new Uint8Array(await invoke<number[]>("read_watched_file", { path: candidate.path }));
      const contentHash = await sha256Digest(bytes);
      const sourceType = isAudioExtension(candidate.extension) ? "watched_audio_file" : "watched_text_file";
      const uploadSession = await authedJson<UploadSessionResponse>(accessToken, "/api/imports/upload-sessions", {
        method: "POST",
        body: JSON.stringify({
          machineId,
          watchFolderId: candidate.watchFolderId,
          sourceType,
          originalFilename: candidate.filename,
          originalPath: candidate.path,
          mimeType: mimeTypeForExtension(candidate.extension),
          byteSize: bytes.byteLength,
          contentHash
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
        return;
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
        sourceType === "watched_audio_file"
          ? "Audio imported and queued for transcription."
          : "Imported, finalized, and archived."
      );
      await refreshBucket();
    } catch (error) {
      setCandidateStatus(candidate.path, "error", error instanceof Error ? error.message : "Import failed.");
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

  async function requestAiExpansion() {
    if (accessToken === null || selectedItem === null) {
      return;
    }
    setAiExpanding(true);
    setStatusMessage(null);
    try {
      const response = await authedJson<{
        expandedWorkItem: { title: string; body: string; tags: string[]; featureGroup: string | null };
        suggestions: AiSuggestion[];
        providerName: string;
        modelName: string;
      }>(accessToken, `/api/work-items/${encodeURIComponent(selectedItem.id)}/ai-expansions`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setDraft((current) =>
        current === null
          ? current
          : {
              ...current,
              title: response.expandedWorkItem.title,
              body: response.expandedWorkItem.body
            }
      );
      setAiSuggestions((current) => [...response.suggestions, ...current]);
      setStatusMessage(`AI expansion generated with ${response.providerName}/${response.modelName}. Save applies the expanded draft.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to generate AI expansion.");
    } finally {
      setAiExpanding(false);
    }
  }

  async function acceptAiSuggestion(suggestionId: string) {
    if (accessToken === null) {
      return;
    }
    setSuggestionIdInFlight(suggestionId);
    setStatusMessage(null);
    try {
      const response = await authedJson<{ suggestion: AiSuggestion; workItem: WorkItem }>(
        accessToken,
        `/api/ai-suggestions/${encodeURIComponent(suggestionId)}/accept`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setAiSuggestions((current) =>
        current.map((suggestion) => (suggestion.id === response.suggestion.id ? response.suggestion : suggestion))
      );
      await refreshBucket();
      setSelectedItemId(response.workItem.id);
      setStatusMessage("AI suggestion accepted as a new memo.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to accept AI suggestion.");
    } finally {
      setSuggestionIdInFlight(null);
    }
  }

  async function dismissAiSuggestion(suggestionId: string) {
    if (accessToken === null) {
      return;
    }
    setSuggestionIdInFlight(suggestionId);
    setStatusMessage(null);
    try {
      const response = await authedJson<{ suggestion: AiSuggestion }>(
        accessToken,
        `/api/ai-suggestions/${encodeURIComponent(suggestionId)}/dismiss`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setAiSuggestions((current) =>
        current.map((suggestion) => (suggestion.id === response.suggestion.id ? response.suggestion : suggestion))
      );
      setStatusMessage("AI suggestion dismissed.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to dismiss AI suggestion.");
    } finally {
      setSuggestionIdInFlight(null);
    }
  }

  async function toggleProvider(providerId: string, enabled: boolean) {
    if (accessToken === null) {
      return;
    }
    setSettingsLoading(true);
    setStatusMessage(null);
    try {
      await authedJson(accessToken, `/api/settings/providers/${encodeURIComponent(providerId)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled })
      });
      await loadSettings(accessToken);
      setStatusMessage(enabled ? "Provider enabled." : "Provider disabled.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to update provider.");
    } finally {
      setSettingsLoading(false);
    }
  }

  function updateNewProjectDraft(field: keyof ProjectFormState, value: string) {
    setNewProjectDraft((current) => ({ ...current, [field]: value }));
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

  async function createProject() {
    if (accessToken === null) {
      return;
    }
    if (newProjectDraft.name.trim() === "") {
      setStatusMessage("Project name is required.");
      return;
    }

    setProjectIdInFlight("new");
    setStatusMessage(null);
    try {
      await authedJson(accessToken, "/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: newProjectDraft.name,
          slug: newProjectDraft.slug,
          description: newProjectDraft.description,
          context: newProjectDraft.context
        })
      });
      setNewProjectDraft(createEmptyProjectForm());
      await loadSettings(accessToken);
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
          slug: projectDraft.slug,
          description: projectDraft.description,
          context: projectDraft.context
        })
      });
      await loadSettings(accessToken);
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
      await loadSettings(accessToken);
      setStatusMessage("Project deactivated.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to deactivate project.");
    } finally {
      setProjectIdInFlight(null);
    }
  }

  function refreshCurrentView() {
    void (activeView === "exports"
      ? loadExports()
      : activeView === "watched-folders"
      ? scanWatchedFolders()
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
      setDetailPanelWidth(Math.min(760, Math.max(460, nextWidth)));
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
      return Math.min(760, Math.max(460, current + delta));
    });
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
            <h1>{pageTitle}</h1>
            <p>{pageDescription}</p>
          </div>
          <button
            className={activeView === "watched-folders" ? "secondary-button" : "icon-button"}
            type="button"
            title={activeView === "watched-folders" ? "Scan watched folders" : "Refresh current view"}
            aria-label={activeView === "watched-folders" ? "Scan watched folders" : "Refresh current view"}
            onClick={refreshCurrentView}
          >
            {activeView === "settings" && settingsLoading ? (
              <RefreshCcw className="spin" size={18} />
            ) : activeView === "audit" && auditLoading ? (
              <RefreshCcw className="spin" size={18} />
            ) : activeView === "watched-folders" && watchScanInFlight ? (
              <RefreshCcw className="spin" size={18} />
            ) : activeView === "watched-folders" ? (
              <FolderSearch size={18} />
            ) : (
              <RefreshCcw size={18} />
            )}
            {activeView === "watched-folders" ? "Scan" : null}
          </button>
        </header>

        {statusMessage !== null ? (
          <div className={`status-banner ${saveState === "conflict" ? "warning" : ""}`} role="status">
            <AlertTriangle size={18} />
            <span>{statusMessage}</span>
          </div>
        ) : null}

        {activeView === "work-items" ? (
          <div className="toolbar search-toolbar" role="search">
            <label htmlFor="work-item-search">Search work items</label>
            <div className="search-field">
              <Search size={18} />
              <input
                id="work-item-search"
                placeholder="Title, body, project, feature group, or contributor"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
            </div>
          </div>
        ) : activeView === "exports" ? (
          <div className="toolbar export-toolbar" role="search">
            <label htmlFor="export-search">Search snapshots</label>
            <div className="search-field">
              <Search size={18} />
              <input
                id="export-search"
                placeholder="Title, project, feature group, or contributor"
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
        ) : activeView === "watched-folders" ? (
          <div className="toolbar watched-toolbar">
            <FolderInput size={18} />
            <span>{watchedFolders.filter((folder) => folder.enabled).length} enabled folders</span>
            <button className="secondary-button" type="button" onClick={addWatchedFolder}>
              <Plus size={18} />
              Add folder
            </button>
            <button className="primary-button" type="button" onClick={saveWatchedFolders}>
              <Save size={18} />
              Save settings
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
              <span>Scope</span>
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
            {filteredItems.length === 0 ? (
              <div className="empty-state">
                <CircleSlash size={20} />
                <span>No work items in this bucket</span>
              </div>
            ) : null}

            {filteredItems.map((item) => {
              const rowActions = item.id === selectedItemId ? visibleActions : [];
              return (
                <article className={`item-row ${item.id === selectedItemId ? "selected" : ""}`} key={item.id}>
                  <button className="item-row-select" type="button" onClick={() => setSelectedItemId(item.id)}>
                    <div className="item-row-main">
                      <div className="item-title-line">
                        <FileText size={18} />
                        <h2>{item.title}</h2>
                      </div>
                      <p>{item.body}</p>
                    </div>
                    <div className="item-meta item-meta-column" aria-label="Project, feature, and contributor">
                      <span>{projectById.get(item.projectId ?? "")?.name ?? "No project"}</span>
                      {item.featureGroupId !== null ? (
                        <span>{featureGroupById.get(item.featureGroupId)?.name ?? "Feature group"}</span>
                      ) : null}
                      {item.contributorText !== null || item.contributorId !== null ? (
                        <span>
                          {item.contributorText ??
                            contributorById.get(item.contributorId ?? "")?.displayName ??
                            "Contributor"}
                        </span>
                      ) : null}
                    </div>
                    <span className={`state-chip state-${item.workflowState}`}>{stateLabel(item.workflowState)}</span>
                    <span className="updated-time">Updated {formatDate(item.updatedAt)}</span>
                  </button>
                  {rowActions.length === 0 ? null : (
                    <div className="row-action-groups" aria-label="Workflow actions for selected memo">
                      <span className="row-action-hint">
                        {hasDraftChanges ? "Save or reset edits before workflow actions" : "Workflow actions"}
                      </span>
                      {rowActions.map((action) => {
                        const intent = workflowActionIntent(action);
                        return (
                          <button
                            className={`row-action-button ${intent}`}
                            type="button"
                            key={action.id}
                            title={workflowActionTitle(action)}
                            disabled={actionIdInFlight !== null || hasDraftChanges}
                            onClick={() => void runAction(action)}
                          >
                            {action.id === actionIdInFlight ? (
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
                  )}
                </article>
              );
            })}
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

          <aside className="detail-panel" aria-label="Work item detail">
            {selectedItem === null || draft === null ? (
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
                  <span className={`state-chip state-${selectedItem.workflowState}`}>
                    {stateLabel(selectedItem.workflowState)}
                  </span>
                </div>

                <div className="detail-meta">
                  <span>Version {selectedItem.workflowItemVersion}</span>
                  <span>Updated {formatDate(selectedItem.updatedAt)}</span>
                  {selectedItem.acceptedUnexportedChanges ? <span>Accepted changes pending export</span> : null}
                </div>

                <div className="field-grid">
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

                  <div className="field-group">
                    <label htmlFor="work-item-feature-group">Feature group</label>
                    <select
                      id="work-item-feature-group"
                      value={draft.featureGroupId}
                      onChange={(event) => updateDraft("featureGroupId", event.currentTarget.value)}
                    >
                      <option value="">None</option>
                      {featureGroups.map((featureGroup) => (
                        <option value={featureGroup.id} key={featureGroup.id}>
                          {featureGroup.name}
                        </option>
                      ))}
                    </select>
                  </div>
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

                <section className="detail-section" aria-label="AI expansion">
                  <div className="section-title">
                    <Settings size={18} />
                    <h3>AI expansion</h3>
                  </div>
                  <div className="detail-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={aiExpanding || hasDraftChanges}
                      onClick={() => void requestAiExpansion()}
                    >
                      {aiExpanding ? <RefreshCcw className="spin" size={18} /> : <Plus size={18} />}
                      Generate
                    </button>
                    {hasDraftChanges ? <span className="muted-text">Save or reset edits before generating</span> : null}
                  </div>
                  <div className="suggestion-list">
                    {aiSuggestions.length === 0 ? <span className="muted-text">No AI suggestions</span> : null}
                    {aiSuggestions.map((suggestion) => (
                      <article className="suggestion-row" key={suggestion.id}>
                        <div>
                          <div className="batch-title">
                            <strong>{suggestion.title}</strong>
                            <span>{statusLabel(suggestion.status)}</span>
                          </div>
                          <p>{suggestion.body}</p>
                          <div className="item-meta">
                            {suggestion.tags.map((tag) => (
                              <span key={tag}>{tag}</span>
                            ))}
                            {suggestion.providerName === null ? null : <span>{suggestion.providerName}</span>}
                          </div>
                          {suggestion.rationale === null ? null : (
                            <p className="candidate-message">{suggestion.rationale}</p>
                          )}
                        </div>
                        <div className="suggestion-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={suggestion.status !== "pending" || suggestionIdInFlight !== null}
                            onClick={() => void acceptAiSuggestion(suggestion.id)}
                          >
                            {suggestionIdInFlight === suggestion.id ? (
                              <RefreshCcw className="spin" size={18} />
                            ) : (
                              <Check size={18} />
                            )}
                            Accept
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={suggestion.status !== "pending" || suggestionIdInFlight !== null}
                            onClick={() => void dismissAiSuggestion(suggestion.id)}
                          >
                            <CircleSlash size={18} />
                            Dismiss
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

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
                      {snapshot.featureGroup === null ? null : <span>{snapshot.featureGroup.name}</span>}
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
        ) : activeView === "watched-folders" ? (
          <div className="watched-grid">
            <section className="detail-panel" aria-label="Watched-folder settings">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Desktop local</p>
                  <h2>Watched import settings</h2>
                </div>
                <FolderInput size={22} />
              </div>
              <div className="detail-meta">
                <span>Machine {machineId ?? "not loaded"}</span>
                <span>{watchedSettingsSaved ? "Settings saved" : "Unsaved settings allowed"}</span>
              </div>

              {watchedFolders.length === 0 ? (
                <div className="empty-detail">
                  <FolderInput size={22} />
                  <span>No watched folders configured</span>
                </div>
              ) : null}

              <div className="watch-folder-list">
                {watchedFolders.map((folder) => (
                  <article className="watch-folder-row" key={folder.id}>
                    <div className="field-grid">
                      <div className="field-group">
                        <label htmlFor={`${folder.id}-path`}>Watched path</label>
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
                      <div className="field-group">
                        <label htmlFor={`${folder.id}-archive`}>Archive path</label>
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
                    </div>
                    <div className="watch-folder-controls">
                      <label>
                        <input
                          type="checkbox"
                          checked={folder.enabled}
                          onChange={(event) => updateWatchedFolder(folder.id, "enabled", event.currentTarget.checked)}
                        />
                        Enabled
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={folder.recursive}
                          onChange={(event) =>
                            updateWatchedFolder(folder.id, "recursive", event.currentTarget.checked)
                          }
                        />
                        Recursive
                      </label>
                      <div className="field-group compact">
                        <label htmlFor={`${folder.id}-stability`}>Stability ms</label>
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
                      </div>
                      <button className="secondary-button icon-only" type="button" onClick={() => removeWatchedFolder(folder.id)}>
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="item-list" aria-label="Stable watched files">
              {watchedCandidates.length === 0 ? (
                <div className="empty-state">
                  <FolderSearch size={20} />
                  <span>No stable watched files found</span>
                </div>
              ) : null}
              {watchedCandidates.map((candidate) => {
                const status = candidateStatuses[candidate.path] ?? { state: "idle", message: null };
                return (
                  <article className="item-row watched-candidate-row" key={candidate.path}>
                    <div className="item-row-main">
                      <div className="item-title-line">
                        {isAudioExtension(candidate.extension) ? <Headphones size={18} /> : <FileText size={18} />}
                        <h2>{candidate.filename}</h2>
                      </div>
                      <p>{candidate.path}</p>
                      <div className="item-meta">
                        <span>{formatBytes(candidate.byteSize)}</span>
                        <span>Modified {formatDate(candidate.modifiedAt)}</span>
                        <span>{statusLabel(status.state)}</span>
                      </div>
                      {status.message === null ? null : <p className="candidate-message">{status.message}</p>}
                    </div>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={status.state === "importing" || status.state === "imported" || status.state === "duplicate"}
                      onClick={() => void importWatchedCandidate(candidate)}
                    >
                      {status.state === "importing" ? <RefreshCcw className="spin" size={18} /> : <Upload size={18} />}
                      Import
                    </button>
                  </article>
                );
              })}
            </section>
          </div>
        ) : activeView === "settings" ? (
          <div className="settings-single-grid">
            <section className="detail-panel" aria-label="Backend settings">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Backend canonical</p>
                  <h2>Settings</h2>
                </div>
                <Settings size={22} />
              </div>

              {settingsSummary === null ? (
                <div className="empty-detail">
                  <RefreshCcw size={22} />
                  <span>Settings not loaded</span>
                </div>
              ) : (
                <>
                  <section className="detail-section">
                    <div className="section-title">
                      <FolderOpen size={18} />
                      <h3>Projects</h3>
                    </div>
                    <div className="settings-list">
                      <article className="settings-row project-settings-row">
                        <div className="settings-row-header">
                          <div>
                            <div className="batch-title">
                              <strong>New project</strong>
                              <span>Controlled list</span>
                            </div>
                          </div>
                          <button
                            className="row-action-button primary"
                            type="button"
                            disabled={projectIdInFlight !== null}
                            onClick={() => void createProject()}
                          >
                            {projectIdInFlight === "new" ? <RefreshCcw className="spin" size={16} /> : <Plus size={16} />}
                            Create
                          </button>
                        </div>
                        <div className="project-editor">
                          <div className="field-group">
                            <label htmlFor="new-project-name">Name</label>
                            <input
                              id="new-project-name"
                              value={newProjectDraft.name}
                              onChange={(event) => updateNewProjectDraft("name", event.currentTarget.value)}
                            />
                          </div>
                          <div className="field-group">
                            <label htmlFor="new-project-slug">Slug</label>
                            <input
                              id="new-project-slug"
                              placeholder="Generated from name"
                              value={newProjectDraft.slug}
                              onChange={(event) => updateNewProjectDraft("slug", event.currentTarget.value)}
                            />
                          </div>
                          <div className="field-group project-editor-wide">
                            <label htmlFor="new-project-description">Description</label>
                            <input
                              id="new-project-description"
                              value={newProjectDraft.description}
                              onChange={(event) => updateNewProjectDraft("description", event.currentTarget.value)}
                            />
                          </div>
                          <div className="field-group project-editor-wide">
                            <label htmlFor="new-project-context">Context</label>
                            <textarea
                              id="new-project-context"
                              value={newProjectDraft.context}
                              onChange={(event) => updateNewProjectDraft("context", event.currentTarget.value)}
                            />
                          </div>
                        </div>
                      </article>

                      {projects.map((project) => {
                        const projectDraft = projectDrafts[project.id] ?? createProjectForm(project);
                        return (
                          <article className="settings-row project-settings-row" key={project.id}>
                            <div className="settings-row-header">
                              <div>
                                <div className="batch-title">
                                  <strong>{project.name}</strong>
                                  <span>{project.isActive ? "Active" : "Inactive"}</span>
                                  <span>{project.slug}</span>
                                </div>
                                <p>Updated {formatDate(project.updatedAt)}</p>
                              </div>
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
                              </div>
                            </div>
                            <div className="project-editor">
                              <div className="field-group">
                                <label htmlFor={`project-${project.id}-name`}>Name</label>
                                <input
                                  id={`project-${project.id}-name`}
                                  value={projectDraft.name}
                                  onChange={(event) => updateProjectDraft(project.id, "name", event.currentTarget.value)}
                                />
                              </div>
                              <div className="field-group">
                                <label htmlFor={`project-${project.id}-slug`}>Slug</label>
                                <input
                                  id={`project-${project.id}-slug`}
                                  value={projectDraft.slug}
                                  onChange={(event) => updateProjectDraft(project.id, "slug", event.currentTarget.value)}
                                />
                              </div>
                              <div className="field-group project-editor-wide">
                                <label htmlFor={`project-${project.id}-description`}>Description</label>
                                <input
                                  id={`project-${project.id}-description`}
                                  value={projectDraft.description}
                                  onChange={(event) =>
                                    updateProjectDraft(project.id, "description", event.currentTarget.value)
                                  }
                                />
                              </div>
                              <div className="field-group project-editor-wide">
                                <label htmlFor={`project-${project.id}-context`}>Context</label>
                                <textarea
                                  id={`project-${project.id}-context`}
                                  value={projectDraft.context}
                                  onChange={(event) =>
                                    updateProjectDraft(project.id, "context", event.currentTarget.value)
                                  }
                                />
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">
                      <Settings size={18} />
                      <h3>Providers</h3>
                    </div>
                    <div className="settings-list">
                      {settingsSummary.providers.map((provider) => (
                        <article className="settings-row" key={provider.id}>
                          <div>
                            <div className="batch-title">
                              <strong>{provider.providerKind}: {provider.providerName}</strong>
                              <span>{provider.enabled ? "Enabled" : "Disabled"}</span>
                            </div>
                            <p>
                              Runtime {provider.runtimeProvider}; model {provider.modelName ?? provider.runtimeModelName};
                              secret {provider.secretConfigured ? "configured" : "not configured"}
                            </p>
                          </div>
                          <label className="toggle-row">
                            <input
                              type="checkbox"
                              checked={provider.enabled}
                              disabled={settingsLoading}
                              onChange={(event) => void toggleProvider(provider.id, event.currentTarget.checked)}
                            />
                            Enabled
                          </label>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">
                      <FileText size={18} />
                      <h3>Prompts</h3>
                    </div>
                    <div className="settings-list">
                      {settingsSummary.prompts.map((prompt) => (
                        <article className="settings-row" key={prompt.id}>
                          <div>
                            <div className="batch-title">
                              <strong>{prompt.name}</strong>
                              <span>v{prompt.activeVersion}</span>
                            </div>
                            <p>{prompt.purpose}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">
                      <FolderInput size={18} />
                      <h3>File types</h3>
                    </div>
                    <div className="item-meta">
                      {settingsSummary.fileTypes.map((fileType) => (
                        <span key={fileType.id}>
                          {fileType.extension} {fileType.capabilityState}
                        </span>
                      ))}
                    </div>
                  </section>

                  <section className="detail-section">
                    <div className="section-title">
                      <PackageCheck size={18} />
                      <h3>Export contract</h3>
                    </div>
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
                          <span>{ACTIVE_TEXT_FILE_EXTENSIONS.join(", ")}</span>
                        </dd>
                      </div>
                      <div>
                        <dt>Audio</dt>
                        <dd>
                          <span>{ACTIVE_AUDIO_FILE_EXTENSIONS.join(", ")}</span>
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
            <section className="detail-panel" aria-label="Audit events">
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
              <div className="settings-list">
                {auditEvents.map((event) => (
                  <article className="settings-row" key={event.id}>
                    <div>
                      <div className="batch-title">
                        <strong>{event.eventName}</strong>
                        <span>{formatDate(event.createdAt)}</span>
                      </div>
                      <p>
                        {event.actorEmailSnapshot ?? "System"} changed {event.subjectType}
                        {event.subjectId === null ? "" : ` ${event.subjectId}`}
                      </p>
                      <div className="item-meta">
                        {event.workItemId === null ? null : <span>Work item {event.workItemId}</span>}
                        {event.jobId === null ? null : <span>Job {event.jobId}</span>}
                        {event.redactionApplied ? <span>Redacted</span> : null}
                      </div>
                    </div>
                  </article>
                ))}
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
        recursive: item.recursive === true,
        enabled: item.enabled !== false,
        stabilityMs: typeof item.stabilityMs === "number" && item.stabilityMs >= 1000 ? item.stabilityMs : 3000
      }));
  } catch {
    return [];
  }
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

function mimeTypeForExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case ".m4a":
      return "audio/mp4";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".md":
    case ".markdown":
      return "text/markdown";
    default:
      return "text/plain";
  }
}

function isAudioExtension(extension: string): boolean {
  return ACTIVE_AUDIO_FILE_EXTENSIONS.some((candidate) => candidate === extension.toLowerCase());
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
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateValue));
}
