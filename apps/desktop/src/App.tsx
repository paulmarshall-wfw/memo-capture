import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleSlash,
  Download,
  FileText,
  FolderInput,
  FolderSearch,
  PackageCheck,
  PackagePlus,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Settings,
  Trash2,
  Upload,
  Workflow
} from "lucide-react";
import {
  ACTIVE_AUDIO_FILE_EXTENSIONS,
  ACTIVE_TEXT_FILE_EXTENSIONS,
  MEMO_CAPTURE_EXPORT_SCHEMA_VERSION
} from "@memo-capture/domain";

type LoadState = "loading" | "ready" | "error";
type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
type ActiveView = "work-items" | "exports" | "watched-folders";

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

interface Project {
  id: string;
  name: string;
  isActive: boolean;
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

interface WatchedTextCandidate {
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
const watchedSettingsStorageKey = "memo-capture.watched-text-folders.v1";
const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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

export function App() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [activeView, setActiveView] = useState<ActiveView>("work-items");
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
  const [watchedCandidates, setWatchedCandidates] = useState<WatchedTextCandidate[]>([]);
  const [candidateStatuses, setCandidateStatuses] = useState<Record<string, ImportCandidateStatus>>({});
  const [watchScanInFlight, setWatchScanInFlight] = useState(false);
  const [watchedSettingsSaved, setWatchedSettingsSaved] = useState(false);

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

