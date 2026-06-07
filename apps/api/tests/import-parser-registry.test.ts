import assert from "node:assert/strict";
import test from "node:test";
import { resolveWatchedImportParser, type ActiveWatchedFileType } from "../src/services/import-parser-registry.js";

test("watched parser registry resolves implemented text and audio parsers", () => {
  assert.equal(
    resolveWatchedImportParser({
      sourceType: "watched_text_file",
      support: support("text", "markdown", "active")
    }),
    "text"
  );
  assert.equal(
    resolveWatchedImportParser({
      sourceType: "watched_text_file",
      support: support("text", "plain-text", "active")
    }),
    "text"
  );
  assert.equal(
    resolveWatchedImportParser({
      sourceType: "watched_audio_file",
      support: support("audio", "audio-transcription", "active")
    }),
    "audio-transcription"
  );
  assert.equal(
    resolveWatchedImportParser({
      sourceType: "watched_photo_file",
      support: support("image", "photo-preprocess", "active")
    }),
    "photo-preprocess"
  );
});

test("watched parser registry leaves unsupported or mismatched parser choices unimplemented", () => {
  assert.equal(
    resolveWatchedImportParser({
      sourceType: "watched_audio_file",
      support: support("audio", "whisper-cpp", "not_supported_yet")
    }),
    null
  );
  assert.equal(
    resolveWatchedImportParser({
      sourceType: "watched_text_file",
      support: support("audio", "audio-transcription", "active")
    }),
    null
  );
  assert.equal(
    resolveWatchedImportParser({
      sourceType: "watched_audio_file",
      support: { ...support("audio", "audio-transcription", "active"), parserType: null }
    }),
    null
  );
});

function support(mediaKind: string, parserKey: string, parserState: string): ActiveWatchedFileType {
  return {
    fileType: {
      id: `file-type-${mediaKind}`,
      extension: mediaKind === "audio" ? ".m4a" : mediaKind === "image" ? ".jpg" : ".md",
      media_kind: mediaKind,
      capability_state: "active",
      parser_key: parserKey,
      updated_at: "2026-06-01T00:00:00.000Z"
    },
    mediaType: {
      id: `media-${mediaKind}`,
      media_key: mediaKind,
      display_name: mediaKind,
      description: null,
      capability_state: "active",
      updated_at: "2026-06-01T00:00:00.000Z"
    },
    parserType: {
      id: `parser-${parserKey}`,
      parser_key: parserKey,
      display_name: parserKey,
      description: null,
      media_key: mediaKind,
      capability_state: parserState,
      updated_at: "2026-06-01T00:00:00.000Z"
    }
  };
}
