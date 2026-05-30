# Memo Capture Design Learnings

Date: 2026-05-29
Status: Working design record
Source: Grill-me review of `docs/design/memo-capture-concept.txt`
Last refreshed UTC: 2026-05-29T12:22:26Z

## Purpose

Memo Capture is a cross-platform desktop application for capturing ideas from form submissions, watched-folder text files, and watched-folder audio files. Captured material is converted into reviewable work items, organized by project and optional feature group, enriched with tags, and moved through a workflow-driven review lifecycle.

The application should preserve source provenance, support AI-assisted expansion, and export accepted work items for ingestion into downstream systems.

## Core Product Model

The app uses two linked primary records:

- `source_memo`: the provenance/source artifact record.
- `work_item`: the editable, user-facing review object governed by workflow state.

`source_memo` stores the origin and evidence behind the work item, including original file artifacts, extracted text or transcription, import metadata, hashes, source paths, contributor hints, and processing history.

`work_item` stores the reviewable idea content and metadata that users edit, browse, accept, park, reject, ignore, fail, or export.

Every successfully detected/imported source memo creates a work item immediately. Form submissions and high-confidence imports instantiate work items in `memo`. Low-confidence imports instantiate work items in `needs_review`.

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

Automatic extraction should produce candidate project, feature group, title, body, contributor, and tags with confidence metadata. Low-confidence or incomplete imports enter `needs_review`. Once a signed-in user supplies required fields, confidence scores should not block promotion.

Promotion from `needs_review` to `memo` requires:

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

- `needs_review`
- `memo`
- `parked`
- `accepted`
- `rejected`
- `ignored`
- `failed`

Valid initial workflow states:

- `needs_review`
- `memo`

App-recognized active states:

- `needs_review`
- `memo`
- `parked`
- `accepted`

`accepted` is not terminal because accepted items can still be edited, exported, and can accumulate unexported accepted changes.

Terminality and reopen behavior are owned by the active workflow definition. The app must not hardcode a closed bucket or terminal state list.

## Workflow-Driven UI Rules

Buckets should come from workflow definition metadata. Labels, state membership, display order, and bucket IDs are definition-driven.

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
- require explicit activation of a specific workflow version
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

The work-item detail panel can offer AI expansion for appropriate states, likely `memo` and possibly `parked`.

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
- a normal `work_item` in `memo`

Dismissing a suggestion does not create a workflow item or mutate workflow state.

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

Recoverable transcription or extraction failures stay in `needs_review` with visible error details and recovery actions. Terminal `failed` is reserved for explicit unrecoverable/system/user failure.

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
- workflow state

The right-hand detail panel shows the full memo/work-item content, editable fields, source/provenance details, available workflow actions, AI expansion controls, and audio playback where applicable.

## V1 Retention And Deletion Policy

V1 has no user-facing delete or purge behavior.

Rules:

- users cannot delete `work_item` records
- users cannot delete original managed artifacts, including audio
- no delete or privacy purge action exists in V1
- rejected, ignored, and failed are workflow/lifecycle outcomes, not deletion substitutes
- exported snapshots remain immutable even if future versions later introduce deletion
- audit/history records remain retained even when future content deletion is introduced
- prompts, AI run records, transcripts, and LLM diagnostic records remain retained according to their own retention rules

V1 must not expose destructive UI, destructive API routes, destructive workflow actions, or background purge behavior for canonical app records or managed artifacts.

## Security And Privacy Decisions

External AI and transcription providers are opt-in and must be explicitly configured and enabled.

Rules:

- raw audio files may be sent to an enabled external transcription provider
- LLM diagnostic storage keeps validated structured output plus error metadata, not raw LLM responses by default
- desktop clients may cache playable/downloadable artifact copies locally
- local desktop staging/cache uses OS-user protection only in V1
- V1 has no multi-tenant isolation; each deployment is a trusted shared workspace
- object storage keys may include sanitized project/source filename fragments for operator debugging
- watched-folder archive copies are outside Memo Capture's privacy boundary after the app moves them
- local file paths may appear in local diagnostics, but must not be sent to external AI/transcription providers

Provider enablement UI should clearly show provider name, endpoint/model where relevant, whether content/audio may be sent externally, and redacted secret status.

## Project, Feature Group, And Contributor Governance

All signed-in users are effectively admins in V1 and can create projects.

Project rules:

- projects are required for normal work items after ingestion review
- projects are never deleted in V1; they can be deactivated
- project slugs are stable identifiers separate from display names
- if a project display name changes, historical work items show the new display name

Feature group rules:

