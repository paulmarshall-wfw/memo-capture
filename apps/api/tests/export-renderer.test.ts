import assert from "node:assert/strict";
import test from "node:test";
import { MEMO_CAPTURE_EXPORT_SCHEMA_VERSION } from "@memo-capture/domain";
import { renderExportArtifacts } from "../src/services/export-renderer.js";

test("export renderer writes schema version to manifest, JSONL, Markdown, and bundle", () => {
  const rendered = renderExportArtifacts({
    batch: {
      id: "00000000-0000-4000-8000-000000000501",
      schemaVersion: MEMO_CAPTURE_EXPORT_SCHEMA_VERSION,
      status: "generating",
      createdBy: "00000000-0000-4000-8000-000000000001",
      filterContext: {},
      options: {},
      manifestArtifactId: null,
      jsonlArtifactId: null,
      combinedMarkdownArtifactId: null,
      bundleArtifactId: null,
      createdAt: "2026-05-29T00:00:00.000Z",
      completedAt: null,
      failedAt: null,
      errorCode: null,
      errorMessage: null,
      itemCount: 1
    },
    createdBy: {
      id: "00000000-0000-4000-8000-000000000001",
      oidcIssuer: "memo-capture-local-dev",
      oidcSubject: "local-dev-user",
      email: "dev@example.test",
      displayName: "Dev User",
      firstSeenAt: "2026-05-29T00:00:00.000Z",
      lastSeenAt: "2026-05-29T00:00:00.000Z",
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z"
    },
    snapshots: [
      {
        acceptedSnapshotId: "00000000-0000-4000-8000-000000000601",
        workItemId: "00000000-0000-4000-8000-000000000701",
        sourceMemoId: "00000000-0000-4000-8000-000000000801",
        title: "Export this memo",
        body: "Memo body",
        bodyFormat: "markdown",
        project: {
          id: "00000000-0000-4000-8000-000000000301",
          slug: "memo-capture",
          name: "Memo Capture"
        },
        featureGroup: {
          id: "00000000-0000-4000-8000-000000000401",
          name: "Exports"
        },
        contributor: {
          id: null,
          text: "Paul"
        },
        tags: ["exports"],
        source: {
          contentHash: "sha256:test",
          sourceType: "form",
          createdAt: "2026-05-29T00:00:00.000Z"
        },
        snapshotCreatedAt: "2026-05-29T00:01:00.000Z"
      }
    ]
  });

  assert.match(rendered.manifestJson, new RegExp(MEMO_CAPTURE_EXPORT_SCHEMA_VERSION));
  assert.match(rendered.itemsJsonl, new RegExp(MEMO_CAPTURE_EXPORT_SCHEMA_VERSION));
  assert.match(rendered.combinedMarkdown, /schema_version: memo-capture-export\.v1/);
  assert.equal(rendered.itemMarkdownFiles.length, 1);
  assert.match(rendered.itemMarkdownFiles[0]?.relativePath ?? "", /memo-capture/);
  assert.equal(rendered.bundleZip.subarray(0, 4).toString("hex"), "504b0304");
});
