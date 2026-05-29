import assert from "node:assert/strict";
import test from "node:test";
import { readApiConfig } from "../src/config.js";
import { createHealthPayload } from "../src/health.js";

test("health payload exposes service version and commit", () => {
  const config = readApiConfig({
    MEMO_CAPTURE_API_PORT: "4788",
    MEMO_CAPTURE_APP_VERSION: "0.1.0",
    MEMO_CAPTURE_COMMIT_SHA: "test-sha"
  });

  const payload = createHealthPayload(config, "memo-capture-api");

  assert.equal(payload.ok, true);
  assert.equal(payload.service, "memo-capture-api");
  assert.equal(payload.version, "0.1.0");
  assert.equal(payload.commitSha, "test-sha");
});
