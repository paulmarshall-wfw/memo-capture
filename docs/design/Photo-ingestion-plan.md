# Watched-Folder Photo, PDF, and OCR Plan

## Summary

Implement image and PDF ingestion through watched folders, not manual standalone upload. The create-memo form will support attaching photos directly. Watched-folder image/PDF imports will create provenance, managed artifacts, and `needs_review` work items. OCR remains an explicit per-artifact action through a provider adapter. Future people identification gets schema hooks only.

## Key Interface Changes

- Extend domain constants:
  - Source memo types: add `watched_image_file`, `watched_pdf_file`.
  - Artifact kinds: add `original_image_file`, `original_pdf_file`, `extracted_document_image`, `form_image_attachment`, `derived_ocr_text`.
  - Artifact relationships: add `form_attachment`, `extracted_document_image`, `derived_ocr_text`.
  - Job kinds: add `extract_document_images` and `run_ocr`.
  - Provider kinds: add `ocr`.
- Extend watched-folder upload sessions to accept image and PDF source types.
- Extend `POST /api/source-memos/form` to accept staged photo attachment session IDs.
- Add `POST /api/artifacts/{artifactId}/ocr` to queue OCR manually for image-like artifacts.
- Add durable analysis-result storage for OCR output and future `people_identification` output.

## Implementation Tasks

1. **Schema and domain contract**
   - Add supported extensions: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.heif`, and `.pdf`.
   - Add artifact/source/job/provider/audit constants and migration constraints.
   - Add `artifact_analysis_results` with analysis kind, source artifact, provider/model metadata, validated JSON output, optional text output, and optional derived artifact.
   - Keep people identification reserved as an analysis kind, with no working provider or UI yet.

2. **Watched-folder image/PDF ingestion**
   - Extend watched-folder scanner support and settings display for active image/PDF file types.
   - Reuse the backend-mediated upload-session flow for watched images and PDFs.
   - Finalizing an image creates a source memo, original image artifact, import event, and `needs_review` work item.
   - Finalizing a PDF creates a source memo, original PDF artifact, import event, `needs_review` work item, and an `extract_document_images` job.
   - Preserve exact duplicate behavior: duplicate import event only, no duplicate source memo or work item.

3. **Create-memo photo attachments**
   - Add a photo attachment picker to the form memo UI.
   - Stage selected photos through a form-attachment upload session before submit.
   - On form submit, link uploaded photo artifacts to the form source memo as `form_attachment`.
   - Form attachments do not create separate work items and do not modify the user-entered memo body automatically.

4. **PDF embedded-image extraction**
   - Implement `extract_document_images` in the worker.
   - Extract embedded raster images from watched-folder PDFs into `extracted_document_image` artifacts.
   - Link extracted images to the same source memo and expose them in work-item diagnostics.
   - If a PDF has no extractable images, record a recoverable diagnostic and leave the work item reviewable.

5. **Manual OCR**
   - Add an OCR provider interface with `disabled` and `local-dev` implementations first.
   - Add OCR provider settings/diagnostics using the existing provider configuration pattern.
   - Add a user-visible “Send to OCR” action for original images, form photo attachments, and extracted PDF images.
   - OCR success stores a `derived_ocr_text` artifact and an `artifact_analysis_results` row.
   - For watched image/PDF work items with empty bodies, OCR success may populate the body and enqueue metadata extraction; otherwise OCR text is shown as an explicit apply/append option.

6. **UI and diagnostics**
   - Update watched-folder screens to show image/PDF support, import outcomes, and unsupported-file diagnostics.
   - Update work-item detail diagnostics to show source images, PDF artifacts, extracted images, OCR jobs, and OCR result summaries.
   - Use previews where browser/Tauri support exists; fall back to filename, type, size, and download/open controls where preview is unavailable.

7. **Docs and verification**
   - Update `docs/design/memo-capture-design-learnings.md` and relevant specs to replace manual standalone upload with watched-folder image/PDF ingestion.
   - Add tests for watched image import, watched PDF import, duplicate image/PDF handling, form photo attachments, PDF extraction success/failure diagnostics, disabled OCR failure, local-dev OCR success, and worker job dispatch.
   - Run `npm run verify`; report any blocker from missing dependencies, Postgres, object storage, PDF tooling, or Tauri tooling.

## Assumptions

- Standalone image/PDF import is not a separate manual upload UI in V1.
- Watched-folder image and PDF imports create `needs_review` work items.
- Create-memo form attachments are photos/images only, not PDFs.
- OCR is manual per artifact.
- PDFs use embedded-image extraction, not full-page rendering.
- The first OCR provider implementation is adapter-first with `disabled` and `local-dev`; real external provider selection comes later.
