import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowDebuggerService } from "../src/services/workflow-debugger.js";
import { WorkflowRuntimeAdapter } from "../src/services/workflow-runtime.js";

test("workflow runtime validates bundled contract, buckets, and allowed actions", () => {
  const adapter = new WorkflowRuntimeAdapter();
  const bundle = createBundle();

  const validation = adapter.validateBundle(bundle);

  assert.equal(validation.ok, true);
  assert.equal(validation.identity?.workflowId, "memo-capture_workflow");
  assert.equal(validation.identity?.workflowVersion, "0.2.2");
  assert.equal(validation.identity?.stateMachineVersion, "0.2.2");
  assert.match(validation.identity?.contentHash ?? "", /^sha256:[a-f0-9]{64}$/);

  assert.deepEqual(adapter.getBuckets(bundle), [
    { id: "review", label: "Review", order: 10, states: ["needs_review"] },
    { id: "memos", label: "Memos", order: 20, states: ["memo"] }
  ]);

  assert.deepEqual(adapter.getAllowedActions(bundle, "memo"), [
    {
      id: "memo.accepted",
      label: "Accept",
      visible: true,
      trigger: "user",
      requiresInput: false,
      confirmationRequired: false
    },
    {
      id: "memo.parked",
      label: "Park",
      visible: true,
      trigger: "user",
      requiresInput: false,
      confirmationRequired: false
    }
  ]);
});

test("workflow runtime accepts normalized runtime definition bundles", () => {
  const adapter = new WorkflowRuntimeAdapter();
  const bundle = createRuntimeBundle();

  const validation = adapter.validateBundle(bundle);

  assert.equal(validation.ok, true);
  assert.equal(validation.identity?.workflowId, "memo-capture_workflow");
  assert.equal(validation.identity?.workflowVersion, "0.2.2");
  assert.equal(validation.identity?.stateMachineVersion, "0.2.2");

  assert.deepEqual(adapter.getBuckets(bundle), [
    { id: "review", label: "Review", order: 10, states: ["needs_review"] },
    { id: "memos", label: "Memos", order: 20, states: ["memo"] }
  ]);

  assert.deepEqual(adapter.getAllowedActions(bundle, "memo"), [
    {
      id: "memo.accepted",
      label: "Accept",
      visible: true,
      trigger: "user",
      requiresInput: false,
      confirmationRequired: false
    },
    {
      id: "memo.parked",
      label: "Park",
      visible: true,
      trigger: "user",
      requiresInput: false,
      confirmationRequired: false
    }
  ]);
});

test("workflow runtime rejects unsupported capabilities and hook handlers", () => {
  const adapter = new WorkflowRuntimeAdapter();
  const validation = adapter.validateBundle({
    ...createBundle(),
    requiredAppCapabilities: ["memo-capture.workflow-hooks.unsupported.v1"],
    hooks: [
      {
        id: "bad_hook",
        phase: "on_state_entry",
        targetType: "state",
        targetId: "accepted",
        handlerKey: "unsupported_handler"
      }
    ]
  });

  assert.equal(validation.ok, false);
  assert.equal(
    validation.errors.some((error) => error.code === "unsupported_app_capability"),
    true
  );
  assert.equal(
    validation.errors.some((error) => error.code === "unsupported_hook_handler"),
    true
  );
});

test("workflow runtime executes only actions allowed from the current state", () => {
  const adapter = new WorkflowRuntimeAdapter();
  const bundle = createBundle();

  const action = adapter.executeAction(bundle, "memo", "memo.accepted");
  assert.equal(action?.previousState, "memo");
  assert.equal(action?.newState, "accepted");
  assert.equal(action?.entryHooks[0]?.handlerKey, "create_accepted_snapshot");

  assert.equal(adapter.executeAction(bundle, "accepted", "memo.accepted"), null);
});

