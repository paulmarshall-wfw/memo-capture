import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ApiConfig } from "../src/config.js";
import type { AiTaskRouteRow } from "../src/repositories/settings.js";
import { modelNameForTaskRoute } from "../src/services/ai-expansion.js";
import {
  buildWorkItemExpansionPrompt,
  createLlmProvider,
  summarizeCodexCliFailure,
  type WorkItemExpansionContext
} from "../src/services/llm.js";

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

test("Codex CLI task route does not inherit Memo Capture internal model defaults", () => {
  const previousModel = process.env.CODEX_CLI_MODEL;
  delete process.env.CODEX_CLI_MODEL;

  try {
    const modelName = modelNameForTaskRoute(
      {
        provider_name: "codex-cli",
        provider_model_override: null,
        route_model_name: "memo-capture-local-dev-expander-v1",
        provider_model_name: "memo-capture-local-dev-expander-v1",
        default_model_name: "memo-capture-local-dev-expander-v1"
      } as AiTaskRouteRow,
      {
        llm: {
          provider: "local-dev",
          modelName: "memo-capture-local-dev-expander-v1",
          endpoint: "",
          openAiCompatibleApiKey: ""
        }
      } as ApiConfig
    );

    assert.equal(modelName, "");
  } finally {
    restoreEnvValue("CODEX_CLI_MODEL", previousModel);
  }
});

test("Codex CLI provider omits --model when no explicit Codex model is configured", async () => {
  const previousBinary = process.env.INVOKE_PROVIDERS_CODEX_CLI_BINARY;
  const previousModel = process.env.CODEX_CLI_MODEL;
  const previousProfile = process.env.CODEX_CLI_PROFILE;
  const previousExtraArgs = process.env.CODEX_CLI_EXTRA_ARGS;
  const tempDir = mkdtempSync(join(tmpdir(), "memo-capture-codex-cli-test-"));
  const argsPath = join(tempDir, "args.json");
  const binaryPath = join(tempDir, "fake-codex.js");
  writeFileSync(
    binaryPath,
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      'fs.writeFileSync(process.env.MEMO_CAPTURE_CODEX_ARGS_PATH, JSON.stringify(process.argv.slice(2)));',
      'process.stdin.setEncoding("utf8");',
      'process.stdin.on("data", () => {});',
      'process.stdin.on("end", () => {',
      '  console.log(JSON.stringify({ expanded_work_item: { title: "Expanded", body: "Body", tags: [] } }));',
      "});"
    ].join("\n")
  );
  chmodSync(binaryPath, 0o755);
  process.env.INVOKE_PROVIDERS_CODEX_CLI_BINARY = binaryPath;
  process.env.MEMO_CAPTURE_CODEX_ARGS_PATH = argsPath;
  delete process.env.CODEX_CLI_MODEL;
  delete process.env.CODEX_CLI_PROFILE;
  delete process.env.CODEX_CLI_EXTRA_ARGS;

  try {
    const provider = createLlmProvider(
      {
        provider: "disabled",
        modelName: "memo-capture-local-dev-expander-v1",
        endpoint: "",
        openAiCompatibleApiKey: ""
      },
      "codex-cli",
      ""
    );

    await provider.generateWorkItemExpansion(baseExpansionContext());

    const args = JSON.parse(readFileSync(argsPath, "utf8")) as string[];
    assert.equal(args.includes("--model"), false);
  } finally {
    restoreEnvValue("INVOKE_PROVIDERS_CODEX_CLI_BINARY", previousBinary);
    restoreEnvValue("CODEX_CLI_MODEL", previousModel);
    restoreEnvValue("CODEX_CLI_PROFILE", previousProfile);
    restoreEnvValue("CODEX_CLI_EXTRA_ARGS", previousExtraArgs);
    delete process.env.MEMO_CAPTURE_CODEX_ARGS_PATH;
  }
});

test("Codex CLI failure summaries prefer structured error messages", () => {
  const summary = summarizeCodexCliFailure(
    [
      "WARN codex_models_manager::model_info: Unknown model memo-capture-local-dev-expander-v1 is used.",
      'ERROR: {"type":"error","error":{"message":"The memo-capture-local-dev-expander-v1 model is not supported when using Codex with a ChatGPT account."}}',
      "WARN codex_core::skills::loader: ignoring interface.icon_large"
    ].join("\n"),
    ""
  );

  assert.match(summary, /memo-capture-local-dev-expander-v1 model is not supported/);
  assert.match(summary, /Check the task model override or CODEX_CLI_MODEL\./);
  assert.equal(summary.includes("skills::loader"), false);
  assert.equal(summary.length < 700, true);
});

test("OpenAI-compatible provider sends configured system message and JSON schema response format", async () => {
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
  assert.deepEqual((capturedBody as { response_format: unknown }).response_format, {
    type: "json_schema",
    json_schema: {
      name: "memo_capture_expanded_work_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["expanded_work_item"],
        properties: {
          expanded_work_item: {
            type: "object",
            additionalProperties: false,
            required: ["title", "body", "tags"],
            properties: {
              title: { type: "string" },
              body: { type: "string" },
              tags: {
                type: "array",
                items: { type: "string" }
              }
            }
          }
        }
      }
    }
  });
});

test("OpenAI-compatible provider sends suggested-work-items JSON schema for suggestion tasks", async () => {
  const context: WorkItemExpansionContext = {
    hookKey: "suggest-new-memos",
    prompt: {
      name: "suggest_new_memos",
      version: 1,
      body: "Suggest follow-up memos.",
      contextConfig: {
        freeformText: "Suggest follow-up memos.",
        systemMessage: "Return only suggestion JSON.",
        includeProjectSynopsis: false,
        includeMemoMetadata: true,
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
                suggested_work_items: [
                  { title: "Follow-up", body: "Body", tags: [], rationale: "Useful next memo." }
                ],
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

  assert.deepEqual((capturedBody as { response_format: unknown }).response_format, {
    type: "json_schema",
    json_schema: {
      name: "memo_capture_suggested_work_items",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["suggested_work_items"],
        properties: {
          suggested_work_items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "body", "tags", "rationale"],
              properties: {
                title: { type: "string" },
                body: { type: "string" },
                tags: {
                  type: "array",
                  items: { type: "string" }
                },
                rationale: { type: "string" }
              }
            }
          }
        }
      }
    }
  });
});

test("OpenAI-compatible local provider uses a dummy key for localhost suggestion tasks", async () => {
  const context: WorkItemExpansionContext = {
    hookKey: "suggest-new-memos",
    prompt: {
      name: "suggest_new_memos",
      version: 1,
      body: "Suggest follow-up memos.",
      contextConfig: {
        freeformText: "Suggest follow-up memos.",
        systemMessage: "Return only suggestion JSON.",
        includeProjectSynopsis: false,
        includeMemoMetadata: true,
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
  let authorizationHeader: string | null = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    authorizationHeader = new Headers(init?.headers).get("authorization");
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggested_work_items: [
                  { title: "Follow-up", body: "Body", tags: [], rationale: "Useful next memo." }
                ]
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
        modelName: "local-model",
        endpoint: "http://127.0.0.1:1234/v1",
        openAiCompatibleApiKey: ""
      },
      "openai-compatible",
      "local-model"
    );

    await provider.generateWorkItemExpansion(context);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(authorizationHeader, "Bearer local-openai-compatible");
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

function baseExpansionContext(): WorkItemExpansionContext {
  return {
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
  };
}

function restoreEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
