import type { Database } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import { ContributorRepository, ProjectRepository } from "../repositories/catalog.js";
import type {
  ContributorRecord,
  ProjectRecord,
  AppUserRecord
} from "../repositories/rows.js";
import { assertNonEmptyString, HttpError, optionalString } from "./errors.js";

export class CatalogService {
  constructor(private readonly db: Database) {}

  async listProjects(): Promise<ProjectRecord[]> {
    return new ProjectRepository(this.db).list();
  }

  async createProject(body: unknown, actor: AppUserRecord, requestId: string): Promise<ProjectRecord> {
    const input = parseProjectCreateBody(body);
    return this.db.transaction(async (client) => {
      const projects = new ProjectRepository(client);
      const audit = new AuditRepository(client);
      const project = await projects.create({ ...input, actorUserId: actor.id });
      await audit.record({
        eventName: "project.created",
        actor,
        subjectType: "project",
        subjectId: project.id,
        requestId,
        metadata: { slug: project.slug }
      });
      return project;
    });
  }

  async updateProject(
    projectId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<ProjectRecord | null> {
    const input = parseProjectPatchBody(body);
    return this.db.transaction(async (client) => {
      const projects = new ProjectRepository(client);
      const audit = new AuditRepository(client);
      const project = await projects.update(projectId, { ...input, actorUserId: actor.id });
      if (project !== null) {
        await audit.record({
          eventName: "project.updated",
          actor,
          subjectType: "project",
          subjectId: project.id,
          requestId,
          metadata: { slug: project.slug }
        });
      }
      return project;
    });
  }

  async deactivateProject(
    projectId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<ProjectRecord | null> {
    return this.db.transaction(async (client) => {
      const projects = new ProjectRepository(client);
      const audit = new AuditRepository(client);
      const project = await projects.deactivate(projectId, actor.id);
      if (project !== null) {
        await audit.record({
          eventName: "project.deactivated",
          actor,
          subjectType: "project",
          subjectId: project.id,
          requestId
        });
      }
      return project;
    });
  }

  async deleteProject(
    projectId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<ProjectRecord | null> {
    return this.db.transaction(async (client) => {
      const projects = new ProjectRepository(client);
      const audit = new AuditRepository(client);
      let project: ProjectRecord | null = null;
      try {
        project = await projects.delete(projectId);
      } catch (error) {
        if (isForeignKeyViolation(error)) {
          throw new HttpError(
            409,
            "project_in_use",
            "Project is still used by memos or snapshots. Deactivate it instead, or move those records first."
          );
        }
        throw error;
      }
      if (project !== null) {
        await audit.record({
          eventName: "project.deleted",
          actor,
          subjectType: "project",
          subjectId: project.id,
          requestId,
          metadata: { slug: project.slug, name: project.name }
        });
      }
      return project;
    });
  }

  async listContributors(): Promise<ContributorRecord[]> {
    return new ContributorRepository(this.db).list();
  }

  async createContributor(
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<ContributorRecord> {
    const input = parseContributorBody(body);
    return this.db.transaction(async (client) => {
      const contributors = new ContributorRepository(client);
      const audit = new AuditRepository(client);
      const contributor = await contributors.create({ ...input, actorUserId: actor.id });
      await audit.record({
        eventName: "contributor.created",
        actor,
        subjectType: "contributor",
        subjectId: contributor.id,
        requestId
      });
      return contributor;
    });
  }

  async updateContributor(
    contributorId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<ContributorRecord | null> {
    const input = parseContributorBody(body);
    return this.db.transaction(async (client) => {
      const contributors = new ContributorRepository(client);
      const audit = new AuditRepository(client);
      const contributor = await contributors.update(contributorId, {
        ...input,
        actorUserId: actor.id
      });
      if (contributor !== null) {
        await audit.record({
          eventName: "contributor.updated",
          actor,
          subjectType: "contributor",
          subjectId: contributor.id,
          requestId
        });
      }
      return contributor;
    });
  }

  async deactivateContributor(
    contributorId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<ContributorRecord | null> {
    return this.db.transaction(async (client) => {
      const contributors = new ContributorRepository(client);
      const audit = new AuditRepository(client);
      const contributor = await contributors.deactivate(contributorId, actor.id);
      if (contributor !== null) {
        await audit.record({
          eventName: "contributor.deactivated",
          actor,
          subjectType: "contributor",
          subjectId: contributor.id,
          requestId
        });
      }
      return contributor;
    });
  }
}

function parseProjectCreateBody(body: unknown) {
  const record = parseObject(body);
  return {
    name: assertNonEmptyString(record.name, "name"),
    slug: optionalString(record.slug, "slug"),
    description: optionalString(record.description, "description") ?? ""
  };
}

function parseProjectPatchBody(body: unknown) {
  const record = parseObject(body);
  return {
    name: record.name === undefined ? undefined : assertNonEmptyString(record.name, "name"),
    slug: record.slug === undefined ? undefined : optionalString(record.slug, "slug"),
    description:
      record.description === undefined ? undefined : optionalString(record.description, "description") ?? ""
  };
}

function parseContributorBody(body: unknown) {
  const record = parseObject(body);
  return {
    displayName: assertNonEmptyString(record.displayName, "displayName")
  };
}

function parseObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Request body must be an object.");
  }

  return body as Record<string, unknown>;
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23503";
}
