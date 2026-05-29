import assert from "node:assert/strict";
import test from "node:test";
import {
  isActiveWorkItemState,
  isTerminalWorkItemState,
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
