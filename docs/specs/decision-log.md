# Decision Log

Status: Draft decision record
Last updated: 2026-05-30

## Purpose

Track implementation decisions, accepted risks, and unresolved items discovered while converting the Memo Capture design record into implementation specs.

## Confirmed Decisions

### D001: V1 Runtime Shape

Decision: Use Tauri + React desktop app, TypeScript API, TypeScript worker, Postgres, S3-compatible object storage, and OIDC.

Rationale: Matches cross-platform desktop needs, backend authority, background processing, object artifact storage, and provider-portable auth.

### D002: Desktop Does Not Own Canonical Storage

Decision: Desktop clients never connect directly to Postgres or object storage.

Rationale: Keeps canonical authorization, audit, settings, artifact access, and workflow actions backend-owned.

### D003: Source Memo And Work Item Are Separate

Decision: `source_memo` stores provenance; `work_item` stores editable review content and workflow state.

Rationale: Preserves source evidence while allowing user-facing review content to evolve.

### D004: Every Successful Capture Creates A Work Item

Decision: Every successful non-duplicate source capture creates a work item immediately.

Rationale: Avoids hidden inboxes and keeps all captured material reviewable.

### D005: Ingestion Review Is A Workflow State

Decision: Low-confidence or incomplete imports instantiate work items in `needs_review`.

Rationale: Recovery and completion should happen in the same lifecycle model as normal review.

### D006: Workflow Definition Drives Buckets And Actions

Decision: Buckets, allowed lifecycle actions, and reopen behavior come from the active workflow definition/runtime wherever possible.

Rationale: Avoids hardcoded lifecycle logic in the UI.

### D007: Store Only Active Workflow Bundle

Decision: V1 stores only the active workflow bundle body. Activation history stores metadata and hashes, not old bundle bodies.

Rationale: Keeps V1 storage and rollback model simple.

Risk: Operators must preserve workflow bundles externally.

### D008: All Signed-In Users Are Admins In V1

Decision: Authentication is required, but V1 has no role differentiation.

Rationale: V1 assumes a trusted shared workspace.

Risk: Access control relies on the OIDC provider for user eligibility.

### D009: Backend Settings Are Canonical

Decision: Projects, tag/keyword grouping, contributors, providers, prompts, file types, thresholds, workflow activation, and export templates are backend-owned.

Rationale: Prevents inconsistent classification and provider behavior across desktop clients.

### D010: Watched Folder And Archive Paths Are Desktop-Local

Decision: Watched-folder paths, archive paths, staging/cache path, upload behavior, local notifications, and machine identity are desktop-local settings.

Rationale: These are machine-specific and should not sync as canonical workspace settings in V1.

### D011: Archive After Managed Artifact Confirmation

Decision: Watched files are archived only after managed artifact storage is confirmed.

Rationale: Avoids losing local source before backend has durable managed copy.

### D012: Exact Duplicates Do Not Create New Work Items

Decision: Exact duplicate content hashes create duplicate import events against the existing source memo.

Rationale: Prevents duplicate review work while preserving import history.

### D013: Possible Duplicates Are First-Class Records

Decision: Similar content with different file hash creates a separate source/work item and a possible duplicate signal.

Rationale: Similarity is not proof of duplication and should remain reviewable.

### D014: Accepted Snapshot Starts Versioning

Decision: Draft edit history is not retained. Immutable snapshots start at acceptance/export boundary.

Rationale: V1 keeps editing simple while preserving export immutability.

Risk: Pre-acceptance edit history is unavailable.

### D015: Accepted Is Not Terminal

Decision: Accepted items remain editable and exportable.

Rationale: Accepted ideas may need correction or enrichment after first acceptance.

### D016: CSV Export Is Out Of Scope

Decision: V1 exports Markdown bundle plus JSON Lines only.

Rationale: These formats preserve structured metadata and downstream ingestion shape better than CSV for MVP.

### D017: Export Schema Is Numbered

Decision: Start export schema at `memo-capture-export.v1`.

Rationale: Downstream systems need stable, explicit schema compatibility.

### D018: AI Expansion Is App-Owned, Not Workflow Transition

Decision: AI expansion creates suggestions and does not change workflow state by itself.

Rationale: AI output should remain reviewable and should not mutate lifecycle automatically.

### D019: AI Output Must Be Structured And Validated

Decision: Code-consumed AI output must be strict JSON validated before storage.

Rationale: Prevents invalid model output from becoming domain state.

### D020: No Delete Or Purge In V1

Decision: V1 has no user-facing delete, managed artifact purge, or canonical record deletion.

Rationale: Keeps retention, audit, export immutability, and recovery simple for MVP.

Risk: Privacy/deletion workflows are deferred.

## Target Schema Adjustments From Bootstrap Migration

### S001: Remove Feature Groups In Favor Of Tags

Current baseline: `feature_groups` are present in the bootstrap schema.

Target V1: feature groups are removed. Below-project grouping uses tags/keywords plus derived grouping metadata.

Action: Migrate existing feature-group assignments into normal tags, then remove feature-group columns, APIs, UI fields, settings, AI output fields, and export fields.

### S002: Accepted Snapshot Naming

Current baseline: `work_item_snapshots`.

Target V1: use domain term `accepted_snapshots`.

Action: Rename or create replacement migration before export implementation.

### S003: Source Memo Can Link To Multiple Work Items

Current baseline: `work_items.source_memo_id` supports many work items per source memo in practice.

