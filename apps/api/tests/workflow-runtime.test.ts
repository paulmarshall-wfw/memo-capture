import assert from "node:assert/strict";
import test from "node:test";
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
    ]
  };
}
