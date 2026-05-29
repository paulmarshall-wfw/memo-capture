import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTIFACT_KINDS,
  EXPORT_BATCH_STATUSES,
  IMPORT_EVENT_STATUSES,
  isActiveWorkItemState,
  isTerminalWorkItemState,
  POSSIBLE_DUPLICATE_STATUSES,
  SOURCE_MEMO_TYPES,
  REQUIRED_BUCKET_ROLES,
  WORK_ITEM_STATES
} from "../src/index.js";

test("work item states include accepted active state and closed terminal states", () => {
  assert.equal(isActiveWorkItemState("accepted"), true);
  assert.equal(isTerminalWorkItemState("accepted"), false);
  assert.equal(isTerminalWorkItemState("rejected"), true);
  assert.equal(isTerminalWorkItemState("ignored"), true);
  assert.equal(isTerminalWorkItemState("failed"), true);
  assert.equal(WORK_ITEM_STATES.includes("needs_ingestion_review"), true);
});

test("required workflow bucket roles are stable", () => {
  assert.deepEqual([...REQUIRED_BUCKET_ROLES], [
    "ingestion_review",
    "new_ideas",
    "accepted",
    "closed"
  ]);
});

test("schema contract constants include v1 storage states", () => {
  assert.deepEqual([...SOURCE_MEMO_TYPES], [
    "form",
    "watched_text_file",
    "watched_audio_file",
    "ai_generated"
  ]);
  assert.equal(ARTIFACT_KINDS.includes("export_bundle"), true);
  assert.equal(IMPORT_EVENT_STATUSES.includes("duplicate_exact"), true);
  assert.equal(POSSIBLE_DUPLICATE_STATUSES.includes("confirmed_duplicate"), true);
  assert.equal(EXPORT_BATCH_STATUSES.includes("generating"), true);
});
