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
  assert.match(appSource, /Operations/);
  assert.match(appSource, /Workflow bundle import/);
  assert.match(appSource, /Validate and stage/);
  assert.match(appSource, /Activate workflow/);
  assert.match(appSource, /rollback requires re-import/i);
  assert.match(appSource, /I understand activation replaces the active workflow bundle/);
  assert.match(appSource, /\/api\/workflow\/status/);
  assert.match(appSource, /\/api\/workflow\/imports/);
  assert.match(appSource, /\/api\/workflow\/buckets/);
  assert.match(appSource, /Active watching every/);
  assert.match(appSource, /watchedFolderPollingIntervalMs/);
  assert.match(appSource, /label="Strong"/);
  assert.match(appSource, /label="Related"/);
  assert.match(appSource, /label="Weak"/);
  assert.match(appSource, /Suppressed Tags/);
  assert.match(appSource, /Suppress \$\{tag\} suggestions/);
  assert.match(appSource, /Restore \$\{tag\.displayName\} suggestions/);
  assert.match(appSource, /\/api\/tags\/suppressed/);
  assert.match(appSource, /projectDeleteConfirmId/);
  assert.doesNotMatch(appSource, /Delete \$\{projectName\}/);
  assert.doesNotMatch(appSource, />\s*Import\s*</);
  assert.doesNotMatch(appSource, />\s*Do not use\s*</i);
  assert.doesNotMatch(appSource, /manual per-file import/i);
});

test("watched imports use filesystem creation time before modified time", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /createdAt: string;/);
  assert.match(appSource, /originalFileModifiedAt: normalizeWatchedFileTimestamp\(candidate\.createdAt, candidate\.modifiedAt\)/);
  assert.doesNotMatch(appSource, /parseTimestampPrefixedFilename/);
});
