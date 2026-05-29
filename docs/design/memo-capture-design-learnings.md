# Memo Capture Design Learnings

Date: 2026-05-29
Status: Working design record
Source: Grill-me review of `docs/design/memo-capture-concept.txt`

## Purpose

Memo Capture is a cross-platform desktop application for capturing ideas from form submissions, watched-folder text files, and watched-folder audio files. Captured material is converted into reviewable work items, organized by project and optional feature group, enriched with tags, and moved through a workflow-driven review lifecycle.

The application should preserve source provenance, support AI-assisted expansion, and export accepted work items for ingestion into downstream systems.

## Core Product Model

The app uses two linked primary records:

- `source_memo`: the provenance/source artifact record.
- `work_item`: the editable, user-facing review object governed by workflow state.

`source_memo` stores the origin and evidence behind the work item, including original file artifacts, extracted text or transcription, import metadata, hashes, source paths, contributor hints, and processing history.

`work_item` stores the reviewable idea content and metadata that users edit, browse, accept, park, reject, ignore, fail, or export.

Every successfully detected/imported source memo creates a work item immediately. Form submissions and high-confidence imports instantiate work items in `new_idea`. Low-confidence imports instantiate work items in `needs_ingestion_review`.

## Classification Model

The app should not require a rigid `project -> feature group -> feature name` hierarchy.

V1 classification uses:

- required controlled `project`
- optional dynamic `feature_group`
- `work_item.title` instead of mandatory `feature_name`
- tags/keywords for flexible grouping
- optional contributor attribution

Project names are controlled. Feature groups can be added dynamically from user input or memo extraction, but remain optional.

Contributor attribution is memo metadata, not authorization. Authenticated user identity is separate and is used for audit and backend access.

## Ingestion Model

Supported V1 ingestion channels:

- app data-entry form
- watched folder for audio files
- watched folder for text files

Watched-folder imports always create source memo provenance first, then create the workflow work item in the appropriate initial state.

Automatic extraction should produce candidate project, feature group, title, body, contributor, and tags with confidence metadata. Low-confidence or incomplete imports enter `needs_ingestion_review`. Once a signed-in user supplies required fields, confidence scores should not block promotion.

Promotion from `needs_ingestion_review` to `new_idea` requires:

- selected `project_id`
- title
- memo body or transcript
- linked source memo

Feature group, tags, and contributor are optional.

## File Type Support

The settings model should support adding/removing configured file type entries, but V1 should activate only implemented parsers.

Active text formats in V1:

- `.txt`
- `.md`
- `.markdown`

Active audio formats in V1:

- `.m4a`
- `.mp3`
- `.wav`

Unsupported configured types should be stored as inactive or `not_supported_yet`. Watched-folder ingestion must not attempt unsupported file types.

## Watched Folder Handling

Watched-folder files are input channels, not long-term source truth.

After the backend confirms successful managed artifact storage, the desktop app moves the original watched-folder file to an archive folder. It must not delete originals automatically.

Archive behavior:

- archive location is a desktop-local setting
- files are grouped by import date
- archived filenames preserve the original filename with an import ID or hash prefix
- archive moves must never overwrite existing files
- import events record original path and archive path
- failed archive moves do not undo successful imports, but must create a local warning

Exact duplicate file imports are detected by content hash. Exact duplicates create duplicate import events against the existing source memo rather than new source memos or work items. Same/similar text with different file hashes creates a separate source memo but can be flagged as a possible duplicate.

## Managed Artifacts

Original imported files are permanent managed artifacts unless explicitly deleted through the app.

The backend stores artifact metadata and object keys. Raw file blobs do not belong in the database.

The artifact storage contract is S3-compatible object storage:

- cloud profile can use managed object storage
- NAS/self-hosted profile should use MinIO or another S3-compatible service
- desktop clients upload artifacts through backend API only
- playback/download uses backend-authorized routes or signed access

The work-item detail panel must support audio playback when the linked source memo has an audio artifact, especially so users can manually transcribe or recover failed automatic transcription.

## Workflow Model

The app integrates with State Workflow Runtime. Durable lifecycle transitions must go through runtime allowed actions and `executeAction`. The frontend must not hardcode workflow transition availability.

The workflow covers both ingestion review and idea review.

Known V1 states:

- `needs_ingestion_review`
- `new_idea`
- `parked`
- `accepted`
- `rejected`
- `ignored`
- `failed`

Valid initial workflow states:

- `needs_ingestion_review`
- `new_idea`

Active states:

- `needs_ingestion_review`
- `new_idea`
- `parked`
- `accepted`

Terminal states:

- `rejected`
- `ignored`
- `failed`

`accepted` is not terminal because accepted items can still be edited, exported, and can accumulate unexported accepted changes.

The `closed` bucket visually groups `rejected`, `ignored`, and `failed`, but those states remain semantically distinct, filterable, and auditable.

## Workflow-Driven UI Rules

Buckets should come from workflow definition metadata. The app may require semantic bucket roles, but labels, state membership, and display order are definition-driven.

