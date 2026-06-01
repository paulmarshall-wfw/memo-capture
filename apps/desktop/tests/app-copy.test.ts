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
  assert.match(appSource, /Media types/);
  assert.match(appSource, /Parser types/);
  assert.match(appSource, /Whisper\.cpp/);
  assert.match(appSource, /Remove parser type/);
  assert.match(appSource, /Add file type/);
  assert.match(appSource, /Remove file type/);
  assert.match(appSource, /Needs parser support/);
  assert.match(appSource, /Active watching every/);
  assert.match(appSource, /watchedFolderPollingIntervalMs/);
  assert.match(appSource, /label="Strong"/);
  assert.match(appSource, /label="Related"/);
  assert.match(appSource, /label="Weak"/);
  assert.doesNotMatch(appSource, />\s*Import\s*</);
});

test("watched imports use filesystem creation time before modified time", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /createdAt: string;/);
  assert.match(appSource, /originalFileModifiedAt: normalizeWatchedFileTimestamp\(candidate\.createdAt, candidate\.modifiedAt\)/);
  assert.doesNotMatch(appSource, /parseTimestampPrefixedFilename/);
});
