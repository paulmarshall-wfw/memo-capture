import { SUPPORTED_WORKFLOW_HOOK_HANDLERS, type AllowedWorkflowAction } from "@memo-capture/domain";
import type { AuthMode } from "../config.js";
import type { Database } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { AcceptedSnapshotRepository, WorkItemRepository, type WorkItemRecord } from "../repositories/work-items.js";
import { WorkflowRepository, type ActiveWorkflowRow } from "../repositories/workflows.js";
import { HttpError, optionalString } from "./errors.js";
import { WorkflowHookScheduler } from "./workflow-hooks.js";
import {
  WorkflowRuntimeAdapter,
  type WorkflowIdentity,
  type WorkflowActionResult,
  type WorkflowValidationResult
} from "./workflow-runtime.js";
import { WorkflowDebuggerService, type WorkflowDebuggerItemRef, type WorkflowDebuggerSnapshot } from "./workflow-debugger.js";

export interface WorkflowStatusResult {
  active: WorkflowActiveSummary | null;
  supportedHookHandlers: readonly string[];
}

export interface WorkflowActiveSummary {
  workflowId: string;
  workflowVersion: string;
  stateMachineVersion: string;
  contentHash: string;
  activatedAt: string;
}

export class WorkflowService {
  private readonly runtime = new WorkflowRuntimeAdapter();

  constructor(
    private readonly db: Database,
    private readonly authMode: AuthMode,
    private readonly debuggerService = new WorkflowDebuggerService()
  ) {}

  async getStatus(): Promise<WorkflowStatusResult> {
    const active = await new WorkflowRepository(this.db).getActive();
    return {
      active: active === null ? null : summarizeActive(active),
      supportedHookHandlers: SUPPORTED_WORKFLOW_HOOK_HANDLERS
    };
  }

