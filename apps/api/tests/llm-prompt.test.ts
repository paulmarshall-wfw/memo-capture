import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkItemExpansionPrompt, createLlmProvider, type WorkItemExpansionContext } from "../src/services/llm.js";

test("work item expansion prompt starts with freeform text and uses text-only context", () => {
  const context: WorkItemExpansionContext = {
    prompt: {
      name: "work_item_expansion",
      version: 2,
      body: "Lead with this operator guidance.",
      contextConfig: {
        freeformText: "Lead with this operator guidance.",
        includeProjectSynopsis: true,
        includeMemoMetadata: true,
        includeMemoTranscriptText: true
      }
    },
    project: {
      id: "project-1",
      name: "Memo Capture",
      description: "Capture project synopsis."
    },
    workItem: {
      id: "work-item-1",
      title: "Voice memo follow-up",
      body: "Existing work item text.",
      tags: ["capture"],
      contributorText: "Paul"
    },
    sourceMemo: {
      id: "source-memo-1",
      sourceType: "watched_audio_file",
      transcriptText: "Stored transcript text only."
    }
  };

  const prompt = buildWorkItemExpansionPrompt(context);

  assert.equal(prompt.startsWith("Lead with this operator guidance."), true);
  assert.match(prompt, /Project synopsis:\nCapture project synopsis\./);
  assert.match(prompt, /Source type: watched_audio_file/);
  assert.match(prompt, /Stored transcript text only\./);
  assert.doesNotMatch(prompt, /Project context/);
});

test("disabled LLM runtime reports the Settings/runtime mismatch", () => {
  assert.throws(
    () => createLlmProvider({ provider: "disabled", modelName: "memo-capture-local-dev-expander-v1" }, "local-dev", ""),
    /enabled in Settings, but this API runtime is disabled/
  );
});
