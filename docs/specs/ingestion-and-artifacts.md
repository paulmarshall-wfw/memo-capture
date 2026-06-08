# Ingestion And Artifacts

Status: Draft implementation specification
Last updated: 2026-05-29

## Purpose

Define V1 ingestion channels, watched-folder behavior, artifact storage, duplicate handling, local staging/cache, upload/finalization contracts, and recovery behavior.

## Supported V1 Channels

- App data-entry form.
- Watched folder for text files.
- Watched folder for audio files.

Manual file import outside watched folders is out of scope for MVP.

## Active File Types

Active text formats:

- `.txt`
- `.md`
- `.markdown`

Active audio formats:

- `.m4a`
- `.mp3`
- `.wav`

Inactive or `not_supported_yet` configured file types are not scanned or accepted by watched-folder ingestion. Active configured file types whose media type is inactive or `not_supported_yet` are rejected before upload. Active configured text/audio types without an active implemented parser are accepted into managed storage and converted into `needs_review` work items that prompt parser support.

Current implementation note: the native desktop app actively watches saved enabled watched folders while it is open by polling the existing stable-file scanner. Watched-folder scanning and upload sessions accept active text, audio, and photo extensions from backend settings when their media type is active. Backend parser routing is centralized in the watched import parser registry. Text finalization extracts UTF-8 text when parser type `plain-text` or `markdown` is active. Audio finalization creates the source memo, original audio artifact, work item, import event, and a `transcribe_audio` processing job before archive reporting when parser type `audio-transcription` is active. Photo finalization creates source memo provenance, an original photo artifact, a visible `photo_imports` row, and a `preprocess_photo` processing job for metadata and thumbnail generation; it does not create a work item until selected photos are consumed from the Photos bucket. Whisper.cpp is a transcription provider selected by runtime/provider configuration, not a file type parser. Active unimplemented parser settings finalize without processing jobs.

## Source Creation Rules

Every successful capture creates provenance first:

1. Create or verify managed artifact where applicable.
2. Create or reuse `source_memo`.
3. Create `work_item` unless exact duplicate rules suppress it.
4. Schedule processing jobs where needed.

Initial state:

- `memo` for form submissions and high-confidence imports.
- `needs_review` for incomplete or low-confidence imports.

Promotion from `needs_review` to `memo` requires:

- selected `project_id`
- title
- memo body or transcript
- linked source memo

Tags and contributor are optional.

## Desktop Watched-Folder Responsibilities

The desktop app owns:

- configured watched folder paths
- configured archive folder paths
- local file stability checks
- local staging/cache
- upload queue
- local warning persistence
- archive moves
- machine identity

Rules:

- Wait for file size and mtime stability before upload.
- Recursion is off by default and configurable per watched folder.
- Multiple desktop clients watching the same folder are unsupported in V1.
- Failed local import/upload state survives desktop restart.
- Inactive or not-supported file types are skipped locally. Active file types with inactive media support are rejected by the backend. Active file types with missing parser support create backend review records.

## Archive Behavior

Watched-folder files are input channels, not long-term source truth.

Rules:

- Archive after managed artifact upload succeeds.
- Do not wait for extraction or transcription success before archiving.
- Never delete originals automatically.
- Archive location is desktop-local.
- Archive files are grouped by import date.
- Archived filename preserves original filename with import ID or hash prefix.
- Archive move must never overwrite existing files.
- Import events record original path and archive path.
- Archive move failure does not undo successful import.
- Archive move failure creates a local warning and appears in diagnostics.

Archive layout:

```text
<archive-root>/
  2026/
    05/
      29/
        <import-id-prefix>-<original-filename>
```

## Artifact Storage Contract

Object storage is S3-compatible.

Rules:

- Backend owns object storage credentials.
- Desktop clients never receive permanent object storage credentials.
- Desktop uploads through backend-mediated signed URLs or backend upload streams.
- Playback/download uses backend-authorized routes or signed access.
- Raw file blobs are not stored in Postgres.
- Original imported files are permanent managed artifacts unless a future explicit deletion feature is introduced.

Current implementation note: authenticated artifact playback/download is exposed through `GET /api/artifacts/{artifactId}/download`; the desktop UI fetches audio with the bearer token and plays a local object URL. Work item API responses include `photoAttachmentCount`, and `GET /api/work-items/{workItemId}/photo-attachments` returns attached-photo metadata only. The desktop work queue shows a compact photo indicator for attached photos, and the detail panel opens a read-only Photos modal that fetches thumbnails, or originals when thumbnails are unavailable, through the authenticated artifact download route.

Object key layout includes a numbered layout version:

```text
artifacts/v1/source-memos/<source-memo-id>/original/<artifact-id>-<sanitized-name>
artifacts/v1/source-memos/<source-memo-id>/derived/transcript/<artifact-id>.txt
exports/v1/<export-batch-id>/manifest.json
exports/v1/<export-batch-id>/items.jsonl
exports/v1/<export-batch-id>/markdown/<project-slug>/<snapshot-id>-<slug>.md
exports/v1/<export-batch-id>/combined.md
```

