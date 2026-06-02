import assert from "node:assert/strict";
import test from "node:test";
import { PROCESSING_JOB_KINDS } from "@memo-capture/domain";

test("worker knows the v1 processing job kinds", () => {
  assert.deepEqual([...PROCESSING_JOB_KINDS], [
    "transcribe_audio",
    "extract_memo_metadata",
    "generate_keywords",
    "nominate_tags",
    "expand_work_item",
    "generate_export_batch"
  ]);
});