- feature groups are global labels that can be reused across projects
- users can create feature groups during ingestion review and detail editing
- feature groups can be renamed, merged, and deactivated
- feature group merge affects future classification only; existing work items are not rewritten
- AI/extraction can suggest new feature groups, but cannot create them without user confirmation

Contributor rules:

- work items can store free-text contributor attribution
- contributors are global in V1
- contributor aliases are supported for matching
- AI/extraction can suggest contributors, but cannot create contributor records
- contributor merge affects future matching only; existing work items are not rewritten
- one contributor per work item in V1
- contributor attribution is visible to all signed-in users
- contributor attribution is optional in export templates

Implementation should preserve both the displayed contributor text on the work item and, when matched/confirmed, an optional canonical contributor reference.

## Settings And Audit Decisions

Backend audit is required for changes to:

- projects
- feature groups
- contributors
- file type support
- confidence thresholds
- prompts
- export templates
- provider configs
- transcription retry count
- workflow activation
- auth/OIDC config

Desktop-local settings are stored locally and do not need backend audit unless future diagnostics require it:

- watched folder path
- archive folder path
- cache/staging path
- upload behavior

Prompt edits are not retained forever. AI run provenance must therefore retain enough prompt/version reference or snapshot metadata to explain historical runs after old prompt bodies expire.

Audit history is recorded in the database/API for later diagnostics. It does not need a full V1 UI. Sensitive settings, secrets, tokens, provider API keys, OIDC secrets, storage credentials, and similar values must be redacted in audit logs.

## Workflow Import And Activation Governance

All signed-in users can view workflow status. Activation requires explicit confirmation because it affects all work items.

Rules:

- workflow import validates and stages a bundle without activating it
- activation is a separate explicit action
- activation requires human-readable changelog/notes stored in audit history
- activation blocks if active processing jobs depend on workflow actions or states
- activation can warn and proceed only when compatibility checks pass and active jobs do not depend on workflow actions/states
- no dry-run validation against existing work items is required in V1
- activation is transactional: either the new bundle becomes active or nothing changes
- workflow identity requires `workflow_id` and `version`
- content hash is not part of the required workflow identity contract
- users cannot export/download the active workflow bundle from the app

Because the app stores only the active workflow bundle and does not expose bundle download, operators must preserve workflow bundles outside the app. The activation UI should warn about this.

## Processing Diagnostics

Processing diagnostics are visible to all users, but tucked away from the main review flow.

V1 includes:

- item-level diagnostics on the relevant memo/work item
- a top-level global Jobs diagnostics view
- visible statuses: queued, running, retry scheduled, failed recoverable, failed terminal, completed
- manual retry for failed jobs
- cancel for queued/running jobs
- provider/model details where available
- timing, cost, and token metadata where available
- sanitized user-safe error messages plus expandable internal diagnostic detail
- UI failure indicators only; no active failure notifications in V1

Retry and cancel actions must be audited.

## Ingestion Edge Cases

Watched-folder imports wait for file size/mtime stability before upload, especially for audio files that may still be written.

Rules:

- text/audio files are archived after managed artifact upload succeeds, not after extraction or transcription succeeds
- archive move failure does not fail the import; it records a local warning and appears in diagnostics
- if upload succeeds but source/work-item creation fails, create a recoverable import error tied to the uploaded artifact and retry without reuploading
- MVP does not include manual file import outside watched folders
- watched-folder recursion is off by default and configurable per watched folder
- unsupported file types are counted and shown in low-priority local diagnostics without creating backend records
- failed local import/upload state survives desktop restart

## Desktop Local Storage And Cache

V1 uses a default app-managed staging/cache path, with an advanced setting to move it.

Rules:

- local artifact cache has a configurable size cap with least-recently-used cleanup
- users can clear local cache without affecting backend managed artifacts
- staged-but-not-uploaded files are never auto-cleaned
- machine identity is stable per app data directory/install and regenerated if local app data is removed
- multiple desktop clients watching the same folder are explicitly unsupported in V1
- archive folder structure is not configurable beyond date grouping plus import ID/hash prefix in MVP

## Provider Configuration

Provider configs are global for the deployment in V1. Project-specific provider defaults are deferred.

Rules:

- transcription providers and LLM providers are configured independently
- each provider has explicit enabled/disabled state
- disabled providers never receive jobs
- provider secrets come from environment/config in MVP
- UI displays redacted provider status and non-secret settings
- provider/model changes affect only new jobs
- jobs snapshot intended provider/model at creation for predictability
- per-retry provider/model choice is not in MVP
- manual retry uses the current configured provider unless the job has a fixed provider snapshot
- extraction/classification can run without an external LLM where deterministic extraction is possible
- provider failures mark the provider unhealthy and show diagnostics; they do not auto-disable providers

## API And Desktop Boundaries

