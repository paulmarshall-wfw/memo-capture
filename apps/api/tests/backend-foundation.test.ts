import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readApiConfig } from "../src/config.js";
import type { Database, Queryable, QueryParams, QueryResult } from "../src/db/types.js";
import { createLogger } from "../src/logger.js";
import type { AppServices } from "../src/services/app.js";
import { createAppServicesFromDatabase } from "../src/services/app.js";
import { HttpError } from "../src/services/errors.js";
import { createApiServer } from "../src/server.js";

test("local-dev auth creates a fixed development session when explicitly enabled", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_EMAIL: "dev@example.test",
    MEMO_CAPTURE_APP_VERSION: "0.1.0",
    MEMO_CAPTURE_COMMIT_SHA: "test-sha"
  });
  const db = new FakeDatabase();
  const services = createAppServicesFromDatabase(config, db);

  const session = await services.auth.createLocalDevSession();

  assert.equal(session.authMode, "local-dev");
  assert.equal(session.user.email, "dev@example.test");
  assert.equal(session.accessToken, "local-dev:memo-capture-local-dev:local-dev-user");
  assert.equal(db.users.length, 1);
});

test("form memo service creates source memo, work item, import event, and audit rows", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true"
  });
  const db = new FakeDatabase();
  const services = createAppServicesFromDatabase(config, db);
  const session = await services.auth.createLocalDevSession();

  const result = await services.formMemos.createFromRequest(
    {
      projectId: "00000000-0000-4000-8000-000000000301",
      title: "Capture this",
      body: "Useful memo body",
      contributorText: "Paul"
    },
    session.user,
    "request-1"
  );

  assert.equal(db.sourceMemos.length, 1);
  assert.equal(db.workItems.length, 1);
  assert.equal(db.importEvents.length, 1);
  assert.equal(db.auditEvents.length, 2);
  assert.equal(result.workItem.workflowState, "memo");
  assert.equal(result.workItem.title, "Capture this");
});