Target V1: preserve and document this as intentional.

Action: Add tests for AI-generated or split-item future behavior when implemented.

### S004: Add Possible Duplicates

Current baseline: no `possible_duplicates` table.

Target V1: possible duplicates are first-class records.

Action: Add table before similarity detection.

### S005: Add Audit Events

Current baseline: no audit table.

Target V1: audit is required for settings, workflow, job actions, lifecycle actions, and exports.

Action: Add `audit_events` before protected settings/workflow work.

### S006: Add Staged Workflow Imports

Current baseline: active definition and activation history only.

Target V1: import validates/stages before explicit activation.

Action: Add `workflow_staged_imports`.

### S007: Preserve Bootstrap Migration And Add Forward Alignment Migration

Current baseline: `0001_initial.sql` is already the committed bootstrap schema.

Target V1: keep that file as historical baseline and add a forward-only
`0002_align_target_v1_schema.sql` migration for target schema alignment.

Action: Do not rewrite `0001_initial.sql`; implement the target delta described
in `docs/specs/schema-alignment.md`.

### S008: Backfill Local-Dev OIDC Issuer

Current baseline: `app_users.oidc_subject` is globally unique and has no issuer.

Target V1: users are unique by `(oidc_issuer, oidc_subject)`.

Action: Backfill any existing bootstrap rows with a local-dev issuer before
adding the target unique constraint.

### S009: Accepted Snapshot Conversion Requires Export Foreign Key Update

Current baseline: `export_batch_items.work_item_snapshot_id` references
`work_item_snapshots`.

Target V1: `export_batch_items.accepted_snapshot_id` references
`accepted_snapshots`.

Action: Convert snapshot table naming and export membership references in the
same migration so export history cannot point at the wrong domain term.

### S010: Settings Tables Are Part Of Schema Alignment

Current baseline: prompt tables exist, but file type, extraction,
transcription, provider, and export-template settings tables are missing.

Target V1: backend settings are canonical and must exist before protected
settings APIs, provider selection, watched-file parsing, or export template work.

Action: Include settings tables and default active V1 file-type seeds in the
target alignment migration rather than postponing them to UI implementation.

### S011: Audit Events Gate Protected Mutations

Current baseline: no audit table exists.

Target V1: settings, workflow, lifecycle actions, retry/cancel, and export
mutations write audit events.

Action: Add `audit_events` before implementing protected mutation endpoints.

### S012: Shared Domain Constants Own Schema String Values

Current baseline: some schema/API string values were only documented in specs.

Target V1: backend, worker, and UI code should import shared constants for
source types, artifact kinds, import statuses, duplicate statuses, job statuses,
provider status, workflow staged import status, export batch status, and audit
event names.

Action: Keep `packages/domain/src/index.ts` aligned before adding route,
repository, or worker literals.

## Open Decisions

### O001: Exact State Workflow Runtime Package/API

Question: What is the exact package, bundle shape, and adapter API for State Workflow Runtime?

Needed before: workflow adapter implementation.

Default assumption: keep an internal adapter boundary and fixture-based validation until the runtime package is selected.

### O002: OIDC Provider For Cloud Profile

Question: Which managed OIDC provider will be used for the cloud profile?

Needed before: production auth configuration docs.

Default assumption: provider-portable OIDC config remains the app boundary.

### O003: Local S3-Compatible Service For Development

Question: Which local S3-compatible service should be the documented default for integration tests?

Needed before: artifact integration test scripts.

Default assumption: use MinIO unless an existing local standard says otherwise.

### O004: Transcription Provider Contract

Question: Which transcription provider interface and result metadata are required first?

Needed before: `transcribe_audio` implementation.

Default assumption: internal provider adapter with provider/model/latency/cost metadata, plus local disabled mode.

### O005: LLM Provider Contract

Question: Which LLM provider should be the first implementation target?

Needed before: AI expansion implementation.

Default assumption: internal `generate_structured_output` adapter with strict schema validation.

### O006: Prompt Retention Details

Question: How long are old prompt bodies retained after no longer active or referenced?

Needed before: prompt cleanup behavior.

Default assumption: no automatic cleanup in MVP unless explicitly configured.

### O007: Full Text Search Implementation

Question: Should V1 use Postgres full-text search only, trigram indexes, or both?

Needed before: search performance tuning.

Default assumption: start with Postgres full-text search for work item title/body and transcript text.

### O008: Worker Heartbeat Storage

Question: Should worker heartbeat be a table, an in-memory health endpoint, or derived from recent job claims?

Needed before: system diagnostics implementation.

Default assumption: add a lightweight `worker_heartbeats` table if diagnostics need explicit worker status.

## Accepted Risks

- V1 assumes a trusted user group because all signed-in users are admins.
- Only the active workflow bundle body is stored.
- Draft edit history is not retained before acceptance.
- NAS/self-hosted support requires operator-managed backups, TLS, updates, and service availability.
- Workflow migration support is deferred; incompatible workflow upgrades are blocked.
- Unsupported configured file types remain inactive until parser support exists.
- V1 has no delete or privacy purge path.
- Local desktop cache uses OS-user protection only.
- Object keys may expose sanitized filename/project slug or name for operator debugging.
- The app does not expose active workflow bundle download.

## Review Cadence

Update this log when:

- a target schema choice changes
- a provider is selected
- workflow runtime package/API is selected
- an accepted risk is retired or becomes a blocker
- implementation discovers a new compatibility constraint