Required semantic bucket roles:

- `ingestion_review`
- `new_ideas`
- `accepted`
- `closed`

The app should render visible no-input actions generically from runtime `getAllowedActions`. Custom UI is needed only for actions that require extra input, confirmation, or app-owned side effects.

The detail panel remains editable in all states in V1. Editing content or metadata never changes lifecycle state. Lifecycle changes only happen through workflow runtime actions.

Reopen behavior is owned by the workflow definition. The app must not hardcode reopen actions. If the active workflow exposes a visible reopen action, the app renders it generically.

## Workflow Definition Import

The app must support importing different workflow definition versions over time.

The workflow definition is not fixed as a source artifact in the app repo. A state machine definition will be created later and used to generate the full workflow definition.

Workflow import and activation are operational/admin functions, not normal settings.

V1 rules:

- import workflow bundle through a dedicated operations/admin surface or endpoint
- validate bundle before activation
- require explicit activation of a specific version/variant
- block activation if required guards, handlers, or migrations are missing
- store only the active workflow definition bundle
- activation replaces the previous stored active bundle
- rollback requires re-importing a known-good external bundle
- activation history records version identifiers and content hashes, but old bundle bodies are not retained
- V1 blocks workflow activations requiring app-code migrations
- V1 allows only compatible workflow changes that do not require existing item migration

Workflow import UI must warn that the previous workflow bundle content is not retained by the app.

## AI Expansion

AI expansion is an app-owned side action in V1, not a workflow transition. It does not change lifecycle state by itself.

The work-item detail panel can offer AI expansion for appropriate states, likely `new_idea` and possibly `parked`.

AI expansion sends structured context to the configured LLM service:

- base prompt
- prompt version
- project context
- current work-item fields
- source memo/body as appropriate

AI output must be strict structured JSON and validated before storing any draft or suggestion records.

Recommended output shape:

```json
{
  "expanded_work_item": {
    "title": "string",
    "body": "string",
    "tags": ["string"],
    "feature_group": "string | null"
  },
  "related_suggestions": [
    {
      "title": "string",
      "body": "string",
      "tags": ["string"],
      "feature_group": "string | null",
      "rationale": "string"
    }
  ]
}
```

AI-generated related ideas are not workflow items immediately. They are `ai_suggestion` records with statuses such as `pending`, `applied`, and `dismissed`.

Accepting a suggestion creates:

- a `source_memo` with `source_type = ai_generated`
- a normal `work_item` in `new_idea`

Dismissing a suggestion does not create a workflow item or terminal workflow state.

## Prompt Versioning And AI Provenance

Prompts are backend-owned, versioned assets.

Editing a prompt creates a new prompt version and does not mutate previous versions.

AI generation records should include:

- prompt ID and version
- provider and model
- context fields used
- structured output validation result
- timestamp
- initiating user
- raw/validated response reference where useful

Invalid LLM output creates an AI-run failure record visible in diagnostics. It must not create normal suggestion or work-item records.

## Transcription And Processing

The backend owns transcription orchestration. The desktop app imports, stages, and uploads audio artifacts and local metadata only.

Backend processing flow:

- create processing job
- call configured transcription provider or local/NAS-hosted transcription service
- store transcript as a versioned derived artifact linked to source memo
- run extraction/classification from the transcript

Automatic transcription retry count is configurable.

Recoverable transcription or extraction failures stay in `needs_ingestion_review` with visible error details and recovery actions. Terminal `failed` is reserved for explicit unrecoverable/system/user failure.

If automatic transcription fails, the user can play the source audio in the detail panel and manually enter or edit transcript/body content.

## Processing Jobs

Use one backend processing job model with typed job kinds.

V1 job kinds:

- `transcribe_audio`
- `extract_memo_metadata`
- `generate_keywords`
- `expand_work_item`
- `generate_export_batch`

Processing jobs track:

- job ID
- job kind
- source/work item reference
- status
- attempt count
- max retries where applicable
- `run_after`
- error code/message
- created/started/completed timestamps
- initiating user or system actor
- provider/model details where relevant

The API process and worker process are separate commands/processes in the same codebase. V1 uses Postgres as the job queue with database locking/leases, attempt counts, and retry scheduling. Do not introduce Redis or an external queue in V1.

## Backend And Desktop Architecture

Use a cross-platform desktop app backed by a shared backend service.

Recommended stack:

- desktop app: Tauri + React + TypeScript
- backend API: TypeScript service
- database: Postgres
- object storage: S3-compatible
- worker: separate backend process/command using the same codebase

Desktop responsibilities:

- watched-folder monitoring
- local file staging/cache
- upload queue
- archive moves
- local notifications
- UI shell
- OS keychain token storage

Backend responsibilities:

- canonical source memo and work item records
- settings
- workflow runtime integration
- auth and authorization
- artifact upload/download
- transcription and LLM orchestration
- processing jobs
- exports

