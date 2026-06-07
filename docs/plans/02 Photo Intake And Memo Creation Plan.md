# Photo Intake And Memo Creation Plan

## Summary

Add watched-folder photo intake as an app-owned Photos screen above the workflow `Review` bucket. Photos are imported into managed storage, preprocessed for metadata and thumbnails, listed with checkboxes, then selected photos can be consumed into a new `memo` work item as attachments.

This is photo-only scope. PDF ingestion and OCR stay out of this slice.

## Key Changes

- Extend the domain/API contract with `watched_photo_file`, `original_photo_file`, `derived_photo_thumbnail`, `photo_attachment`, and `preprocess_photo`.
- Add a durable `photo_imports` table that tracks detected photos independently from workflow work items:
  `available`, `preprocessing`, `preprocessing_failed`, `attached`.
- Promote image media support to active and seed exact photo extensions: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.heif`.
- Add pinned image-processing dependencies to `@memo-capture/api`: `sharp@0.34.5` for thumbnails and `exifr@7.1.3` for EXIF/GPS metadata.

## Implementation

- Extend watched-folder upload sessions so image files finalize into source memo provenance, original photo artifact, import event, `photo_imports` row, and a queued `preprocess_photo` job, but no work item.
- Worker preprocessing reads the original artifact, extracts date/time taken, camera make/model, and GPS latitude/longitude when present, then stores a thumbnail artifact linked to the photo source memo.
- Add protected API routes:
  - `GET /api/photo-imports` returns visible photo rows for the Photos screen.
  - `POST /api/photo-imports/create-memo` accepts selected photo import IDs plus project, optional title, body, and tags.
- `create-memo` runs in one transaction: lock selected `available` photo rows, derive contributor when all selected photos share the same watched-folder contributor, create a `form` source memo and `memo` work item, link selected photo artifacts as `photo_attachment`, mark imports `attached`, schedule normal memo hooks, and return the created work item.
- The title field is optional. If blank, derive it from the memo body first, then the first selected filename.

## UI Behavior

- Insert a synthetic `Photos` bucket above workflow `Review`, with its count from `GET /api/photo-imports`.
- In Photos, render a dense list of photo rows with checkbox, filename, thumbnail/status, captured date, camera model, GPS indicator, and import/preprocessing status.
- The right detail panel mirrors the work-item editor shape: Create Memo button at top, project selector, optional title, memo body, and tags.
- Create Memo is enabled only when at least one available photo is selected, project is selected, and memo body has text.
- On click, remove selected photos optimistically from the Photos list, disable the form while saving, and roll them back if the API fails.
- On success, refresh bucket counts. If photos remain in Photos, stay in the Photos bucket and clear/reset the create-memo draft. If no photos remain, switch to the Memos bucket with the newly created memo selected.

## Tests And Verification

- Add domain tests for new constants and source/artifact/job kinds.
- Add API service and route tests for photo upload finalization, duplicate handling, preprocessing success/failure, metadata storage, thumbnail artifact creation, create-memo validation, atomic consumption, contributor derivation, and rollback-safe conflicts.
- Add desktop tests for image source-type mapping, Photos bucket insertion above Review, Create Memo enablement, optimistic removal, stay-in-Photos behavior when photos remain, and Memos navigation only when Photos becomes empty.
- Run `npm run typecheck`, `npm test`, `npm run test:postgres`, and `npm run build`.
- For native validation, rebuild the runnable app with `npm run tauri:build -w @memo-capture/desktop -- --bundles app` and smoke test watched-folder photo intake in the Tauri app.