Desktop upload uses backend-mediated signed upload URLs when available. The desktop obtains upload authorization from the backend and never owns object storage credentials.

Rules:

- backend creates an upload/import session first, then finalizes `source_memo` after upload verification
- backend sees machine identity, upload/import events, and diagnostics-relevant warnings from desktop watched-folder behavior
- full watched-folder config does not sync unless later needed
- workflow lifecycle uses generic runtime-backed action endpoints
- app-specific endpoints are reserved for app-owned side effects such as export and AI expansion
- desktop editing uses explicit save in MVP
- API uses optimistic concurrency through versions/ETags for work item edits
- form submissions use the same canonical source/work-item creation path as imports, without artifact upload unless attachments are added later
- worker calls a shared service layer directly, not HTTP endpoints

## UI Structure

The first screen is the work queue/bucket view, not a dashboard.

V1 UI structure:

- desktop uses a three-pane layout: bucket/sidebar, item list, detail panel
- settings/admin surfaces are in-app sections, not separate windows
- global Jobs diagnostics is a top-level navigation item
- workflow import/activation lives in a dedicated Operations section
- ingestion review and normal idea review are separate workflow buckets defined by the workflow definition
- audio playback lives in the detail panel only for MVP
- Export has its own focused view for accepted snapshots and batch creation
- accepted items still appear in the main queue

## Auth And Session Behavior

V1 uses the OIDC boundary early, with a clearly marked local-dev auth provider for development only.

Rules:

- local-dev auth uses one fixed development user by default
- desktop requires sign-in for canonical settings and upload
- expired sessions allow local staging but block upload and canonical backend actions
- auth health appears in system diagnostics/settings, not processing job diagnostics
- backend creates app users lazily on first valid OIDC login
- app user records store OIDC subject, issuer, email, display name, and first/last seen timestamps
- V1 does not support inviting or revoking users; rely on the OIDC provider for access control
- audit records store user ID plus email/display-name snapshot
- desktop refreshes tokens silently when possible and otherwise prompts re-authentication clearly

## Export Semantics

Accepted items can be exported multiple times across batches.

Rules:

- unchanged accepted snapshots that were already exported are not blocked, but are shown as already exported and default unchecked
- edited accepted items export the most recent accepted snapshot automatically, with prior export status visible
- exports include source/provenance IDs and timestamps by default
- contributor inclusion is controlled by export option/template
- export batches are downloadable immediately and stored as durable managed artifacts with object storage keys
- export batches cannot be deleted in V1
- Markdown paths use `project-slug/<stable-id>-<sanitized-title>.md`
- V1 exports accepted items only

## Schema Edge Decisions

Schema design should reflect these V1 decisions:

- `work_item` stores current editable fields directly
- `accepted_snapshot` is a separate immutable table
- `source_memo` can link to multiple `work_item` records
- exact duplicate imports create an import event plus visible provenance/history note
- possible duplicates are first-class records
- tags are normalized records with a join table
- work item body is Markdown in V1
- audio transcript is stored as both current queryable/reviewable DB text and a versioned derived artifact
- content-bearing tables do not get unused sensitivity/classification metadata fields in V1

## MVP Boundary And Implementation Sequence

MVP includes:

- form ingestion
- watched text folder ingestion
- watched audio folder ingestion
- real OIDC boundary plus local-dev auth for development only
- workflow bundle import/activation UI
- extraction/classification first; AI expansion later
- accepted-item Markdown bundle plus JSON Lines exports
- immutable export batch records
- audio playback for failed transcription recovery
- settings UI for projects, feature groups, contributors, provider enablement, watched/archive paths
- UI display of auth, object storage, and deeper export template config even when configured by seed/config files
- basic global Jobs page from day one

Implementation sequence:

- start with database/schema/API contracts before frontend UI
- first runnable milestone is form submission to work item
- watched text ingestion comes before watched audio ingestion
- workflow runtime integration happens as early as sensible after basic creation/list/detail and before lifecycle actions
- exports come before AI/transcription provider integration
- Operations workflow import/activation is built before any hardcoded workflow path
- global diagnostics is built as soon as processing jobs exist

Vertical-slice complete gate:

- auth boundary works with local-dev auth and OIDC integration contract in place
- backend schema/API contracts exist for source memos, work items, projects, workflow activation, audit, and accepted snapshots
- Operations can import, validate, stage, and explicitly activate a workflow bundle
- form submission creates a `source_memo` and `work_item` through the canonical creation path
- work item appears in the workflow-defined queue/bucket UI
- detail panel supports explicit edit/save with optimistic concurrency
- lifecycle actions render from workflow runtime allowed actions and execute through the generic action endpoint
- accepting an item creates an immutable accepted snapshot
- Export view can create and download a durable Markdown plus JSON Lines export batch from accepted snapshots
- audit records are written for settings/workflow/action/export events included in the slice
- basic global jobs/diagnostics exists once jobs are introduced, with retry/cancel available where applicable
- verification passes, or every blocker is documented with exact cause

