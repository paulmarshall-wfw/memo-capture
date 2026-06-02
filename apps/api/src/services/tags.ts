import type { Database } from "../db/types.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { TagRepository, normalizeTagDisplayName, normalizeTagName, type SuppressedTagRecord } from "../repositories/tags.js";
import { HttpError } from "./errors.js";

export interface SuppressedTagsResponse {
  suppressedTags: SuppressedTagRecord[];
}

export class TagService {
  constructor(private readonly db: Database) {}

  async listSuppressed(): Promise<SuppressedTagsResponse> {
    return { suppressedTags: await new TagRepository(this.db).listSuppressed() };
  }

  async suppress(body: unknown, actor: AppUserRecord): Promise<{ suppressedTag: SuppressedTagRecord }> {
    const input = parseSuppressBody(body);
    const suppressedTag = await new TagRepository(this.db).suppress({
      name: input.name,
      actorUserId: actor.id
    });
    return { suppressedTag };
  }

  async unsuppress(normalizedName: string): Promise<{ suppressedTag: SuppressedTagRecord | null }> {
    return {
      suppressedTag: await new TagRepository(this.db).unsuppress(normalizedName)
    };
  }
}

function parseSuppressBody(body: unknown): { name: string; sourceWorkItemId: string | null } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Request body must be an object.");
  }

  const record = body as Record<string, unknown>;
  if (typeof record.name !== "string") {
    throw new HttpError(400, "invalid_request", "name must be a string.");
  }
  const name = normalizeTagDisplayName(record.name);
  if (name === "" || normalizeTagName(name) === "") {
    throw new HttpError(400, "invalid_request", "name must not be empty.");
  }

  const sourceWorkItemId = record.sourceWorkItemId;
  if (sourceWorkItemId !== undefined && sourceWorkItemId !== null && typeof sourceWorkItemId !== "string") {
    throw new HttpError(400, "invalid_request", "sourceWorkItemId must be a string when provided.");
  }

  return {
    name,
    sourceWorkItemId: typeof sourceWorkItemId === "string" ? sourceWorkItemId : null
  };
}
