import assert from "node:assert/strict";
import test from "node:test";
import { extractDeterministicMemoMetadata } from "../src/services/metadata-extraction.js";

test("deterministic metadata extraction normalizes text and suggests review-gated metadata", () => {
  const result = extractDeterministicMemoMetadata({
    title: "  # Memo Capture idea  ",
    body: "Contributor: Paul\n\nMemo Capture should transcribe Audio Notes for Memo Capture.   \n",
    sourceText: "",
    existingContributorText: null,
    projects: [
      {
        id: "project-1",
        name: "Memo Capture",
        isActive: true
      },
      {
        id: "project-2",
        name: "Archived Project",
        isActive: false
      }
    ]
  });

  assert.equal(result.title, "# Memo Capture idea");
  assert.equal(result.body.endsWith("   "), false);
  assert.equal(result.contributorText, "Paul");
  assert.deepEqual(result.projectSuggestion, {
    projectId: "project-1",
    projectName: "Memo Capture",
    confidence: 0.85
  });
  assert.ok(result.tagAssignments.some((tag) => tag.name === "Memo Capture"));
});

test("deterministic metadata extraction uses source transcript when the work item body is empty", () => {
  const result = extractDeterministicMemoMetadata({
    title: "",
    body: "",
    sourceText: "First transcript line\nSecond line",
    existingContributorText: null,
    projects: []
  });

  assert.equal(result.title, "First transcript line");
  assert.equal(result.body, "First transcript line\nSecond line");
});
