import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkItemExpansionPrompt, createLlmProvider, type WorkItemExpansionContext } from "../src/services/llm.js";

test("work item expansion prompt starts with freeform text and uses text-only context", () => {
  const context: WorkItemExpansionContext = {
    hookKey: "memo-expansion",
    prompt: {
      name: "work_item_expansion",
      version: 2,
      body: "Lead with this operator guidance.",
      contextConfig: {
        freeformText: "Lead with this operator guidance.",
        systemMessage: "Use strict JSON.",
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
    () =>
      createLlmProvider(
        {
          provider: "disabled",
          modelName: "memo-capture-local-dev-expander-v1",
          endpoint: "",
          openAiCompatibleApiKey: ""
        },
        "local-dev",
        ""
      ),
    /enabled in Settings, but this API runtime is disabled/
  );
});

test("OpenAI-compatible provider sends configured system message", async () => {
  const context: WorkItemExpansionContext = {
    hookKey: "memo-expansion",
    prompt: {
      name: "work_item_expansion",
      version: 2,
      body: "Lead with this operator guidance.",
      contextConfig: {
        freeformText: "Lead with this operator guidance.",
        systemMessage: "Return only reviewed JSON.",
        includeProjectSynopsis: false,
        includeMemoMetadata: false,
        includeMemoTranscriptText: true
      }
    },
    project: {
      id: null,
      name: null,
      description: null
    },
    workItem: {
      id: "work-item-1",
      title: "Voice memo follow-up",
      body: "Existing work item text.",
      tags: [],
      contributorText: null
    },
    sourceMemo: null
  };
  let capturedBody: unknown = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}")) as unknown;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                expanded_work_item: { title: "Expanded", body: "Body", tags: [] },
              })
            }
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const provider = createLlmProvider(
      {
        provider: "openai-compatible",
        modelName: "model-a",
        endpoint: "https://llm.example.test/v1",
        openAiCompatibleApiKey: "test-key"
      },
      "openai-compatible",
      "model-a"
    );

    await provider.generateWorkItemExpansion(context);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual((capturedBody as { messages: unknown[] }).messages, [
    { role: "system", content: "Return only reviewed JSON." },
    { role: "user", content: "Lead with this operator guidance.\n\nMemo text:\nExisting work item text." }
  ]);
});

test("local-dev provider output does not echo prompt focus into memo body", async () => {
  const provider = createLlmProvider(
    {
      provider: "local-dev",
      modelName: "memo-capture-local-dev-expander-v1",
      endpoint: "",
      openAiCompatibleApiKey: ""
    },
    "local-dev",
    "memo-capture-local-dev-expander-v1"
  );
  const output = await provider.generateWorkItemExpansion({
    hookKey: "memo-expansion",
    prompt: {
      name: "work_item_expansion",
      version: 2,
      body: "Lead with this operator guidance.",
      contextConfig: {
        freeformText: "Lead with this operator guidance.",
        systemMessage: "Use strict JSON.",
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
    sourceMemo: null
  });

  assert.doesNotMatch(output.rawText, /Prompt focus:/);
  assert.doesNotMatch(output.rawText, /related_suggestions/);
});

test("local-dev provider returns suggested_work_items for suggestion hook", async () => {
  const provider = createLlmProvider(
    {
      provider: "local-dev",
      modelName: "memo-capture-local-dev-expander-v1",
      endpoint: "",
      openAiCompatibleApiKey: ""
    },
    "local-dev",
    "memo-capture-local-dev-expander-v1"
  );
  const output = await provider.generateWorkItemExpansion({
    hookKey: "suggest-new-memos",
    prompt: {
      name: "work_item_suggestions",
      version: 1,
      body: "Suggest useful follow-up memos.",
      contextConfig: {
        freeformText: "Suggest useful follow-up memos.",
        systemMessage: "Use strict JSON.",
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
    sourceMemo: null
  });

  assert.match(output.rawText, /suggested_work_items/);
  assert.doesNotMatch(output.rawText, /expanded_work_item/);
});
