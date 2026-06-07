import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MEMO_WORK_ITEM_STATE,
  ACTIVE_IMAGE_FILE_EXTENSIONS,
  ARTIFACT_KINDS,
  AUDIT_EVENT_NAMES,
  EXPORT_BATCH_STATUSES,
  INITIAL_WORK_ITEM_STATES,
  IMPORT_EVENT_STATUSES,
  isActiveWorkItemState,
  isTerminalWorkItemState,
  POSSIBLE_DUPLICATE_STATUSES,
  SOURCE_MEMO_TYPES,
  SUPPORTED_WORKFLOW_APP_CAPABILITIES,
  SUPPORTED_WORKFLOW_HOOK_HANDLERS,
  WORK_ITEM_STATES
} from "../src/index.js";

test("work item states use memo as the successful capture state", () => {
  assert.equal(DEFAULT_MEMO_WORK_ITEM_STATE, "memo");
  assert.deepEqual([...INITIAL_WORK_ITEM_STATES], ["needs_review", "memo"]);
  assert.equal(WORK_ITEM_STATES.includes("memo"), true);
  assert.equal((WORK_ITEM_STATES as readonly string[]).includes("new_idea"), false);
  assert.equal(isActiveWorkItemState("accepted"), true);
  assert.equal(isTerminalWorkItemState("accepted"), false);
  assert.equal(isTerminalWorkItemState("rejected"), false);
  assert.equal(isTerminalWorkItemState("ignored"), false);
  assert.equal(isTerminalWorkItemState("failed"), false);
  assert.equal(WORK_ITEM_STATES.includes("needs_review"), true);
});

test("supported workflow hook handlers are app-owned", () => {
  assert.deepEqual([...SUPPORTED_WORKFLOW_HOOK_HANDLERS], ["create_accepted_snapshot", "classify_item", "nominate_tags"]);
  assert.deepEqual([...SUPPORTED_WORKFLOW_APP_CAPABILITIES], [
    "memo-capture.workflow-hooks.create_accepted_snapshot.v1",
    "memo-capture.workflow-hooks.classify_item.v1",
    "memo-capture.workflow-hooks.nominate_tags.v1"
  ]);
});

test("schema contract constants include v1 storage states", () => {
  assert.deepEqual([...SOURCE_MEMO_TYPES], [
    "form",
    "watched_text_file",
    "watched_audio_file",
    "watched_photo_file",
    "ai_generated"
  ]);
  assert.deepEqual([...ACTIVE_IMAGE_FILE_EXTENSIONS], [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);
  assert.equal(ARTIFACT_KINDS.includes("original_photo_file"), true);
  assert.equal(ARTIFACT_KINDS.includes("derived_photo_thumbnail"), true);
  assert.equal(IMPORT_EVENT_STATUSES.includes("duplicate_exact"), true);
  assert.equal(AUDIT_EVENT_NAMES.includes("source_memo.archive_result_recorded"), true);
  assert.equal(POSSIBLE_DUPLICATE_STATUSES.includes("confirmed_duplicate"), true);
  assert.equal(EXPORT_BATCH_STATUSES.includes("generating"), true);
});
