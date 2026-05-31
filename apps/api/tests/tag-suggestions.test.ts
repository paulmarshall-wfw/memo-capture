import assert from "node:assert/strict";
import test from "node:test";
import type { WorkItemRecord } from "../src/repositories/work-items.js";
import { buildTagSuggestionResponse } from "../src/services/work-items.js";

test("tag suggestions are ranked into strong, related, and weak rows without selected tags", () => {
  const workItem = {
    id: "work-item-1",
    sourceMemoId: "source-memo-1",
    projectId: "project-1",
    contributorText: null,
    contributorId: null,
    title: "Workflow Routing",
    body: "Workflow Routing captures review queue routing decisions.",
    tags: ["existing"],
    bodyFormat: "markdown",
    workflowState: "memo",
    workflowItemVersion: 1,
    acceptedSnapshotId: null,
    acceptedUnexportedChanges: false,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  } satisfies WorkItemRecord;

  const response = buildTagSuggestionResponse({
    workItem,
    sourceText: "Workflow Routing connects capture review and project grouping.",
    candidates: [
      {
        name: "existing",
        normalizedName: "existing",
        documentCount: 20,
        totalItemCount: 30,
        projectDocumentCount: 10,
        selectedCoDocumentCount: 10
      },
      {
        name: "Workflow Routing",
        normalizedName: "workflow routing",
        documentCount: 8,
        totalItemCount: 12,
        projectDocumentCount: 5,
        selectedCoDocumentCount: 3
      },
      {
        name: "Capture Pipeline",
        normalizedName: "capture pipeline",
        documentCount: 14,
        totalItemCount: 22,
        projectDocumentCount: 8,
        selectedCoDocumentCount: 2
      },
      {
        name: "Review Queue",
        normalizedName: "review queue",
        documentCount: 5,
        totalItemCount: 7,
        projectDocumentCount: 2,
        selectedCoDocumentCount: 0
      },
      {
        name: "Local Dev",
        normalizedName: "local dev",
        documentCount: 1,
        totalItemCount: 1,
        projectDocumentCount: 0,
        selectedCoDocumentCount: 0
      }
    ]
  });

  assert.equal(response.workItemId, "work-item-1");
  assert.equal(response.suggestions.strong.includes("existing"), false);
  assert.equal(response.suggestions.strong[0], "Workflow Routing");
  assert.equal(response.suggestions.strong.includes("Capture Pipeline"), true);
  assert.equal(response.suggestions.strong.includes("Review Queue"), true);
  assert.equal(response.suggestions.weak.includes("Local Dev"), true);
});