## Versioning And Compatibility

V1 uses separate version numbers for app release, database schema, workflow bundle, and export schema.

Rules:

- database migrations are forward-only in V1; rollback is restore-from-backup
- workflow bundles declare required app capabilities
- activation checks handlers, guards, app-owned side effects, and minimum app version/capability set
- export schema starts at `memo-capture-export.v1` and remains stable through MVP unless a breaking `v2` is needed
- API routes do not need a public `/v1` prefix unless external clients are expected
- object storage key layout includes a numbered layout version
- workflow version reuse with different content is allowed only in local-dev mode
- normal mode rejects activating a version that was previously activated with different content
- system/about diagnostics shows app version, API version/build, DB schema version, active workflow version, and export schema version

## Testing And Verification

The first implementation specs should include acceptance tests per vertical slice.

Rules:

- use real Postgres for repository/service integration tests where schema behavior matters
- unit-test pure logic separately
- use local S3-compatible service for object storage integration tests
- use fake storage for narrow unit tests
- desktop watched-folder behavior gets automated path/state tests and manual scripted OS watcher verification
- UI behavior/layout changes require Chrome verification with desktop viewport evidence
- workflow bundle validation uses valid and invalid fixtures
- export output uses golden/structure tests with normalized timestamps/IDs
- keep `npm run verify` fast and deterministic where possible
- put Postgres, MinIO, and provider-backed checks behind separate explicit integration verification commands

## Failure Recovery And Operator Responsibilities

V1 documents operator backup/restore responsibility for Postgres and object storage instead of providing built-in backup/restore features.

Rules:

- system diagnostics/settings should show Postgres, object storage, and provider health checks
- export generation is a processing job so failures can be retried and audited
- worker leases expire and stuck running jobs become reclaimable
- canceling a running job records app-side cancellation requested in V1; provider cancellation is attempted only where cheap and reliable
- abandoned upload sessions and orphaned object keys need periodic reconciliation
- no full maintenance mode in V1; block specific risky operations when incompatible jobs or migrations are active
- diagnostics should support a copy diagnostic bundle action that redacts secrets and avoids raw memo/audio content by default

## First Specification Artifact Shape

Before build work, create a technical product specification set, not a PRD.

Spec shape:

- use one index plus focused specs
- include database tables and API route contracts immediately
- include low-fidelity screen inventory and interaction rules, not pixel-level design
- copy implementation-relevant decisions into the specs
- keep unresolved items in `decision-log.md`
- after artifacts are written, run a documentation sanity pass, then commit when explicitly requested

Initial focused specs:

- `docs/specs/index.md`
- `docs/specs/domain-model-and-schema.md`
- `docs/specs/workflow-runtime-integration.md`
- `docs/specs/ingestion-and-artifacts.md`
- `docs/specs/processing-jobs-and-diagnostics.md`
- `docs/specs/settings-and-audit.md`
- `docs/specs/auth-and-security.md`
- `docs/specs/exports.md`
- `docs/specs/mvp-implementation-plan.md`
- `docs/specs/decision-log.md`

## Key Risks Accepted

- V1 assumes a trusted user group because all signed-in users are admins.
- Only the active workflow bundle is stored, which weakens long-term workflow audit/debug history.
- Draft edit history is not retained before acceptance.
- NAS/self-hosted support is operationally possible but requires the operator to manage infrastructure correctly.
- Workflow migration support is deferred; incompatible workflow upgrades are blocked.
- Unsupported file types can be configured but must remain inactive until parser support exists.
- V1 has no delete or privacy purge path, so managed content retention is intentionally strict.
- Local desktop cache uses OS-user protection only.
- Object keys may expose sanitized filename/project context for operator debugging.
- The app does not retain old workflow bundle bodies and does not expose active bundle download; operators must preserve workflow bundles outside the app.

## Remaining Spec Work

The grill-me review has resolved the major V1 product and architecture questions needed to generate the implementation specifications. Remaining work is to convert this design record into the focused spec set above, including:

- concrete database tables and indexes
- API route contracts and request/response shapes
- workflow bundle validation contract
- processing job leasing, retry, and cancel semantics
- artifact upload/finalize/download contracts
- audit event names and redaction rules
- low-fidelity screen inventory and interaction rules
- vertical-slice acceptance tests
- open implementation decisions discovered while writing the specs

## Implementation Guidance

Before implementation starts, the first durable spec set should define:

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