test("workflow debugger step mode blocks runtime steps until commanded", async () => {
  const service = new WorkflowDebuggerService();
  const actor = {
    id: "user-1",
    oidcIssuer: "issuer",
    oidcSubject: "subject",
    email: "dev@example.test",
    displayName: "Dev",
    firstSeenAt: "2026-05-29T00:00:00.000Z",
    lastSeenAt: "2026-05-29T00:00:00.000Z",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };

  await service.start({ stepMode: true }, actor, "debug-start");
  let released = false;
  const blocked = service
    .runtimeStep({
      eventType: "runtime_step",
      severity: "debug",
      message: "Commit transition.",
      operationId: "operation-1",
      itemRef: { resourceType: "work_item", resourceId: "work-item-1" }
    })
    .then(() => {
      released = true;
    });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(released, false);
  assert.equal(service.getSnapshot().currentStep?.message, "Commit transition.");

  await service.step({ operationId: "operation-1" }, actor, "debug-step");
  await blocked;
  assert.equal(released, true);
  assert.equal(service.getSnapshot().views.debugSteps.some((event) => event.eventType === "debug_step"), true);
});

test("workflow debugger resume exits step mode so runtime steps continue", async () => {
  const service = new WorkflowDebuggerService();
  const actor = {
    id: "user-1",
    oidcIssuer: "issuer",
    oidcSubject: "subject",
    email: "dev@example.test",
    displayName: "Dev",
    firstSeenAt: "2026-05-29T00:00:00.000Z",
    lastSeenAt: "2026-05-29T00:00:00.000Z",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z"
  };

  await service.start({ stepMode: true }, actor, "debug-start");
  await service.resume({}, actor, "debug-resume");

  const outcome = await Promise.race([
    service
      .runtimeStep({
        eventType: "runtime_step",
        severity: "debug",
        message: "Resume should unblock runtime execution.",
        operationId: "operation-1",
        itemRef: { resourceType: "work_item", resourceId: "work-item-1" }
      })
      .then(() => "released"),
    new Promise<string>((resolve) => setTimeout(() => resolve("timed_out"), 150))
  ]);

  assert.equal(outcome, "released");
});

function createBundle() {
  return {
    schemaVersion: "0.7.0",
    appName: "memo-capture",
    workflowVersion: "0.2.2",
    id: "memo-capture_workflow",
    stateMachine: {
      id: "memo_capture_state",
      definitionVersion: "0.2.2"
    },
    states: [
      { id: "needs_review", visible: true },
      { id: "memo", visible: true },
      { id: "accepted", visible: true },
      { id: "parked", visible: true },
      { id: "rejected", visible: true },
      { id: "ignored", visible: true },
      { id: "failed", visible: true }
    ],
    actions: [
      {
        id: "memo.accepted",
        label: "Accept",
        from: "memo",
        to: "accepted",
        trigger: "user",
        visible: true
      },
      {
        id: "memo.parked",
        label: "Park",
        from: "memo",
        to: "parked",
        trigger: "user",
        visible: true
      }
    ],
    buckets: [
      {
        id: "review",
        label: "Review",
        visible: true,
        states: ["needs_review"]
      },
      {
        id: "memos",
        label: "Memos",
        visible: true,
        states: ["memo"]
      }
    ],
    hooks: [
      {
        id: "on_state_entry_accepted",
        phase: "on_state_entry",
        targetType: "state",
        targetId: "accepted",
        handlerKey: "create_accepted_snapshot"
      }
    ],
    embeddedStateMachineDefinition: {
      schemaVersion: "0.3.0",
      appName: "memo-capture",
      definitionVersion: "0.2.2",
      version: "0.2.2",
      id: "memo_capture_state",
      initialState: "needs_review",
      states: ["needs_review", "memo", "accepted", "parked", "rejected", "ignored", "failed"],
      entryStates: ["needs_review", "memo"],
      terminalStates: [],
      transitions: [
        {
          from: "memo",
          to: "accepted",
          actionId: "memo.accepted"
        },
        {
          from: "memo",
          to: "parked",
          actionId: "memo.parked"
        }
      ]
    }
  };
}

function createRuntimeBundle() {
  const bundle = createBundle();
  return {
    workflowDefinition: {
      schemaVersion: bundle.schemaVersion,
      appName: bundle.appName,
      version: bundle.workflowVersion,
      workflowVersion: bundle.workflowVersion,
      id: bundle.id,
      workflowId: bundle.id,
      variantKey: "default",
      stateMachine: bundle.stateMachine,
      stateMachineDefinitionId: bundle.stateMachine.id,
      states: bundle.states,
      actions: bundle.actions,
      buckets: bundle.buckets.map((bucket) => ({
        ...bucket,
        stateIds: bucket.states
      })),
      hooks: bundle.hooks
    },
    embeddedStateMachineDefinition: bundle.embeddedStateMachineDefinition
  };
}
