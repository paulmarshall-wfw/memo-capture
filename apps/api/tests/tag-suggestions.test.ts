import assert from "node:assert/strict";
import test from "node:test";
import type { WorkItemRecord } from "../src/repositories/work-items.js";
import { extractKeywords } from "../src/services/keywords.js";
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
    tagsAvailable: true,
    bodyFormat: "markdown",
    workflowState: "memo",
    workflowItemVersion: 1,
    acceptedSnapshotId: null,
    acceptedUnexportedChanges: false,
    photoAttachmentCount: 0,
    originalFileModifiedAt: "2026-05-28T23:45:00.000Z",
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
  assert.equal(
    [
      ...response.suggestions.strong,
      ...response.suggestions.related,
      ...response.suggestions.weak
    ].includes("Review Queue"),
    true
  );
  assert.equal(response.suggestions.weak.includes("Local Dev"), true);
});

test("tag suggestions exclude globally suppressed candidate and keyword tags", () => {
  const workItem = {
    id: "work-item-1",
    sourceMemoId: "source-memo-1",
    projectId: "project-1",
    contributorText: null,
    contributorId: null,
    title: "Workflow Routing",
    body: "Workflow Routing captures review queue routing decisions.",
    tags: [],
    tagsAvailable: true,
    bodyFormat: "markdown",
    workflowState: "memo",
    workflowItemVersion: 1,
    acceptedSnapshotId: null,
    acceptedUnexportedChanges: false,
    photoAttachmentCount: 0,
    originalFileModifiedAt: "2026-05-28T23:45:00.000Z",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  } satisfies WorkItemRecord;

  const response = buildTagSuggestionResponse({
    workItem,
    sourceText: "Workflow Routing connects capture review and project grouping.",
    candidates: [
      {
        name: "Workflow Routing",
        normalizedName: "workflow routing",
        documentCount: 8,
        totalItemCount: 12,
        projectDocumentCount: 5,
        selectedCoDocumentCount: 3
      },
      {
        name: "Review Queue",
        normalizedName: "review queue",
        documentCount: 5,
        totalItemCount: 7,
        projectDocumentCount: 2,
        selectedCoDocumentCount: 0
      }
    ],
    suppressedTagNames: ["workflow routing", "project grouping"]
  });

  const allSuggestions = [
    ...response.suggestions.strong,
    ...response.suggestions.related,
    ...response.suggestions.weak
  ].map((tag) => tag.toLowerCase());

  assert.equal(allSuggestions.includes("workflow routing"), false);
  assert.equal(allSuggestions.includes("project grouping"), false);
  assert.equal(allSuggestions.includes("review queue"), true);
});

test("keyword extraction filters generic verbs and stop words from generated tags", () => {
  const keywords = extractKeywords("Smoke test memo\nThis memo was created during the local run/test smoke pass.");
  const names = new Set(keywords.map((keyword) => keyword.name.toLowerCase()));

  assert.equal(names.has("was"), false);
  assert.equal(names.has("created"), false);
  assert.equal(names.has("during"), false);
  assert.equal(names.has("run"), false);
  assert.equal(names.has("test"), false);
  assert.equal(names.has("local"), false);
  assert.equal(names.has("smoke"), true);
});

test("tag suggestions do not add text-derived tags outside the candidate lexicon", () => {
  const workItem = {
    id: "work-item-1",
    sourceMemoId: "source-memo-1",
    projectId: "project-1",
    contributorText: null,
    contributorId: null,
    title: "Workflow Routing",
    body: "Workflow Routing captures review queue routing decisions.",
    tags: [],
    tagsAvailable: true,
    bodyFormat: "markdown",
    workflowState: "memo",
    workflowItemVersion: 1,
    acceptedSnapshotId: null,
    acceptedUnexportedChanges: false,
    photoAttachmentCount: 0,
    originalFileModifiedAt: "2026-05-28T23:45:00.000Z",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  } satisfies WorkItemRecord;

  const response = buildTagSuggestionResponse({
    workItem,
    sourceText: "Workflow Routing connects capture review and project grouping.",
    candidates: [
      {
        name: "Review Queue",
        normalizedName: "review queue",
        documentCount: 5,
        totalItemCount: 7,
        projectDocumentCount: 2,
        selectedCoDocumentCount: 0
      }
    ]
  });

  const allSuggestions = [
    ...response.suggestions.strong,
    ...response.suggestions.related,
    ...response.suggestions.weak
  ].map((tag) => tag.toLowerCase());

  assert.equal(allSuggestions.includes("workflow routing"), false);
  assert.equal(allSuggestions.includes("review queue"), true);
});

test("keyword extraction prefers distinctive terms against a workspace corpus", () => {
  const keywords = extractKeywords("Workflow Routing\nWorkflow Routing captures review queue routing decisions.", {
    corpusTexts: [
      "Daily memo created during local run test pass.",
      "Another memo was created during the local test run.",
      "Import review captures project metadata and contributor text."
    ]
  });
  const names = new Set(keywords.map((keyword) => keyword.name.toLowerCase()));

  assert.equal(names.has("workflow routing"), true);
  assert.equal(names.has("created"), false);
  assert.equal(names.has("during"), false);
  assert.equal(names.has("local"), false);
  assert.equal(names.has("run"), false);
});
