import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MEMO_CAPTURE_EXPORT_SCHEMA_VERSION } from "@memo-capture/domain";

test("desktop surface references the v1 export schema contract", () => {
  assert.equal(MEMO_CAPTURE_EXPORT_SCHEMA_VERSION, "memo-capture-export.v1");
});

test("settings page exposes file type and prompt controls without manual import copy", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /Save version/);
  assert.match(appSource, /Project synopsis/);
  assert.match(appSource, /Memo text\/transcript/);
  assert.match(appSource, /toggleFileType/);
  assert.match(appSource, /Add file type/);
  assert.match(appSource, /Needs parser support/);
  assert.match(appSource, /Strong grouping tags/);
  assert.match(appSource, /Related tags/);
  assert.match(appSource, /Weak matches/);
  assert.doesNotMatch(appSource, />\s*Import\s*</);
});