test("protected routes require authorization and include a request id", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    MEMO_CAPTURE_APP_VERSION: "0.1.0",
    MEMO_CAPTURE_COMMIT_SHA: "test-sha"
  });
  const services = stubServices();
  const server = createApiServer(config, createLogger("error"), services);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/projects`);
    const body = (await response.json()) as { error: { code: string } };

    assert.equal(response.status, 401);
    assert.equal(body.error.code, "unauthorized");
    assert.match(response.headers.get("x-request-id") ?? "", /.+/);
  } finally {
    server.close();
    await services.close();
  }
});

test("basic protected capture routes expose session, catalog, work items, and form memo creation", async () => {
  const config = readApiConfig({
    MEMO_CAPTURE_AUTH_MODE: "local-dev",
    MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED: "true",
    MEMO_CAPTURE_APP_VERSION: "0.1.0",
    MEMO_CAPTURE_COMMIT_SHA: "test-sha"
  });
  const services = captureRouteServices();
  const server = createApiServer(config, createLogger("error"), services);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const session = await authedJson(baseUrl, "/api/current-session");
    assert.equal(session.response.status, 200);
    assert.equal(session.body.user.email, "dev@example.test");

    const featureGroupPatch = await authedJson(baseUrl, "/api/feature-groups/feature-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Capture API", slug: "capture-api" })
    });
    assert.equal(featureGroupPatch.response.status, 200);
    assert.equal(featureGroupPatch.body.featureGroup.slug, "capture-api");

    const featureGroupDeactivate = await authedJson(
      baseUrl,
      "/api/feature-groups/feature-1/deactivate",
      { method: "POST" }
    );
    assert.equal(featureGroupDeactivate.response.status, 200);
    assert.equal(featureGroupDeactivate.body.featureGroup.isActive, false);

    const contributorPatch = await authedJson(baseUrl, "/api/contributors/contributor-1", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Paul Marshall" })
    });
    assert.equal(contributorPatch.response.status, 200);
    assert.equal(contributorPatch.body.contributor.displayName, "Paul Marshall");

    const contributorDeactivate = await authedJson(
      baseUrl,
      "/api/contributors/contributor-1/deactivate",
      { method: "POST" }
    );
    assert.equal(contributorDeactivate.response.status, 200);
    assert.equal(contributorDeactivate.body.contributor.isActive, false);

    const workItemDetail = await authedJson(baseUrl, "/api/work-items/work-item-1");
    assert.equal(workItemDetail.response.status, 200);
    assert.equal(workItemDetail.body.workItem.title, "Captured memo");

    const workflowStatus = await authedJson(baseUrl, "/api/workflow/status");
    assert.equal(workflowStatus.response.status, 200);
    assert.equal(workflowStatus.body.active.workflowVersion, "0.2.2");

    const workflowBuckets = await authedJson(baseUrl, "/api/workflow/buckets");
    assert.equal(workflowBuckets.response.status, 200);
    assert.equal(workflowBuckets.body.buckets[0].id, "memos");

    const workflowActions = await authedJson(baseUrl, "/api/work-items/work-item-1/actions");
    assert.equal(workflowActions.response.status, 200);
    assert.equal(workflowActions.body.actions[0].id, "memo.accepted");

    const workflowAction = await authedJson(baseUrl, "/api/work-items/work-item-1/actions/memo.accepted", {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 1 })
    });
    assert.equal(workflowAction.response.status, 200);
    assert.equal(workflowAction.body.newState, "accepted");

    const missingWorkItem = await authedJson(baseUrl, "/api/work-items/missing");
    assert.equal(missingWorkItem.response.status, 404);
    assert.equal(missingWorkItem.body.error.code, "not_found");

    const formMemo = await authedJson(baseUrl, "/api/source-memos/form", {
      method: "POST",
      body: JSON.stringify({
        projectId: "project-1",
        title: "Capture this",
        body: "Useful memo body"
      })
    });
    assert.equal(formMemo.response.status, 200);
    assert.equal(formMemo.body.result.sourceMemoId, "source-memo-1");
    assert.equal(formMemo.body.result.workItem.workflowState, "memo");
  } finally {
    server.close();
    await services.close();
  }
});

function stubServices(): AppServices {
  return {
    auth: {
      authenticateAuthorizationHeader: async () => {
        throw new HttpError(401, "unauthorized", "Missing bearer token.");
      },
      createLocalDevSession: async () => {
        throw new Error("not used");
      }
    } as AppServices["auth"],
    catalog: {
      listProjects: async () => []
    } as AppServices["catalog"],
    formMemos: {} as AppServices["formMemos"],
    workflows: {
      getStatus: async () => ({ active: null, supportedHookHandlers: [] }),
      getBuckets: async () => ({ buckets: [] }),
      getAllowedActions: async () => ({ workItemId: "missing", workflowState: "memo", actions: [] }),
      importBundle: async () => {
        throw new Error("not used");
      },
      activateStagedImport: async () => {
        throw new Error("not used");
      },
      executeAction: async () => {
        throw new Error("not used");
      }
    } as AppServices["workflows"],
    workItems: {
      list: async () => [],
      findById: async () => null
    } as AppServices["workItems"],
    close: async () => undefined
  };
}

function captureRouteServices(): AppServices {
  const user = {
    id: "user-1",
    oidcIssuer: "memo-capture-local-dev",
    oidcSubject: "local-dev-user",
    email: "dev@example.test",
    displayName: "Dev User",
    firstSeenAt: "2026-05-29T00:00:00.000Z",
    lastSeenAt: "2026-05-29T00:00:00.000Z",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  const project = {
    id: "project-1",
    slug: "memo-capture",
    name: "Memo Capture",
    description: "",
    context: "",
    isActive: true,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  const featureGroup = {
    id: "feature-1",
    slug: "capture-api",
    name: "Capture API",
    description: "",
    isActive: true,
    mergedIntoFeatureGroupId: null,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  const contributor = {
    id: "contributor-1",
    displayName: "Paul Marshall",
    isActive: true,
    mergedIntoContributorId: null,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };
  const workItem = {
    id: "work-item-1",
    sourceMemoId: "source-memo-1",
    projectId: "project-1",
    featureGroupId: "feature-1",
    contributorText: "Paul",
    contributorId: "contributor-1",
    title: "Captured memo",
    body: "Useful memo body",
    bodyFormat: "markdown",
    workflowState: "memo",
    workflowItemVersion: 1,
    acceptedSnapshotId: null,
    acceptedUnexportedChanges: false,
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };

  return {
    auth: {
      authenticateAuthorizationHeader: async (header: string | undefined) => {
        if (header !== "Bearer test-token") {
          throw new HttpError(401, "unauthorized", "Missing bearer token.");
        }

        return {
          user,
          authMode: "local-dev",
          isAdmin: true
        };
      },
      createLocalDevSession: async () => ({
        user,
        authMode: "local-dev",
        isAdmin: true,
        accessToken: "test-token"
      })
    } as AppServices["auth"],
    catalog: {
      listProjects: async () => [project],
      createProject: async () => project,
      updateProject: async () => project,
      deactivateProject: async () => ({ ...project, isActive: false }),
      listFeatureGroups: async () => [featureGroup],
      createFeatureGroup: async () => featureGroup,
      updateFeatureGroup: async () => featureGroup,
      deactivateFeatureGroup: async () => ({ ...featureGroup, isActive: false }),
      listContributors: async () => [contributor],
      createContributor: async () => contributor,
      updateContributor: async () => contributor,
      deactivateContributor: async () => ({ ...contributor, isActive: false })
    } as AppServices["catalog"],
    formMemos: {
      createFromRequest: async () => ({
        sourceMemoId: "source-memo-1",
        workItem
      })
    } as AppServices["formMemos"],
    workflows: {
      getStatus: async () => ({
        active: {
          workflowId: "memo-capture_workflow",
          workflowVersion: "0.2.2",
          stateMachineVersion: "0.2.2",
          contentHash: "sha256:test",
          activatedAt: "2026-05-29T00:00:00.000Z"
        },
        supportedHookHandlers: ["create_accepted_snapshot"]
      }),
      getBuckets: async () => ({
        buckets: [{ id: "memos", label: "Memos", order: 20, states: ["memo"] }]
      }),
      getAllowedActions: async (workItemId: string) => ({
        workItemId,
        workflowState: "memo",
        actions: [
          {
            id: "memo.accepted",
            label: "Accept",
            visible: true,
            trigger: "user",
            requiresInput: false,
            confirmationRequired: false
          }
        ]
      }),
      executeAction: async (workItemId: string, actionId: string) => ({
        workItemId,
        actionId,
        previousState: "memo",
        newState: "accepted",
        newVersion: 2,
        createdSnapshotId: "snapshot-1",
        allowedActions: []
      }),
      importBundle: async () => ({
        stagedImportId: "workflow-import-1",
        status: "staged",
        validation: { ok: true, warnings: [], errors: [], identity: null },
        identity: null
      }),
      activateStagedImport: async () => ({
        activated: true,
        activeWorkflowVersion: "0.2.2",
        contentHash: "sha256:test"
      })
    } as AppServices["workflows"],
    workItems: {
      list: async () => [workItem],
      findById: async (workItemId: string) => (workItemId === workItem.id ? workItem : null)
    } as AppServices["workItems"],
    close: async () => undefined
  };
}

async function authedJson(
  baseUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<{ response: Response; body: Record<string, any> }> {
  const headers = new Headers(init.headers);
  headers.set("authorization", "Bearer test-token");
  headers.set("content-type", "application/json");

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  });

  return {
    response,
    body: (await response.json()) as Record<string, any>
  };
}

class FakeDatabase implements Database {
  readonly users: FakeUserRow[] = [];
  readonly sourceMemos: Record<string, unknown>[] = [];
  readonly workItems: Record<string, unknown>[] = [];
  readonly importEvents: Record<string, unknown>[] = [];
  readonly auditEvents: Record<string, unknown>[] = [];

  async transaction<Result>(operation: (client: Queryable) => Promise<Result>): Promise<Result> {
    return operation(this);
  }

  async close(): Promise<void> {
    return undefined;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: QueryParams = []
  ): Promise<QueryResult<Row>> {
    if (text.includes("insert into app_users")) {
      const existing = this.users.find(
        (user) => user.oidc_issuer === values[1] && user.oidc_subject === values[2]
      );
      const user =
        existing ??
        ({
          id: String(values[0]),
          oidc_issuer: String(values[1]),
          oidc_subject: String(values[2]),
          email: values[3] === null ? null : String(values[3]),
          display_name: values[4] === null ? null : String(values[4]),
          first_seen_at: "2026-05-29T00:00:00.000Z",
          last_seen_at: "2026-05-29T00:00:00.000Z",
          created_at: "2026-05-29T00:00:00.000Z",
          updated_at: "2026-05-29T00:00:00.000Z"
        } satisfies FakeUserRow);

      if (existing === undefined) {
        this.users.push(user);
      }

      return rows([user] as Row[]);
    }

    if (text.includes("insert into source_memos")) {
      this.sourceMemos.push({ id: values[0], source_type: values[1] });
      return rows([]);
    }

    if (text.includes("insert into work_items")) {
      const row = {
        id: values[0],
        source_memo_id: values[1],
        project_id: values[2],
        feature_group_id: values[3],
        contributor_text: values[4],
        contributor_id: values[5],
        title: values[6],
        body: values[7],
        body_format: values[8],
        workflow_state: values[9],
        workflow_item_version: 1,
        accepted_snapshot_id: null,
        accepted_unexported_changes: false,
        created_at: "2026-05-29T00:00:00.000Z",
        updated_at: "2026-05-29T00:00:00.000Z"
      };
      this.workItems.push(row);
      return rows([row] as Row[]);
    }

    if (text.includes("insert into import_events")) {
      this.importEvents.push({ id: values[0], source_memo_id: values[1], status: values[9] });
      return rows([]);
    }

    if (text.includes("insert into audit_events")) {
      this.auditEvents.push({ id: values[0], event_name: values[1] });
      return rows([]);
    }

    return rows([]);
  }
}

interface FakeUserRow extends Record<string, unknown> {
  id: string;
  oidc_issuer: string;
  oidc_subject: string;
  email: string | null;
  display_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

function rows<Row extends Record<string, unknown>>(resultRows: Row[]): QueryResult<Row> {
  return {
    rows: resultRows,
    rowCount: resultRows.length
  };
}
