export interface AppUserRow extends Record<string, unknown> {
  id: string;
  oidc_issuer: string;
  oidc_subject: string;
  email: string | null;
  display_name: string | null;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AppUserRecord {
  id: string;
  oidcIssuer: string;
  oidcSubject: string;
  email: string | null;
  displayName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  description: string;
  context: string;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ProjectRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  context: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContributorRow extends Record<string, unknown> {
  id: string;
  display_name: string;
  is_active: boolean;
  merged_into_contributor_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ContributorRecord {
  id: string;
  displayName: string;
  isActive: boolean;
  mergedIntoContributorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemRow extends Record<string, unknown> {
  id: string;
  source_memo_id: string;
  project_id: string | null;
  contributor_text: string | null;
  contributor_id: string | null;
  title: string;
  body: string;
  tags: string[] | null;
  body_format: string;
  workflow_state: string;
  workflow_item_version: number;
  accepted_snapshot_id: string | null;
  accepted_unexported_changes: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

export function mapUser(row: AppUserRow): AppUserRecord {
  return {
    id: row.id,
    oidcIssuer: row.oidc_issuer,
    oidcSubject: row.oidc_subject,
    email: row.email,
    displayName: row.display_name,
    firstSeenAt: toIso(row.first_seen_at),
    lastSeenAt: toIso(row.last_seen_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export function mapProject(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    context: row.context,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export function mapContributor(row: ContributorRow): ContributorRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    isActive: row.is_active,
    mergedIntoContributorId: row.merged_into_contributor_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export function mapWorkItem(row: WorkItemRow) {
  return {
    id: row.id,
    sourceMemoId: row.source_memo_id,
    projectId: row.project_id,
    contributorText: row.contributor_text,
    contributorId: row.contributor_id,
    title: row.title,
    body: row.body,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    bodyFormat: row.body_format,
    workflowState: row.workflow_state,
    workflowItemVersion: row.workflow_item_version,
    acceptedSnapshotId: row.accepted_snapshot_id,
    acceptedUnexportedChanges: row.accepted_unexported_changes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
