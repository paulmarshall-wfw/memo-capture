# Watched-Folder_Contributor_Attribution

## Summary
Implement contributor identification from watched-folder configuration. Each watched folder gets a `Contributor name` field; files imported from that folder use that value as the work item’s contributor name. The backend normalizes the name by removing special characters and lowercasing it to create a hidden contributor key, while preserving the existing UUID foreign-key model for `contributor_id`.

## Key Changes
- Add `contributorName` to the desktop-local `WatchedFolderSetting`, defaulting to `""` for existing saved settings.
- Pass the trimmed folder contributor name in `POST /api/imports/upload-sessions` as `contributorText`.
- Add a backend normalization helper:
  - trim whitespace
  - lowercase
  - remove non-alphanumeric characters
  - if the result is empty, treat contributor as unset
- Add a hidden `contributor_key` column to `contributors`, backfilled from existing display names.
- On watched import finalization, upsert/find a contributor by `contributor_key`; store:
  - `source_memos.contributor_text`
  - `source_memos.contributor_id`
  - `work_items.contributor_text`
  - `work_items.contributor_id`
- Ensure audio transcription-created work items inherit contributor data from the linked source memo.
- Keep the normalized contributor key out of the UI.

## UI Density
- Replace watched-folder card-style rows with a dense table-like grid: enabled, contributor name, watched path, archive path, recursive, stability, actions.
- Keep folder picker and remove actions as icon-only buttons with tooltips.
- Collapse watched-folder status metadata into a compact status strip with short labels.
- Reduce row padding/gaps for this settings section while preserving accessible labels, keyboard focus, and mobile stacking.

## Docs And Tests
- Update `docs/specs/settings-and-audit.md` and `docs/specs/ingestion-and-artifacts.md` for watched-folder contributor attribution.
- Add API tests covering:
  - text watched import sets contributor text and linked contributor
  - audio import source memo stores contributor and transcription work item inherits it
  - empty contributor name leaves contributor fields null
  - punctuation/case variants normalize to the same contributor key
- Add desktop tests/source assertions for the contributor field and compact watched-folder layout.
- Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run verify`; rebuild the Tauri `.app` bundle if implementation proceeds.

## Assumptions
- “Much more dense” applies to the watched-folder settings display and related status information, not a full app-wide redesign.
- The visible contributor name remains the source of truth shown to users; the normalized contributor key is internal only.
