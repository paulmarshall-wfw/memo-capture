import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MEMO_CAPTURE_EXPORT_SCHEMA_VERSION } from "@memo-capture/domain";

test("desktop surface references the v1 export schema contract", () => {
  assert.equal(MEMO_CAPTURE_EXPORT_SCHEMA_VERSION, "memo-capture-export.v1");
});

test("settings page exposes file type, provider catalog, and task-owned prompt controls", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(appSource, /Save prompt/);
  assert.match(appSource, /Project synopsis/);
  assert.match(appSource, /System message/);
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
  assert.match(appSource, /contributorName: ""/);
  assert.match(appSource, /Contributor name/);
  assert.match(appSource, /contributorText: watchFolder\.contributorName\.trim\(\)/);
  assert.match(appSource, /dense-watch-folder-list/);
  assert.match(appSource, /label="Strong"/);
  assert.match(appSource, /label="Related"/);
  assert.match(appSource, /label="Weak"/);
  assert.match(appSource, /Suggested new work item/);
  assert.doesNotMatch(appSource, /No pending suggested work items/);
  assert.match(appSource, /workItemDetailTasks/);
  assert.match(appSource, /work-item-task-actions/);
  assert.match(appSource, /\/tasks\/\$\{encodeURIComponent\(task\.id\)\}\/run/);
  assert.match(appSource, /AppLauncher runtime options/);
  assert.match(appSource, /Provider Name/);
  assert.match(appSource, /Provider Kind/);
  assert.match(appSource, /Provider Key/);
  assert.match(appSource, /Processing Hooks/);
  assert.match(appSource, /Create Hook/);
  assert.match(appSource, /Default no-op/);
  assert.match(appSource, /Custom function implemented/);
  assert.match(appSource, /\/api\/settings\/processing-hooks/);
  assert.doesNotMatch(appSource, /source: hook/);
  assert.match(appSource, /Task Name/);
  assert.match(appSource, /Task Description/);
  assert.match(appSource, /Render Location/);
  assert.match(appSource, /Work item detail/);
  assert.match(appSource, /Work item list/);
  assert.match(appSource, /Export page/);
  assert.match(appSource, /displayOrder/);
  assert.match(appSource, /Add provider/);
  assert.match(appSource, /\/api\/settings\/providers/);
  assert.doesNotMatch(appSource, /Generated identity/);
  assert.doesNotMatch(appSource, /prompt\.name/);
  assert.doesNotMatch(appSource, /prompt\.purpose/);
  assert.doesNotMatch(appSource, /Key: \{deriveTaskKeyPreview\(newAiTaskDraft\.displayName\)\}/);
  assert.doesNotMatch(appSource, /Key \{task\.taskKey\}/);
  assert.doesNotMatch(appSource, /firstRegisteredTaskHookKey/);
  assert.match(appSource, /newAiTaskDraft\.promptDraft\.freeformText/);
  assert.match(appSource, /newAiTaskDraft\.promptDraft\.systemMessage/);
  assert.match(appSource, /includeProjectSynopsis: newAiTaskDraft\.promptDraft\.includeProjectSynopsis/);
  assert.match(appSource, /Select hook/);
  assert.doesNotMatch(appSource, /list="task-hook-options"/);
  assert.doesNotMatch(appSource, /<datalist id="task-hook-options"/);
  assert.match(appSource, /Add task/);
  assert.match(appSource, /Save task/);
  assert.match(appSource, /Delete task/);
  assert.match(appSource, /deleteAiTaskDefinition/);
  assert.match(appSource, /\/api\/settings\/ai-tasks\/\$\{encodeURIComponent\(task\.id\)\}/);
  assert.doesNotMatch(appSource, /\/api\/settings\/prompts\/\$\{encodeURIComponent\(prompt\.id\)\}\/current/);
  assert.match(appSource, /Model override/);
  assert.match(appSource, /LLM runtime/);
  assert.match(appSource, /task\.prompt/);
  assert.doesNotMatch(appSource, /Task kinds/);
  assert.doesNotMatch(appSource, /Add task kind/);
  assert.doesNotMatch(appSource, /Add kind/);
  assert.doesNotMatch(appSource, />\s*Capabilities\s*</);
  assert.doesNotMatch(appSource, />\s*Capability\s*</);
  assert.doesNotMatch(appSource, />\s*Capability key\s*</);
  assert.doesNotMatch(appSource, /Save route/);
  assert.doesNotMatch(appSource, /label: "AI prompts"/);
  assert.doesNotMatch(appSource, /newAiTaskDraft\.taskKey/);
  assert.doesNotMatch(appSource, /LLM_PROVIDER=local-dev/);
  assert.doesNotMatch(appSource, /Development LLM/);
  assert.doesNotMatch(appSource, /Enable dev expander/);
  assert.match(appSource, /AI suggestion rejected/);
  assert.doesNotMatch(appSource, />\s*Dismiss\s*</);
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

test("AppLauncher manifests expose generic LLM runtime options", () => {
  const webManifest = readFileSync(
    new URL("../../../dist/applauncher-manifests/memo-capture/0.1.0/manifest.json", import.meta.url),
    "utf8"
  );
  const nativeManifest = readFileSync(
    new URL("../../../dist/applauncher-manifests/memo-capture-native/0.1.0/manifest.json", import.meta.url),
    "utf8"
  );
  const combined = `${webManifest}\n${nativeManifest}`;

  assert.match(combined, /"id": "llm-runtime"/);
  assert.match(combined, /"LLM_PROVIDER": "local-dev"/);
  assert.match(combined, /"LLM_PROVIDER": "openai-compatible"/);
  assert.doesNotMatch(combined, /MEMO_EXPANSION_PROVIDER/);
  assert.doesNotMatch(combined, /SUGGEST_TAGS_PROVIDER/);
  assert.doesNotMatch(combined, /OCR_PROVIDER/);
  assert.doesNotMatch(combined, /memo-expansion-provider/);
});

test("watched imports use filesystem creation time before modified time", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /createdAt: string;/);
  assert.match(appSource, /originalFileModifiedAt: normalizeWatchedFileTimestamp\(candidate\.createdAt, candidate\.modifiedAt\)/);
  assert.doesNotMatch(appSource, /parseTimestampPrefixedFilename/);
});