Object keys may include sanitized project/source filename fragments for operator debugging.

## Upload Session Flow

The backend creates an upload/import session first.

1. Desktop detects stable supported file.
2. Desktop computes content hash.
3. Desktop calls create upload session with filename, original path, content hash, byte size, MIME type, the file's filesystem creation timestamp, and the watched folder's contributor name when configured, falling back to modified timestamp only when creation time is unavailable.
4. Backend checks exact duplicate by content hash.
5. Backend returns duplicate result or upload authorization.
6. Desktop uploads artifact.
7. Desktop calls finalize.

The source file creation timestamp is stored as source memo provenance. Work queue rows and the work item detail header display this original memo time; workflow processing timestamps remain available through audit, diagnostics, and logs.
8. Backend verifies object metadata/hash.
9. Backend creates artifact, source memo, import event, work item, and processing jobs. If a watched-folder contributor name was supplied, the backend stores it as contributor text and links the source memo/work item to the contributor record found or created by the hidden normalized contributor key.
10. Desktop archives original after backend confirms managed artifact storage.

If upload succeeds but source/work-item creation fails:

- create a recoverable import error tied to uploaded artifact
- retry finalization without reuploading

## API Contracts

### Create upload session

`POST /api/imports/upload-sessions`

Request:

```json
{
  "machineId": "string",
  "watchFolderId": "string",
  "sourceType": "watched_audio_file",
  "originalFilename": "memo.m4a",
  "originalPath": "/local/path/memo.m4a",
  "mimeType": "audio/mp4",
  "byteSize": 12345,
  "contentHash": "sha256:...",
  "contributorText": "Paul Marshall"
}
```

Response for upload:

```json
{
  "sessionId": "uuid",
  "status": "upload_required",
  "upload": {
    "method": "PUT",
    "url": "https://signed-upload-url",
    "headers": {}
  }
}
```

Response for exact duplicate:

```json
{
  "sessionId": "uuid",
  "status": "duplicate_exact",
  "duplicateOfSourceMemoId": "uuid"
}
```

### Finalize upload session

`POST /api/imports/upload-sessions/{sessionId}/finalize`

Request:

```json
{
  "machineId": "string",
  "archivePlanned": true
}
```

Response:

```json
{
  "sourceMemoId": "uuid",
  "workItemId": "uuid",
  "artifactId": "uuid",
  "initialWorkflowState": "needs_review",
  "processingJobs": ["uuid"]
}
```

For audio imports, `processingJobs` includes the queued `transcribe_audio` job. The work item remains in `needs_review` with an empty body until transcription succeeds or a user saves a manual transcript from the work-item detail panel.

### Report archive result

`POST /api/imports/{importEventId}/archive-result`

Request:

```json
{
  "machineId": "string",
  "archivePath": "/archive/2026/05/29/abc-memo.m4a",
  "status": "archived",
  "warning": null
}
```

### Create form memo

`POST /api/source-memos/form`

Request:

```json
{
  "projectId": "uuid",
  "title": "string",
  "body": "string",
  "contributorText": "string | null",
  "tags": ["string"]
}
```

## Duplicate Handling

Exact duplicate:

- based on content hash
- creates import event
- links to existing source memo
- does not create a new source memo
- does not create a new work item

Possible duplicate:

- same or similar text with different file hash
- creates separate source memo and work item
- creates possible duplicate signal
- remains user-reviewable

## Transcripts

Audio source memos support:

- original managed audio artifact
- current transcript text in Postgres for query/review
- derived transcript artifact for provenance/versioning
- audio playback in detail panel
- manual transcript/body entry after transcription failure

Transcription failure does not delete or invalidate the original source artifact.

## Desktop Local Cache

Rules:

- App-managed default staging/cache path.
- Advanced setting can move cache path.
- Local artifact cache has configurable size cap with least-recently-used cleanup.
- Clearing local cache does not affect backend managed artifacts.
- Staged-but-not-uploaded files are never auto-cleaned.
- Machine identity is stable per app data directory/install and regenerated if local app data is removed.

## Security And Privacy

- Local file paths may appear in local diagnostics and backend import metadata where needed for troubleshooting.
- Local paths must not be sent to external AI/transcription providers.
- Desktop local cache uses OS-user protection only in V1.
- Watched-folder archive copies are outside Memo Capture's privacy boundary after the app moves them.

## Acceptance Tests

- Supported text file creates upload session, artifact, source memo, work item, and extraction job.
- Supported audio file creates upload session, artifact, source memo, work item, and transcription job.
- Inactive or not-supported file type creates only local diagnostics.
- Active file type without an active implemented parser creates a review work item and no processing jobs.
- File is archived only after upload/finalize confirms managed artifact storage.
- Archive collision generates a non-overwriting destination.
- Archive move failure records local warning and does not undo import.
- Exact duplicate content hash creates duplicate import event only.
- Upload-finalize failure can retry without reuploading.
- Desktop restart preserves staged upload state.
