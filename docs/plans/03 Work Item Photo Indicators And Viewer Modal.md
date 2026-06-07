# Work Item Photo Indicators And Viewer Modal

## Summary

Add attached-photo awareness to the work queue without changing photo ingestion or memo creation behavior. Work item rows with attached photos show a small camera icon in the center list. The selected work item detail panel shows an enabled `Photos` button on the right side of the existing Save/Reset action row when `photoAttachmentCount > 0`. Clicking it opens a responsive modal that displays the attached photos in a horizontal gallery, roughly 3-4 photos wide on desktop and adapting down for narrower windows.

## API And Data Contract

- Extend the serialized `WorkItem` contract with `photoAttachmentCount: number`.
- Add `GET /api/work-items/:workItemId/photo-attachments`.
- Return only metadata, not blobs:
  - `workItemId`
  - `photos: Array<{ originalArtifactId, thumbnailArtifactId, originalFilename, mimeType, byteSize, capturedAt, cameraMake, cameraModel }>`
- Back the count and endpoint from `work_item_artifacts` where `relationship = 'photo_attachment'`, joined to `artifacts` and `photo_imports`.
- Keep artifact bytes served through the existing authenticated `GET /api/artifacts/:artifactId/download` route.
- Do not add delete, detach, upload, OCR, or direct object-storage access in this slice.

## UI Behavior

- Center work item list:
  - Import and use the Lucide `Camera` icon.
  - Show a compact camera indicator only when `item.photoAttachmentCount > 0`.
  - Use an accessible label such as `3 attached photos`.
  - Keep the row layout stable and avoid shifting existing title/body/state/action controls.

- Detail panel action row:
  - Split the existing action row so Save/Reset/status remain left-aligned and `Photos` sits on the right.
  - Render `Photos` only for selected work items with `photoAttachmentCount > 0`.
  - The button is enabled even when the work item has unsaved text edits, because it is read-only and does not mutate the work item.
  - Label is exactly `Photos`.

- Photos modal:
  - Reuse the existing modal pattern (`modal-backdrop`, `review-modal`) with a new `photos-modal` variant.
  - Header shows `Photos` plus the selected work item title, and a top-right icon-only close button.
  - Body is a horizontally scrollable gallery.
  - Desktop sizing: modal width `min(1080px, calc(100vw - 32px))`; each photo tile uses a stable responsive width so 3-4 tiles fit on normal desktop widths.
  - Narrow windows collapse to 1-2 visible photos without text overlap.
  - Left/right arrow buttons scroll the gallery by about one viewport of tiles; disable or hide arrows when all photos fit.
  - Keyboard support: `Escape` closes; left/right arrow keys scroll when the modal is focused.
  - Fetch thumbnail artifact blobs for display when `thumbnailArtifactId` exists; otherwise fetch the original artifact.
  - Use object URLs for blobs and revoke them when the modal closes, the selected work item changes, or downloads fail.
  - Show a loading state and a recoverable error state inside the modal.

## Implementation Notes

- Add repository methods rather than ad hoc SQL in the server route:
  - `countPhotoAttachmentsForWorkItems(workItemIds)`
  - `listPhotoAttachments(workItemId)`
- Use a two-step list implementation to avoid breaking existing grouped tag queries: load work items, then attach counts by ID.
- Ensure `findById`, list refreshes, save responses, workflow action responses, and task responses all return work items with `photoAttachmentCount`.
- In `apps/desktop/src/App.tsx`, add modal state separate from the existing AI review modal state:
  - loading/error/photos object URLs
  - active `workItemId`
  - gallery scroll ref
- Add CSS classes for:
  - list-row camera indicator
  - right-aligned detail `Photos` action
  - responsive photos modal
  - horizontal gallery tiles and arrow controls

## Tests And Verification

- API tests:
  - Work item list includes `photoAttachmentCount = 0` when no attachments exist.
  - Work item list/detail include the correct count when `work_item_artifacts` has `photo_attachment` rows.
  - `GET /api/work-items/:id/photo-attachments` returns ordered photo metadata.
  - Missing work item returns 404.
  - Non-photo or unrelated artifact relationships are ignored.

- Desktop tests:
  - `WorkItem` interface includes `photoAttachmentCount`.
  - Camera icon indicator is rendered conditionally.
  - `Photos` action exists in the detail action row and is not blocked by unsaved draft changes.
  - Modal includes close control, left/right scroll controls, and artifact download usage.

- Manual/native verification:
  - Run `npm run typecheck`.
  - Run `npm test`.
  - Run `npm run test:postgres` for the real SQL join/count path.
  - Rebuild the native app with `npm run tauri:build -w @memo-capture/desktop -- --bundles app`.
  - Smoke test in the Tauri app with a memo created from multiple attached photos: icon appears in the list, `Photos` opens the modal, gallery scrolls, close works, and object URLs do not persist after closing.

## Assumptions

- The gallery is read-only in this slice.
- Attached photos are the existing `photo_attachment` links created by the Photos bucket create-memo flow.
- Thumbnails are preferred for modal display to keep the gallery responsive; originals are used as fallback when thumbnails are missing.
- No schema migration is required because `work_item_artifacts` and `photo_imports` already exist.
- The implementation should create a repo-local plan document at `docs/plans/03 Work Item Photo Indicators And Viewer Modal.md` if the user asks to write this into the checkout.
