import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readApiConfig } from "../src/config.js";
import { createTranscriptionProvider, TranscriptionJobError } from "../src/services/transcription.js";

test("whisper.cpp CLI provider returns transcript output from a configured binary", async () => {
  const fixture = await createWhisperFixture("Hello from whisper cpp");
  const provider = createTranscriptionProvider(
    readApiConfig({
      TRANSCRIPTION_PROVIDER: "whisper-cpp",
      TRANSCRIPTION_MODEL: "base.en",
      WHISPER_CPP_BINARY: fixture.whisperPath,
      WHISPER_CPP_MODEL_PATH: fixture.modelPath,
      WHISPER_CPP_FFMPEG_BINARY: fixture.ffmpegPath,
      WHISPER_CPP_TIMEOUT_MS: "10000"
    })
  );

  const result = await provider.transcribe({
    audio: Buffer.from("audio-bytes"),
    mimeType: "audio/mp4",
    filename: "memo.m4a"
  });

  assert.equal(result.text.trim(), "Hello from whisper cpp");
  assert.equal(provider.providerName, "whisper-cpp");
});

test("whisper.cpp CLI provider reports missing model as non-retryable configuration error", async () => {
  const provider = createTranscriptionProvider(
    readApiConfig({
      TRANSCRIPTION_PROVIDER: "whisper-cpp",
      TRANSCRIPTION_MODEL: "base.en",
      WHISPER_CPP_BINARY: "/missing/whisper-cli",
      WHISPER_CPP_MODEL_PATH: ""
    })
  );

  await assert.rejects(
    () =>
      provider.transcribe({
        audio: Buffer.from("audio-bytes"),
        mimeType: "audio/mp4",
        filename: "memo.m4a"
      }),
    (error: unknown) =>
      error instanceof TranscriptionJobError &&
      error.code === "whisper_cpp_model_not_configured" &&
      error.retryable === false
  );
});

test("whisper.cpp CLI provider treats process timeout as retryable", async () => {
  const fixture = await createWhisperFixture("unused", { hangWhisper: true });
  const provider = createTranscriptionProvider(
    readApiConfig({
      TRANSCRIPTION_PROVIDER: "whisper-cpp",
      TRANSCRIPTION_MODEL: "base.en",
      WHISPER_CPP_BINARY: fixture.whisperPath,
      WHISPER_CPP_MODEL_PATH: fixture.modelPath,
      WHISPER_CPP_FFMPEG_BINARY: fixture.ffmpegPath,
      WHISPER_CPP_TIMEOUT_MS: "50"
    })
  );

  await assert.rejects(
    () =>
      provider.transcribe({
        audio: Buffer.from("audio-bytes"),
        mimeType: "audio/mp4",
        filename: "memo.m4a"
      }),
    (error: unknown) =>
      error instanceof TranscriptionJobError &&
      error.code === "whisper_cpp_timeout" &&
      error.retryable === true
  );
});

test("whisper.cpp CLI provider rejects empty transcript output", async () => {
  const fixture = await createWhisperFixture("");
  const provider = createTranscriptionProvider(
    readApiConfig({
      TRANSCRIPTION_PROVIDER: "whisper-cpp",
      TRANSCRIPTION_MODEL: "base.en",
      WHISPER_CPP_BINARY: fixture.whisperPath,
      WHISPER_CPP_MODEL_PATH: fixture.modelPath,
      WHISPER_CPP_FFMPEG_BINARY: fixture.ffmpegPath,
      WHISPER_CPP_TIMEOUT_MS: "10000"
    })
  );

  await assert.rejects(
    () =>
      provider.transcribe({
        audio: Buffer.from("audio-bytes"),
        mimeType: "audio/mp4",
        filename: "memo.m4a"
      }),
    (error: unknown) =>
      error instanceof TranscriptionJobError &&
      error.code === "empty_transcript" &&
      error.retryable === true
  );
});

async function createWhisperFixture(
  transcript: string,
  options: { hangWhisper?: boolean } = {}
): Promise<{ ffmpegPath: string; whisperPath: string; modelPath: string }> {
  const root = path.join(tmpdir(), `memo-capture-transcription-test-${process.pid}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  const ffmpegPath = path.join(root, "ffmpeg.mjs");
  const whisperPath = path.join(root, "whisper-cli.mjs");
  const modelPath = path.join(root, "ggml-base.en.bin");
  await writeFile(modelPath, "model");
  await writeFile(
    ffmpegPath,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(process.argv.at(-1), "wav");
`,
    { mode: 0o755 }
  );
  await writeFile(
    whisperPath,
    `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
const outputBase = process.argv[process.argv.indexOf("-of") + 1];
${options.hangWhisper === true ? "setTimeout(() => {}, 100000);" : `writeFileSync(outputBase + ".txt", ${JSON.stringify(transcript)});`}
`,
    { mode: 0o755 }
  );
  return { ffmpegPath, whisperPath, modelPath };
}