  async importBundle(
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{
    stagedImportId: string;
    status: "staged" | "invalid";
    validation: WorkflowValidationResult;
    identity: WorkflowIdentity | null;
  }> {
    const input = parseImportBody(requestBody);
    const validation = this.runtime.validateBundle(input.bundle);
    const status = validation.ok ? "staged" : "invalid";

    return this.db.transaction(async (client) => {
      const workflows = new WorkflowRepository(client);
      const audit = new AuditRepository(client);
      const identity = validation.identity;
      const staged = await workflows.createStagedImport({
        workflowId: identity?.workflowId ?? "invalid-workflow",
        workflowVersion: identity?.workflowVersion ?? "invalid-version",
        stateMachineVersion: identity?.stateMachineVersion ?? "invalid-state-machine-version",
        contentHash: identity?.contentHash ?? "sha256:invalid",
        bundle: input.bundle,
        validationResult: validation,
        status,
        importedBy: actor.id
      });

      await audit.record({
        eventName: validation.ok ? "workflow.imported" : "workflow.import_failed",
        actor,
        subjectType: "workflow_staged_import",
        subjectId: staged.id,
        requestId,
        metadata: {
          notes: input.notes,
          workflowId: identity?.workflowId ?? null,
          workflowVersion: identity?.workflowVersion ?? null,
          stateMachineVersion: identity?.stateMachineVersion ?? null,
          contentHash: identity?.contentHash ?? null,
          validation: sanitizeValidation(validation)
        }
      });

      return {
        stagedImportId: staged.id,
        status,
        validation,
        identity
      };
    });
  }

  async activateStagedImport(
    stagedImportId: string,
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ activated: true; activeWorkflowVersion: string; contentHash: string }> {
    const input = parseActivationBody(requestBody);
    if (!input.confirmActivation) {
      throw new HttpError(400, "activation_confirmation_required", "confirmActivation must be true.");
    }

    return this.db.transaction(async (client) => {
      const workflows = new WorkflowRepository(client);
      const audit = new AuditRepository(client);
      const staged = await workflows.findStagedImport(stagedImportId);
      if (staged === null) {
        throw new HttpError(404, "not_found", "workflow staged import was not found.");
      }
      if (staged.status !== "staged") {
        throw new HttpError(409, "workflow_import_not_staged", "Only staged workflow imports can be activated.");
      }

      const validation = this.runtime.validateBundle(staged.bundle);
      if (!validation.ok || validation.identity === null) {
        await audit.record({
          eventName: "workflow.activation_blocked",
          actor,
          subjectType: "workflow_staged_import",
          subjectId: staged.id,
          requestId,
          metadata: { validation: sanitizeValidation(validation) }
        });
        throw new HttpError(422, "workflow_validation_failed", "Workflow bundle failed validation.", {
          validation
        });
      }

      if (validation.identity.contentHash !== staged.content_hash) {
        throw new HttpError(409, "workflow_content_hash_changed", "Staged workflow content hash changed.");
      }

      const previousActivation = await workflows.findActivationByVersion(
        validation.identity.workflowId,
        validation.identity.workflowVersion
      );
      if (
        previousActivation !== null &&
        previousActivation.new_content_hash !== validation.identity.contentHash &&
        this.authMode !== "local-dev"
      ) {
        throw new HttpError(
          409,
          "workflow_version_content_conflict",
          "A workflow version with different content has already been activated."
        );
      }

      const activeDependentJobs = await workflows.countActiveWorkflowDependentJobs();
      if (activeDependentJobs > 0) {
        await audit.record({
          eventName: "workflow.activation_blocked",
          actor,
          subjectType: "workflow_staged_import",
          subjectId: staged.id,
          requestId,
          metadata: {
            workflowId: validation.identity.workflowId,
            workflowVersion: validation.identity.workflowVersion,
            activeDependentJobs
          }
        });
        throw new HttpError(
          409,
          "workflow_activation_blocked_by_active_jobs",
          "Workflow activation is blocked by active processing jobs.",
          { activeDependentJobs }
        );
      }

      const previous = await workflows.getActive();
      await workflows.replaceActive({
        workflowId: validation.identity.workflowId,
        workflowVersion: validation.identity.workflowVersion,
        stateMachineVersion: validation.identity.stateMachineVersion,
        contentHash: validation.identity.contentHash,
        requiredAppCapabilities: validation.identity.requiredAppCapabilities,
        bundle: staged.bundle,
        activatedBy: actor.id
      });
      await workflows.recordActivation({
        workflowId: validation.identity.workflowId,
        previousWorkflowVersion: previous?.workflow_version ?? null,
        previousStateMachineVersion: previous?.state_machine_version ?? null,
        previousContentHash: previous?.content_hash ?? null,
        newWorkflowVersion: validation.identity.workflowVersion,
        newStateMachineVersion: validation.identity.stateMachineVersion,
        newContentHash: validation.identity.contentHash,
        activationNotes: input.activationNotes,
        compatibilityResult: {
          ok: true,
          activeDependentJobs,
          warnings: validation.warnings
        },
        activatedBy: actor.id
      });
      await workflows.markStagedImportActivated(staged.id);
      await audit.record({
        eventName: "workflow.activated",
        actor,
        subjectType: "workflow",
        subjectId: validation.identity.workflowId,
        requestId,
        metadata: {
          workflowVersion: validation.identity.workflowVersion,
          stateMachineVersion: validation.identity.stateMachineVersion,
          contentHash: validation.identity.contentHash,
          activationNotes: input.activationNotes
        }
      });

      return {
        activated: true,
        activeWorkflowVersion: validation.identity.workflowVersion,
        contentHash: validation.identity.contentHash
      };
    });
  }

  async getBuckets() {
    const active = await requireActiveWorkflow(new WorkflowRepository(this.db));
    const workItems = new WorkItemRepository(this.db);
    return {
      buckets: await Promise.all(
        this.runtime.getBuckets(active.bundle).map(async (bucket) => ({
          ...bucket,
          count: await workItems.countByStates(bucket.states)
        }))
      )
    };
  }

  async getAllowedActions(workItemId: string): Promise<{
    workItemId: string;
    workflowState: string;
    actions: AllowedWorkflowAction[];
  }> {
    const workflows = new WorkflowRepository(this.db);
    const workItems = new WorkItemRepository(this.db);
    const active = await requireActiveWorkflow(workflows);
    const workItem = await workItems.findById(workItemId);
    if (workItem === null) {
      throw new HttpError(404, "not_found", "work_item was not found.");
    }

    return {
      workItemId: workItem.id,
      workflowState: workItem.workflowState,
      actions: this.runtime.getAllowedActions(active.bundle, workItem.workflowState)
    };
  }

  async executeAction(
    workItemId: string,
    actionId: string,
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{
    workItemId: string;
    actionId: string;
    previousState: string;
    newState: string;
    newVersion: number;
    createdSnapshotId: string | null;
    allowedActions: AllowedWorkflowAction[];
  }> {
    const input = parseExecuteActionBody(requestBody);
    const operationId = requestId;
    const itemRef = workItemRef(workItemId);

    await this.debuggerService.runtimeStep({
      eventType: "runtime_step",
      severity: "debug",
      message: `Workflow action ${actionId} requested.`,
      itemRef,
      operationId,
      actorId: actor.id,
      actionId
    });

    return this.db.transaction(async (client) => {
      const workflows = new WorkflowRepository(client);
      const workItems = new WorkItemRepository(client);
      const snapshots = new AcceptedSnapshotRepository(client);
      const audit = new AuditRepository(client);
      const active = await requireActiveWorkflow(workflows);
      const current = await workItems.findById(workItemId);
      if (current === null) {
        throw new HttpError(404, "not_found", "work_item was not found.");
      }
      if (input.expectedVersion !== null && current.workflowItemVersion !== input.expectedVersion) {
        throw new HttpError(409, "stale_work_item_version", "Work item version is stale.", {
          currentVersion: current.workflowItemVersion
        });
      }

      await this.debuggerService.runtimeStep({
        eventType: "runtime_step",
        severity: "debug",
        message: "Workflow action validation started.",
        itemRef,
        operationId,
        actorId: actor.id,
        actionId,
        metadata: {
          workflowId: active.workflow_id,
          workflowVersion: active.workflow_version,
          workflowState: current.workflowState
        }
      });
      const action = this.runtime.executeAction(active.bundle, current.workflowState, actionId);
      if (action === null) {
        this.debuggerService.recordEvent({
          eventType: "action_rejected",
          severity: "warn",
          message: `Workflow action ${actionId} is not allowed from ${current.workflowState}.`,
          itemRef,
          operationId,
          actorId: actor.id,
          actionId,
          metadata: {
            workflowState: current.workflowState,
            reason: "action_not_allowed"
          }
        });
        await audit.record({
          eventName: "work_item.workflow_action_rejected",
          actor,
          subjectType: "work_item",
          subjectId: current.id,
          requestId,
          sourceMemoId: current.sourceMemoId,
          workItemId: current.id,
          metadata: {
            actionId,
            workflowState: current.workflowState,
            reason: "action_not_allowed"
          }
        });
        throw new HttpError(409, "workflow_action_not_allowed", "Workflow action is not allowed from this state.");
      }
      if (action.confirmationRequired && !input.confirmation) {
        throw new HttpError(400, "workflow_action_confirmation_required", "Workflow action requires confirmation.");
      }
      if (action.requiresInput && !isRecord(input.input)) {
        throw new HttpError(400, "workflow_action_input_required", "Workflow action input must be an object.");
      }

      this.debuggerService.recordEvent({
        eventType: "action_allowed",
        severity: "debug",
        message: `Workflow action ${action.actionId} is allowed.`,
        itemRef,
        operationId,
        actorId: actor.id,
        actionId: action.actionId,
        metadata: {
          previousState: action.previousState,
          newState: action.newState,
          requiresInput: action.requiresInput,
          confirmationRequired: action.confirmationRequired
        }
      });
      await this.debuggerService.runtimeStep({
        eventType: "runtime_step",
        severity: "debug",
        message: `Committing transition from ${action.previousState} to ${action.newState}.`,
        itemRef,
        operationId,
        actorId: actor.id,
        actionId: action.actionId
      });
      const updated = await workItems.updateWorkflowState({
        workItemId: current.id,
        expectedVersion: current.workflowItemVersion,
        nextState: action.newState,
        actorUserId: actor.id
      });
      if (updated === null) {
        throw new HttpError(409, "stale_work_item_version", "Work item version is stale.");
      }

      const transitionId = `${updated.id}:${action.previousState}:${action.newState}:${updated.workflowItemVersion}`;
      this.debuggerService.recordEvent({
        eventType: "transition_committed",
        severity: "info",
        message: `Transition committed from ${action.previousState} to ${action.newState}.`,
        itemRef,
        operationId,
        actorId: actor.id,
        actionId: action.actionId,
        transitionId,
        metadata: {
          workflowId: active.workflow_id,
          workflowVersion: active.workflow_version,
          previousState: action.previousState,
          newState: action.newState,
          newVersion: updated.workflowItemVersion
        }
      });
      const createdSnapshotId = await runEntryHooks({
        actionResult: action,
        workItem: updated,
        snapshots,
        actorUserId: actor.id,
        debuggerService: this.debuggerService,
        operationId,
        itemRef
      });
      const finalWorkItem =
        createdSnapshotId === null
          ? updated
          : await workItems.setAcceptedSnapshot({
              workItemId: updated.id,
              acceptedSnapshotId: createdSnapshotId,
              actorUserId: actor.id
            });
      const hookScheduler = new WorkflowHookScheduler(client);
      if (current.workflowState === "memo" && finalWorkItem.workflowState !== "memo") {
        await hookScheduler.cancelPendingNominationJobs(finalWorkItem.id);
      }
      if (current.workflowState !== "memo" && finalWorkItem.workflowState === "memo") {
        await hookScheduler.scheduleStateResidentHooksForWorkItem({
          workItem: finalWorkItem,
          actorUserId: actor.id
        });
      }

      const allowedActions = this.runtime.getAllowedActions(active.bundle, finalWorkItem.workflowState);
      await audit.record({
        eventName: "work_item.workflow_action_executed",
        actor,
        subjectType: "work_item",
        subjectId: finalWorkItem.id,
        requestId,
        sourceMemoId: finalWorkItem.sourceMemoId,
        workItemId: finalWorkItem.id,
        metadata: {
          workflowId: active.workflow_id,
          workflowVersion: active.workflow_version,
          actionId: action.actionId,
          previousState: action.previousState,
          newState: action.newState,
          newVersion: finalWorkItem.workflowItemVersion,
          createdSnapshotId
        }
      });
      this.debuggerService.recordEvent({
        eventType: "record_event",
        severity: "debug",
        message: "Workflow action audit event recorded.",
        itemRef,
        operationId,
        actorId: actor.id,
        actionId: action.actionId,
        transitionId,
        metadata: {
          auditEventName: "work_item.workflow_action_executed",
          createdSnapshotId
        }
      });

      return {
        workItemId: finalWorkItem.id,
        actionId: action.actionId,
        previousState: action.previousState,
        newState: action.newState,
        newVersion: finalWorkItem.workflowItemVersion,
        createdSnapshotId,
        allowedActions
      };
    });
  }

  getDebuggerSnapshot(itemRef?: WorkflowDebuggerItemRef): WorkflowDebuggerSnapshot {
    return this.debuggerService.getSnapshot(itemRef);
  }

  startDebugger(body: unknown, actor: AppUserRecord, requestId: string): Promise<WorkflowDebuggerSnapshot> {
    return this.debuggerService.start(body, actor, requestId);
  }

  pauseDebugger(body: unknown, actor: AppUserRecord, requestId: string): Promise<WorkflowDebuggerSnapshot> {
    return this.debuggerService.pause(body, actor, requestId);
  }

  resumeDebugger(body: unknown, actor: AppUserRecord, requestId: string): Promise<WorkflowDebuggerSnapshot> {
    return this.debuggerService.resume(body, actor, requestId);
  }

  stepDebugger(body: unknown, actor: AppUserRecord, requestId: string): Promise<WorkflowDebuggerSnapshot> {
    return this.debuggerService.step(body, actor, requestId);
  }

  stopDebugger(body: unknown, actor: AppUserRecord, requestId: string): Promise<WorkflowDebuggerSnapshot> {
    return this.debuggerService.stop(body, actor, requestId);
  }
}

async function runEntryHooks(input: {
  actionResult: WorkflowActionResult;
  workItem: WorkItemRecord;
  snapshots: AcceptedSnapshotRepository;
  actorUserId: string;
  debuggerService: WorkflowDebuggerService;
  operationId: string;
  itemRef: WorkflowDebuggerItemRef;
}): Promise<string | null> {
  let createdSnapshotId: string | null = null;
  for (const hook of input.actionResult.entryHooks) {
    if (hook.handlerKey !== "create_accepted_snapshot") {
      throw new HttpError(422, "unsupported_workflow_hook", `Unsupported workflow hook ${hook.handlerKey}.`);
    }

    await input.debuggerService.runtimeStep({
      eventType: "runtime_step",
      severity: "debug",
      message: `Running state-entry hook ${hook.handlerKey}.`,
      itemRef: input.itemRef,
      operationId: input.operationId,
      actorId: input.actorUserId,
      actionId: input.actionResult.actionId,
      metadata: {
        hookId: hook.id,
        phase: hook.phase,
        targetType: hook.targetType,
        targetId: hook.targetId,
        handlerKey: hook.handlerKey
      }
    });
    input.debuggerService.recordEvent({
      eventType: "handler_started",
      severity: "debug",
      message: `State-entry hook ${hook.handlerKey} started.`,
      itemRef: input.itemRef,
      operationId: input.operationId,
      actorId: input.actorUserId,
      actionId: input.actionResult.actionId,
      metadata: {
        hookId: hook.id,
        handlerKey: hook.handlerKey
      }
    });
    const snapshot = await input.snapshots.createFromWorkItem({
      workItemId: input.workItem.id,
      actorUserId: input.actorUserId
    });
    if (snapshot === null) {
      throw new HttpError(
        422,
        "accepted_snapshot_requires_project",
        "Accepted workflow transition requires a project-backed work item."
      );
    }
    createdSnapshotId = snapshot.id;
    input.debuggerService.recordEvent({
      eventType: "handler_completed",
      severity: "debug",
      message: `State-entry hook ${hook.handlerKey} completed.`,
      itemRef: input.itemRef,
      operationId: input.operationId,
      actorId: input.actorUserId,
      actionId: input.actionResult.actionId,
      metadata: {
        hookId: hook.id,
        handlerKey: hook.handlerKey,
        createdSnapshotId
      }
    });
  }
  return createdSnapshotId;
}

async function requireActiveWorkflow(workflows: WorkflowRepository): Promise<ActiveWorkflowRow> {
  const active = await workflows.getActive();
  if (active === null) {
    throw new HttpError(409, "active_workflow_missing", "No active workflow definition is installed.");
  }
  return active;
}

function summarizeActive(active: ActiveWorkflowRow): WorkflowActiveSummary {
  return {
    workflowId: active.workflow_id,
    workflowVersion: active.workflow_version,
    stateMachineVersion: active.state_machine_version,
    contentHash: active.content_hash,
    activatedAt: active.activated_at instanceof Date ? active.activated_at.toISOString() : active.activated_at
  };
}

function workItemRef(workItemId: string): WorkflowDebuggerItemRef {
  return {
    resourceType: "work_item",
    resourceId: workItemId
  };
}

function parseImportBody(body: unknown): { bundle: unknown; notes: string } {
  const record = parseObject(body);
  if (record.bundle === undefined) {
    throw new HttpError(400, "invalid_request", "bundle is required.");
  }
  return {
    bundle: record.bundle,
    notes: optionalString(record.notes, "notes") ?? ""
  };
}

function parseActivationBody(body: unknown): { confirmActivation: boolean; activationNotes: string } {
  const record = parseObject(body);
  if (record.confirmActivation !== true) {
    return {
      confirmActivation: false,
      activationNotes: optionalString(record.activationNotes, "activationNotes") ?? ""
    };
  }
  return {
    confirmActivation: true,
    activationNotes: optionalString(record.activationNotes, "activationNotes") ?? ""
  };
}

function parseExecuteActionBody(body: unknown): { expectedVersion: number | null; input: unknown; confirmation: boolean } {
  const record = parseObject(body);
  const expectedVersion = record.expectedVersion;
  if (
    expectedVersion !== undefined &&
    (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1)
  ) {
    throw new HttpError(400, "invalid_request", "expectedVersion must be a positive integer.");
  }
  if (record.confirmation !== undefined && typeof record.confirmation !== "boolean") {
    throw new HttpError(400, "invalid_request", "confirmation must be a boolean.");
  }

  return {
    expectedVersion: expectedVersion === undefined ? null : expectedVersion,
    input: record.input ?? {},
    confirmation: record.confirmation === true
  };
}

function parseObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Request body must be an object.");
  }
  return body as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sanitizeValidation(validation: WorkflowValidationResult): Record<string, unknown> {
  return {
    ok: validation.ok,
    warnings: validation.warnings,
    errors: validation.errors,
    identity: validation.identity
  };
}
