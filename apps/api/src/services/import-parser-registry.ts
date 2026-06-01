import type { SourceMemoType } from "@memo-capture/domain";
import type {
  FileTypeSettingRow,
  MediaTypeSettingRow,
  ParserTypeSettingRow
} from "../repositories/settings.js";

export type WatchedImportParserHandler = "text" | "audio-transcription";

export interface ActiveWatchedFileType {
  fileType: FileTypeSettingRow;
  mediaType: MediaTypeSettingRow;
  parserType: ParserTypeSettingRow | null;
}

interface ParserRegistration {
  mediaKind: string;
  parserKey: string;
  sourceType: SourceMemoType;
  handler: WatchedImportParserHandler;
}

const implementedWatchedParsers: readonly ParserRegistration[] = [
  {
    mediaKind: "text",
    parserKey: "plain-text",
    sourceType: "watched_text_file",
    handler: "text"
  },
  {
    mediaKind: "text",
    parserKey: "markdown",
    sourceType: "watched_text_file",
    handler: "text"
  },
  {
    mediaKind: "audio",
    parserKey: "audio-transcription",
    sourceType: "watched_audio_file",
    handler: "audio-transcription"
  }
];

export function resolveWatchedImportParser(input: {
  support: ActiveWatchedFileType;
  sourceType: SourceMemoType;
}): WatchedImportParserHandler | null {
  const parserType = input.support.parserType;
  if (parserType === null || parserType.capability_state !== "active") {
    return null;
  }

  return (
    implementedWatchedParsers.find(
      (registration) =>
        registration.mediaKind === input.support.fileType.media_kind &&
        registration.parserKey === parserType.parser_key &&
        registration.sourceType === input.sourceType
    )?.handler ?? null
  );
}

