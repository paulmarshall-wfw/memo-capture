# Memo Capture

## Executive Summary

Memo Capture is a cross-platform desktop app for turning spoken and written ideas into structured, reviewable work items. It captures memos from manual entry, watched text folders, and watched audio folders; preserves source provenance; supports transcription, classification, tagging, workflow review, AI-assisted expansion, and export of accepted ideas for downstream systems.

The app is designed for a shared backend with local desktop convenience: users work in a native desktop shell on macOS or Windows, while canonical records, workflow state, settings, artifacts, jobs, audit data, and exports are controlled by backend services. V1 is built around controlled projects, flat tags and keyword suggestions, workflow-defined lifecycle actions, and explicit operational controls for workflow imports and activation.

## Who It Is For

Memo Capture is for people or teams who generate many project ideas through voice notes, text notes, meeting fragments, or quick written observations and need a reliable way to organize them into a review workflow.

It is especially suited to users who want to capture memos from their own desktop environment while sharing a common backend database across multiple machines or contributors.

## What It Does

Memo Capture ingests text and audio memos, stores original source provenance, and creates editable work items for review. Text files can be imported from watched folders, and audio files can be transcribed before becoming reviewable work items.

Work items are organized by controlled project names, flat tags, generated keyword suggestions, contributor metadata, and original memo timestamps. Users can review, edit, accept, park, reject, ignore, recover, or export items through actions supplied by the active workflow definition.

The app also includes project configuration, watched-folder settings, media and parser type settings, transcription provider diagnostics, processing job diagnostics, audit/event views, workflow import operations, AI expansion boundaries, accepted snapshots, and export batch generation.

## How To Use It

Run the backend API, worker, and desktop app, then sign in or use the configured local-development auth mode. Configure projects, file types, parser settings, transcription provider settings, watched folders, and archive locations before relying on automatic imports.

Use the Work queue as the primary workspace. Select a workflow bucket, review the item list, edit memo details in the detail panel, apply suggested tags, listen to audio when available, retry or recover failed transcription when needed, and use the visible workflow actions exposed for the selected item.

Use Projects for controlled project setup and auto-promotion thresholds, Settings for ingestion and provider configuration, Operations for workflow bundle validation and activation, Audit for workflow and backend activity, and Export for accepted work item snapshots and export batches.

## Technical Foundations

Memo Capture is an npm workspace at version `0.1.0` with a Tauri + React desktop app, a TypeScript API service, a TypeScript worker, and shared TypeScript packages for domain and configuration contracts.

Postgres stores canonical records, workflow state, settings, processing jobs, audit events, and export metadata. S3-compatible object storage stores original files, transcript artifacts, export bundles, and other large managed artifacts. Desktop clients do not connect directly to Postgres or object storage; all canonical mutations go through the backend API.

The workflow lifecycle is integrated with State Workflow Runtime. The backend owns durable business state, executes workflow actions, and returns allowed actions and bucket metadata to the frontend so the UI does not hardcode lifecycle availability.

Background work is handled by the worker through Postgres-backed job claim, lease, retry, and cancel semantics. Current foundations include deterministic metadata extraction, keyword generation, watched-folder parser routing, Whisper.cpp transcription provider support, structured JSON validation for AI output, OIDC-compatible authentication, local-development auth, diagnostics endpoints, and the root verification command `npm run verify`.