V1 does not support offline canonical editing. The desktop app can stage files and queue uploads while offline, but canonical records, form submissions, workflow actions, AI expansion, transcription, settings changes, and exports require backend connectivity.

## Deployment Profiles

The backend has one codebase and API contract with configuration-based deployment profiles.

Primary V1 profile:

- cloud-hosted backend API
- managed Postgres
- managed S3-compatible object storage

Secondary NAS/self-hosted profile:

- same backend code
- Postgres
- MinIO or other S3-compatible object storage
- environment/config changes only

NAS support must not require application code changes. Operator responsibilities include backups, TLS, updates, and service availability.

## Authentication And Authorization

V1 uses real authentication but no role differentiation.

Rules:

- every user must sign in
- every signed-in user is effectively admin in V1
- backend records `created_by`, `updated_by`, and transition actor IDs
- contributor attribution remains separate from authenticated user identity

Authentication should use a provider-portable OIDC boundary:

- backend validates configurable issuer/audience/JWKS
- cloud can use a managed OIDC provider
- NAS/self-hosted can use a self-hosted or external OIDC provider
- app maps OIDC subject/email to an app user record

Desktop sign-in uses system-browser OIDC with PKCE, not embedded sign-in. Redirect can use loopback localhost or a custom URI scheme. Tokens are stored in OS keychain/credential storage.

## Settings Ownership

Backend settings are canonical.

Backend-owned settings:

- projects
- project descriptions/context
- feature groups
- contributor list
- supported file type entries and capability state
- extraction confidence thresholds
- transcription retry count
- base LLM prompts and prompt versions
- export settings/templates

Desktop-local settings:

- watched folder paths
- archive folder paths
- local staging/cache path
- upload behavior
- local notifications
- machine identity for diagnostics

Keeping canonical classification and prompt settings in the backend avoids different machines classifying the same memo differently.

## Export Model

Users export selected accepted work items for downstream ingestion.

V1 export formats:

- Markdown bundle with YAML frontmatter
- JSON Lines mirror

CSV/tabular export is explicitly excluded from V1.

Exports are durable immutable snapshot batches, not ephemeral downloads.

Export batch creation:

- user filters accepted items
- each item has a checkbox
- user can select individual items
- user can select all items in the current filtered result set
- export includes checked accepted snapshots only
- backend records exact included snapshot IDs and useful active filter context

Export artifact layout:

```text
export-<batch-id>/
  manifest.json
  items.jsonl
  markdown/
    <project-slug>/
      <work-item-id>-<slug>.md
  combined.md
```

Exports carry an explicit numbered schema version from V1, for example `memo-capture-export.v1`.

`manifest.json`, `items.jsonl`, and Markdown frontmatter include the schema version.

## Accepted Snapshots And Versioning

V1 does not retain full draft edit history.

Snapshot/version creation starts at the acceptance/export boundary:

- draft/new/parked edits can mutate the current work item
- transition to `accepted` creates an accepted snapshot
- accepted snapshots are immediately exportable
- editing an accepted item creates a new accepted snapshot
- previous exports continue referencing older immutable snapshots
- accepted items can show that they have unexported changes
- no separate `ready_to_export` workflow state exists in V1

Export status is separate from workflow state.

## List And Detail UI

Users need browsable buckets and list filtering/sorting.

List rows should include:

- project
- optional feature group
- title
- contributor attribution if present
- tags/keywords
- date information
- memo snippet
- workflow state/bucket where useful
- export status where useful for accepted items

Filtering should support:

- project
- feature group
- contributor
- tags/keywords
- date range
- export status for accepted items
- terminal state inside the closed bucket

The right-hand detail panel shows the full memo/work-item content, editable fields, source/provenance details, available workflow actions, AI expansion controls, and audio playback where applicable.

## Key Risks Accepted

- V1 assumes a trusted user group because all signed-in users are admins.
- Only the active workflow bundle is stored, which weakens long-term workflow audit/debug history.
- Draft edit history is not retained before acceptance.
- NAS/self-hosted support is operationally possible but requires the operator to manage infrastructure correctly.
- Workflow migration support is deferred; incompatible workflow upgrades are blocked.
- Unsupported file types can be configured but must remain inactive until parser support exists.

## Open Questions

The grill-me review has not fully resolved:

- project and feature-group governance rules
- contributor attribution matching and alias rules
- settings audit history
- deletion and retention policy for source memos, artifacts, work items, prompts, and exports
- privacy/security expectations for memo and audio content
- diagnostics UI for processing jobs and workflow/runtime failures
- exact MVP boundary and implementation phases
- final PRD/spec artifact shape

## Implementation Guidance

When implementation starts, the first durable spec should define:

- domain model and database schema
- workflow integration contract
- workflow import/activation behavior
- processing job schema and worker behavior
- artifact storage API
- settings schema
- export schema `memo-capture-export.v1`
- desktop local settings and watched-folder behavior
- authentication flow and app-user mapping

The app should avoid hardcoding workflow action availability, bucket labels, or reopen behavior. Those belong to the active workflow definition wherever possible.
