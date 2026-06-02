import { randomUUID } from "node:crypto";
import type { Queryable } from "../db/types.js";
import {
  mapContributor,
  mapProject,
  type ContributorRecord,
  type ContributorRow,
  type ProjectRecord,
  type ProjectRow
} from "./rows.js";
import { normalizeSlug } from "./slugs.js";

export interface ProjectInput {
  name: string;
  slug?: string | null | undefined;
  description?: string | null | undefined;
  actorUserId: string;
}

export interface ProjectPatchInput {
  name?: string | undefined;
  slug?: string | null | undefined;
  description?: string | undefined;
  actorUserId: string;
}

export class ProjectRepository {
  constructor(private readonly db: Queryable) {}

  async list(): Promise<ProjectRecord[]> {
    const result = await this.db.query<ProjectRow>(
      `select *
       from projects
       order by is_active desc, lower(name), created_at desc`
    );
    return result.rows.map(mapProject);
  }

  async create(input: ProjectInput): Promise<ProjectRecord> {
    const result = await this.db.query<ProjectRow>(
      `insert into projects (
         id,
         slug,
         name,
         description,
         created_by,
         updated_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $5, now(), now())
       returning *`,
      [
        randomUUID(),
        normalizeSlug(input.slug ?? input.name),
        input.name.trim(),
        input.description ?? "",
        input.actorUserId
      ]
    );
    return requiredRow(result.rows[0], "project create failed", mapProject);
  }

  async update(projectId: string, input: ProjectPatchInput): Promise<ProjectRecord | null> {
    const nextSlug = input.slug === undefined || input.slug === null ? null : normalizeSlug(input.slug);
    const result = await this.db.query<ProjectRow>(
      `update projects
       set
         name = coalesce($2, name),
         slug = coalesce($3, slug),
         description = coalesce($4, description),
         updated_by = $5,
         updated_at = now()
       where id = $1
       returning *`,
      [
        projectId,
        input.name?.trim() ?? null,
        nextSlug,
        input.description ?? null,
        input.actorUserId
      ]
    );
    return result.rows[0] === undefined ? null : mapProject(result.rows[0]);
  }

  async deactivate(projectId: string, actorUserId: string): Promise<ProjectRecord | null> {
    const result = await this.db.query<ProjectRow>(
      `update projects
       set is_active = false, updated_by = $2, updated_at = now()
       where id = $1
       returning *`,
      [projectId, actorUserId]
    );
    return result.rows[0] === undefined ? null : mapProject(result.rows[0]);
  }

  async delete(projectId: string): Promise<ProjectRecord | null> {
    const result = await this.db.query<ProjectRow>(
      `delete from projects
       where id = $1
       returning *`,
      [projectId]
    );
    return result.rows[0] === undefined ? null : mapProject(result.rows[0]);
  }
}

export interface ContributorInput {
  displayName: string;
  actorUserId: string;
}

export interface WatchedContributorInput {
  contributorText: string | null;
  actorUserId: string;
}

export class ContributorRepository {
  constructor(private readonly db: Queryable) {}

  async list(): Promise<ContributorRecord[]> {
    const result = await this.db.query<ContributorRow>(
      `select *
       from contributors
       order by is_active desc, lower(display_name), created_at desc`
    );
    return result.rows.map(mapContributor);
  }

  async create(input: ContributorInput): Promise<ContributorRecord> {
    const contributorKey = normalizeContributorKey(input.displayName);
    const result = await this.db.query<ContributorRow>(
      `insert into contributors (
         id,
         display_name,
         contributor_key,
         created_by,
         updated_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $4, now(), now())
       returning *`,
      [randomUUID(), input.displayName.trim(), contributorKey, input.actorUserId]
    );
    return requiredRow(result.rows[0], "contributor create failed", mapContributor);
  }

  async update(contributorId: string, input: ContributorInput): Promise<ContributorRecord | null> {
    const contributorKey = normalizeContributorKey(input.displayName);
    const result = await this.db.query<ContributorRow>(
      `update contributors
       set display_name = $2, contributor_key = $3, updated_by = $4, updated_at = now()
       where id = $1
       returning *`,
      [contributorId, input.displayName.trim(), contributorKey, input.actorUserId]
    );
    return result.rows[0] === undefined ? null : mapContributor(result.rows[0]);
  }

  async findOrCreateForWatchedFolder(input: WatchedContributorInput): Promise<ContributorRecord | null> {
    const contributorText = input.contributorText?.trim() ?? "";
    const contributorKey = normalizeContributorKey(contributorText);
    if (contributorKey === null) {
      return null;
    }

    const result = await this.db.query<ContributorRow>(
      `insert into contributors (
         id,
         display_name,
         contributor_key,
         created_by,
         updated_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $4, now(), now())
       on conflict (contributor_key) where contributor_key is not null
       do update set
         updated_by = coalesce(contributors.updated_by, excluded.updated_by),
         updated_at = contributors.updated_at
       returning *`,
      [randomUUID(), contributorText, contributorKey, input.actorUserId]
    );
    return requiredRow(result.rows[0], "contributor upsert failed", mapContributor);
  }

  async addAlias(contributorId: string, alias: string, actorUserId: string): Promise<void> {
    await this.db.query(
      `insert into contributor_aliases (id, contributor_id, alias, created_by, created_at)
       values ($1, $2, $3, $4, now())
       on conflict (contributor_id, alias) do nothing`,
      [randomUUID(), contributorId, alias.trim(), actorUserId]
    );
  }

  async deactivate(contributorId: string, actorUserId: string): Promise<ContributorRecord | null> {
    const result = await this.db.query<ContributorRow>(
      `update contributors
       set is_active = false, updated_by = $2, updated_at = now()
       where id = $1
       returning *`,
      [contributorId, actorUserId]
    );
    return result.rows[0] === undefined ? null : mapContributor(result.rows[0]);
  }
}

export function normalizeContributorKey(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized === "" ? null : normalized;
}

function requiredRow<Row, Result>(
  row: Row | undefined,
  message: string,
  mapper: (row: Row) => Result
): Result {
  if (row === undefined) {
    throw new Error(message);
  }

  return mapper(row);
}