    let cancelled = false;
    async function loadSelectedItem() {
      try {
        const [detailResponse, actionsResponse] = await Promise.all([
          authedJson<{ workItem: WorkItem }>(accessToken, `/api/work-items/${encodeURIComponent(selectedItemId)}`),
          authedJson<{ actions: AllowedWorkflowAction[] }>(
            accessToken,
            `/api/work-items/${encodeURIComponent(selectedItemId)}/actions`
          )
        ]);
        if (cancelled) {
          return;
        }
        setSelectedItem(detailResponse.workItem);
        setDraft(createDraft(detailResponse.workItem));
        setActions(actionsResponse.actions);
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

  async function loadWorkspace(token: string, requestedBucketId: string | null): Promise<void> {
    const [bucketResponse, projectsResponse, featureGroupsResponse, contributorsResponse] = await Promise.all([
      authedJson<{ buckets: WorkflowBucket[] }>(token, "/api/workflow/buckets"),
      authedJson<{ projects: Project[] }>(token, "/api/projects"),
      authedJson<{ featureGroups: FeatureGroup[] }>(token, "/api/feature-groups"),
      authedJson<{ contributors: Contributor[] }>(token, "/api/contributors")
    ]);
    const orderedBuckets = [...bucketResponse.buckets].sort((left, right) => left.order - right.order);
    const nextBucketId = requestedBucketId ?? orderedBuckets[0]?.id ?? null;
    const itemResponse = await loadWorkItems(token, nextBucketId);

    setBuckets(orderedBuckets);
    setProjects(projectsResponse.projects);
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

  function removeWatchedFolder(id: string) {
    setWatchedSettingsSaved(false);
    setWatchedFolders((current) => current.filter((folder) => folder.id !== id));
    setWatchedCandidates((current) => current.filter((candidate) => candidate.watchFolderId !== id));
  }

  function saveWatchedFolders() {
    localStorage.setItem(watchedSettingsStorageKey, JSON.stringify(watchedFolders));
    setWatchedSettingsSaved(true);
  }

  async function scanWatchedTextFolders() {
    if (!isTauriRuntime) {
      setStatusMessage("Watched-folder scanning is available in the Tauri desktop app.");
      return;
    }

    setWatchScanInFlight(true);
    setStatusMessage(null);
    try {
      const candidates = await invoke<WatchedTextCandidate[]>("scan_watched_text_folders", {
        folders: watchedFolders
      });
      setWatchedCandidates(candidates);
      setCandidateStatuses({});
      setStatusMessage(`${candidates.length} stable text files found.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to scan watched folders.");
    } finally {
      setWatchScanInFlight(false);
    }
  }

  async function importWatchedCandidate(candidate: WatchedTextCandidate) {
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
      const bytes = new Uint8Array(await invoke<number[]>("read_watched_text_file", { path: candidate.path }));
      const contentHash = await sha256Digest(bytes);
      const uploadSession = await authedJson<UploadSessionResponse>(accessToken, "/api/imports/upload-sessions", {
        method: "POST",
        body: JSON.stringify({
          machineId,
          watchFolderId: candidate.watchFolderId,
          sourceType: "watched_text_file",
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
      setCandidateStatus(candidate.path, "imported", "Imported, finalized, and archived.");
      await refreshBucket();
    } catch (error) {
      setCandidateStatus(candidate.path, "error", error instanceof Error ? error.message : "Import failed.");
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
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="brand">
          <div className="brand-mark">MC</div>
          <div>
            <p className="brand-name">Memo Capture</p>
            <p className="brand-meta">{session?.user.displayName ?? session?.user.email ?? "Signed in"}</p>
          </div>
        </div>

        <nav className="view-switcher" aria-label="Primary views">
          <button
            className={`bucket-button ${activeView === "work-items" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("work-items")}
          >
            <span>Work queue</span>
          </button>
          <button
            className={`bucket-button ${activeView === "exports" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("exports")}
          >
            <span>Exports</span>
          </button>
          <button
            className={`bucket-button ${activeView === "watched-folders" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("watched-folders")}
          >
            <span>Watched folders</span>
          </button>
        </nav>

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

        <div className="sidebar-actions">
          <button className="icon-text-button" type="button" onClick={() => setActiveView("watched-folders")}>
            <FolderInput size={18} />
            Watched folders
          </button>
          <button className="icon-text-button" type="button">
            <Settings size={18} />
            Settings
          </button>
        </div>
      </aside>

      <section className="workspace" aria-label="Work items">
        <header className="workspace-header">
          <div>
            <h1>
              {activeView === "exports"
                ? "Exports"
                : activeView === "watched-folders"
                ? "Watched folders"
                : selectedBucket?.label ?? "Work queue"}
            </h1>
            <p>
              {activeView === "exports"
                ? `${MEMO_CAPTURE_EXPORT_SCHEMA_VERSION} accepted snapshot batches`
                : activeView === "watched-folders"
                ? `${ACTIVE_TEXT_FILE_EXTENSIONS.join(", ")} imports with archive-after-finalize`
                : selectedBucket === null
                ? "No active workflow bucket is selected."
                : `${selectedBucket.states.join(", ")} workflow states`}
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() =>
              void (activeView === "exports"
                ? loadExports()
                : activeView === "watched-folders"
                ? scanWatchedTextFolders()
                : refreshBucket())
            }
          >
            {activeView === "watched-folders" && watchScanInFlight ? (
              <RefreshCcw className="spin" size={18} />
            ) : activeView === "watched-folders" ? (
              <FolderSearch size={18} />
            ) : (
              <RefreshCcw size={18} />
            )}
            {activeView === "watched-folders" ? "Scan" : "Refresh"}
          </button>
        </header>

        {statusMessage !== null ? (
          <div className={`status-banner ${saveState === "conflict" ? "warning" : ""}`} role="status">
            <AlertTriangle size={18} />
            <span>{statusMessage}</span>
          </div>
        ) : null}

        {activeView === "work-items" ? (
          <div className="toolbar" role="search">
            <Search size={18} />
            <input
              aria-label="Search work items"
              placeholder="Search title, body, project, feature group, or contributor"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
          </div>
        ) : activeView === "exports" ? (
          <div className="toolbar export-toolbar" role="search">
            <Search size={18} />
            <input
              aria-label="Search accepted snapshots"
              placeholder="Search accepted snapshots by title, project, feature group, or contributor"
              value={exportSearch}
              onChange={(event) => setExportSearch(event.currentTarget.value)}
            />
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
        ) : (
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
        )}

        {activeView === "work-items" ? (
        <div className="content-grid">
          <section className="item-list" aria-label="Filtered work items">
            {filteredItems.length === 0 ? (
              <div className="empty-state">
                <CircleSlash size={20} />
                <span>No work items in this bucket</span>
              </div>
            ) : null}

            {filteredItems.map((item) => (
              <button
                className={`item-row ${item.id === selectedItemId ? "selected" : ""}`}
                type="button"
                key={item.id}
                onClick={() => setSelectedItemId(item.id)}
              >
                <div className="item-row-main">
                  <div className="item-title-line">
                    <FileText size={18} />
                    <h2>{item.title}</h2>
                  </div>
                  <p>{item.body}</p>
                  <div className="item-meta">
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
                </div>
                <span className={`state-chip state-${item.workflowState}`}>{stateLabel(item.workflowState)}</span>
              </button>
            ))}
          </section>

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

                <section className="detail-section" aria-label="Workflow actions">
                  <div className="section-title">
                    <Workflow size={18} />
                    <h3>Workflow actions</h3>
                  </div>
                  <div className="action-row">
                    {visibleActions.length === 0 ? <span className="muted-text">No visible actions</span> : null}
                    {visibleActions.map((action) => (
                      <button
                        type="button"
                        key={action.id}
                        disabled={actionIdInFlight !== null || hasDraftChanges}
                        onClick={() => void runAction(action)}
                      >
                        {action.id === actionIdInFlight ? (
                          <RefreshCcw className="spin" size={18} />
                        ) : (
                          <CheckCircle2 size={18} />
                        )}
                        {action.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="detail-section" aria-label="Source memo">
                  <div className="section-title">
                    <FileText size={18} />
                    <h3>Source memo</h3>
                  </div>
                  <dl className="source-list">
                    <div>
                      <dt>Source ID</dt>
                      <dd>{selectedItem.sourceMemoId}</dd>
                    </div>
                    <div>
                      <dt>Body format</dt>
                      <dd>{selectedItem.bodyFormat}</dd>
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
        ) : (
          <div className="watched-grid">
            <section className="detail-panel" aria-label="Watched-folder settings">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Desktop local</p>
                  <h2>Text import settings</h2>
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
                        <input
                          id={`${folder.id}-path`}
                          value={folder.path}
                          onChange={(event) => updateWatchedFolder(folder.id, "path", event.currentTarget.value)}
                        />
                      </div>
                      <div className="field-group">
                        <label htmlFor={`${folder.id}-archive`}>Archive path</label>
                        <input
                          id={`${folder.id}-archive`}
                          value={folder.archivePath}
                          onChange={(event) =>
                            updateWatchedFolder(folder.id, "archivePath", event.currentTarget.value)
                          }
                        />
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

            <section className="item-list" aria-label="Stable watched text files">
              {watchedCandidates.length === 0 ? (
                <div className="empty-state">
                  <FolderSearch size={20} />
                  <span>No stable text files found</span>
                </div>
              ) : null}
              {watchedCandidates.map((candidate) => {
                const status = candidateStatuses[candidate.path] ?? { state: "idle", message: null };
                return (
                  <article className="item-row watched-candidate-row" key={candidate.path}>
                    <div className="item-row-main">
                      <div className="item-title-line">
                        <FileText size={18} />
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
        )}

        <footer className="workspace-footer">
          <span>Export schema: {MEMO_CAPTURE_EXPORT_SCHEMA_VERSION}</span>
          <span>Text: {ACTIVE_TEXT_FILE_EXTENSIONS.join(", ")}</span>
          <span>Audio: {ACTIVE_AUDIO_FILE_EXTENSIONS.join(", ")}</span>
        </footer>
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
  candidate: WatchedTextCandidate;
  archiveRoot: string;
  importEventId: string;
}): Promise<void> {
  try {
    const archivePath = await invoke<string>("archive_watched_text_file", {
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
    case ".md":
    case ".markdown":
      return "text/markdown";
    default:
      return "text/plain";
  }
}

function requireValue<Value>(value: Value | null | undefined, message: string): Value {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

function statusLabel(state: ImportCandidateState): string {
  return state.replaceAll("_", " ");
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
