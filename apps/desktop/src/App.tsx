import {
  Archive,
  Bot,
  CheckCircle2,
  Clock3,
  FileAudio,
  FolderInput,
  Search,
  Settings,
  UploadCloud
} from "lucide-react";
import {
  ACTIVE_AUDIO_FILE_EXTENSIONS,
  ACTIVE_TEXT_FILE_EXTENSIONS,
  MEMO_CAPTURE_EXPORT_SCHEMA_VERSION,
  type WorkItemState
} from "@memo-capture/domain";

interface BucketSummary {
  id: string;
  label: string;
  count: number;
  state: WorkItemState | "closed";
}

interface DemoWorkItem {
  id: string;
  title: string;
  project: string;
  featureGroup: string | null;
  contributor: string | null;
  state: WorkItemState;
  snippet: string;
  body: string;
  tags: string[];
  sourceType: "audio" | "text" | "form";
}

const buckets: BucketSummary[] = [
  { id: "ingestion", label: "Needs ingestion review", count: 3, state: "needs_ingestion_review" },
  { id: "new", label: "New ideas", count: 12, state: "new_idea" },
  { id: "accepted", label: "Accepted", count: 5, state: "accepted" },
  { id: "closed", label: "Closed", count: 8, state: "closed" }
];

const demoItems: DemoWorkItem[] = [
  {
    id: "wi_1042",
    title: "Archive imported voice memos after storage confirmation",
    project: "Memo Capture",
    featureGroup: "Ingestion",
    contributor: "Paul Marshall",
    state: "new_idea",
    snippet: "Move watched-folder files into a dated archive folder after managed storage confirms success.",
    body: "After a watched-folder audio or text file is successfully copied into managed object storage, the desktop app should move the original file into a date-grouped archive folder. The archive name should preserve the original filename with an import ID prefix.",
    tags: ["watched-folder", "archive", "provenance"],
    sourceType: "audio"
  },
  {
    id: "wi_1043",
    title: "Keep AI suggestions outside workflow until accepted",
    project: "Memo Capture",
    featureGroup: "AI Expansion",
    contributor: null,
    state: "accepted",
    snippet: "AI-generated related ideas should be suggestions, not workflow items, until a user accepts them.",
    body: "AI expansion should create pending suggestions linked to the parent work item. Accepting a suggestion creates an AI-generated source memo and a new work item in the new idea bucket.",
    tags: ["ai", "workflow", "suggestions"],
    sourceType: "text"
  },
  {
    id: "wi_1044",
    title: "Manual transcription recovery from failed audio processing",
    project: "Memo Capture",
    featureGroup: "Transcription",
    contributor: "Paul Marshall",
    state: "needs_ingestion_review",
    snippet: "When automatic transcription fails, users need audio playback and manual transcript entry.",
    body: "The detail panel should expose an audio player when a source memo has an audio artifact. If automatic transcription fails, a user can listen and manually provide the transcript or memo body before promoting the item.",
    tags: ["audio", "recovery", "transcription"],
    sourceType: "audio"
  }
];

function stateLabel(state: DemoWorkItem["state"]): string {
  return state.replaceAll("_", " ");
}

export function App() {
  const selectedItem = demoItems[0];

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="brand">
          <div className="brand-mark">MC</div>
          <div>
            <p className="brand-name">Memo Capture</p>
            <p className="brand-meta">Local desktop workspace</p>
          </div>
        </div>

        <nav className="bucket-list" aria-label="Workflow buckets">
          {buckets.map((bucket) => (
            <button className="bucket-button" type="button" key={bucket.id}>
              <span>{bucket.label}</span>
              <span className="bucket-count">{bucket.count}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-actions">
          <button className="icon-text-button" type="button">
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
            <h1>New ideas</h1>
            <p>Review captured memos, refine details, and use workflow actions from the active definition.</p>
          </div>
          <button className="primary-button" type="button">
            <UploadCloud size={18} />
            Capture memo
          </button>
        </header>

        <div className="toolbar" role="search">
          <Search size={18} />
          <input aria-label="Search work items" placeholder="Search project, tag, contributor, or memo text" />
          <button type="button">Project</button>
          <button type="button">Feature group</button>
          <button type="button">Tags</button>
        </div>

        <div className="content-grid">
          <section className="item-list" aria-label="Filtered work items">
            {demoItems.map((item) => (
              <article className={`item-row ${item.id === selectedItem.id ? "selected" : ""}`} key={item.id}>
                <div className="item-row-main">
                  <div className="item-title-line">
                    {item.sourceType === "audio" ? <FileAudio size={18} /> : <Archive size={18} />}
                    <h2>{item.title}</h2>
                  </div>
                  <p>{item.snippet}</p>
                  <div className="item-meta">
                    <span>{item.project}</span>
                    {item.featureGroup ? <span>{item.featureGroup}</span> : null}
                    {item.contributor ? <span>{item.contributor}</span> : null}
                  </div>
                </div>
                <span className={`state-chip state-${item.state}`}>{stateLabel(item.state)}</span>
              </article>
            ))}
          </section>

          <aside className="detail-panel" aria-label="Work item detail">
            <div className="detail-header">
              <div>
                <p className="eyebrow">{selectedItem.project}</p>
                <h2>{selectedItem.title}</h2>
              </div>
              <span className={`state-chip state-${selectedItem.state}`}>{stateLabel(selectedItem.state)}</span>
            </div>

            <div className="field-group">
              <label htmlFor="work-item-title">Title</label>
              <input id="work-item-title" value={selectedItem.title} readOnly />
            </div>

            <div className="field-group">
              <label htmlFor="work-item-body">Memo body</label>
              <textarea id="work-item-body" value={selectedItem.body} readOnly rows={8} />
            </div>

            <div className="tag-list" aria-label="Tags">
              {selectedItem.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>

            <section className="detail-section" aria-label="Audio recovery">
              <div className="section-title">
                <FileAudio size={18} />
                <h3>Source audio</h3>
              </div>
              <audio controls preload="none" aria-label="Source audio playback" />
            </section>

            <section className="detail-section" aria-label="Workflow actions">
              <div className="section-title">
                <Clock3 size={18} />
                <h3>Available actions</h3>
              </div>
              <div className="action-row">
                <button type="button">
                  <CheckCircle2 size={18} />
                  Accept
                </button>
                <button type="button">Park</button>
                <button type="button">Reject</button>
              </div>
            </section>

            <section className="detail-section" aria-label="AI expansion">
              <div className="section-title">
                <Bot size={18} />
                <h3>AI expansion</h3>
              </div>
              <p>
                Output must validate as structured JSON before creating drafts or suggestions.
              </p>
              <button className="secondary-button" type="button">Expand memo</button>
            </section>
          </aside>
        </div>

        <footer className="workspace-footer">
          <span>Export schema: {MEMO_CAPTURE_EXPORT_SCHEMA_VERSION}</span>
          <span>Text: {ACTIVE_TEXT_FILE_EXTENSIONS.join(", ")}</span>
          <span>Audio: {ACTIVE_AUDIO_FILE_EXTENSIONS.join(", ")}</span>
        </footer>
      </section>
    </main>
  );
}
