import { createHash } from "node:crypto";
import {
  importDefinitionBundle,
  validateDefinitionBundle,
  type DefinitionBundle,
  type WorkflowBucketDefinition,
  type WorkflowDefinition
} from "state-workflow-runtime";
import {
  INITIAL_WORK_ITEM_STATES,
  SUPPORTED_WORKFLOW_APP_CAPABILITIES,
  SUPPORTED_WORKFLOW_HOOK_HANDLERS,
  WORK_ITEM_STATES,
  type AllowedWorkflowAction,
  type WorkflowBucket
} from "@memo-capture/domain";

export interface WorkflowIdentity {
  workflowId: string;
  workflowVersion: string;
  stateMachineVersion: string;
  contentHash: string;
  requiredAppCapabilities: string[];
}

export interface WorkflowValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface WorkflowValidationResult {
  ok: boolean;
  warnings: WorkflowValidationIssue[];
  errors: WorkflowValidationIssue[];
  identity: WorkflowIdentity | null;
}

export interface WorkflowActionResult {
  actionId: string;
  label: string;
  previousState: string;
  newState: string;
  requiresInput: boolean;
  confirmationRequired: boolean;
  entryHooks: WorkflowHook[];
}

export interface WorkflowHook {
  id: string;
  phase: string;
  targetType: string;
  targetId: string;
  handlerKey: string;
}

interface WorkflowActionDefinition {
  id: string;
  label: string;
  from: string;
  to: string;
  trigger: "user" | "automatic";
  visible: boolean;
  requiresInput: boolean;
  confirmationRequired: boolean;
}

interface WorkflowBundleProjection {
  workflowId: string;
  workflowVersion: string;
  stateMachineVersion: string;
  requiredMigrationKey: string | null;
  states: Set<string>;
  actions: WorkflowActionDefinition[];
  buckets: WorkflowBucket[];
  hooks: WorkflowHook[];
}

export class WorkflowRuntimeAdapter {
  validateBundle(bundle: unknown): WorkflowValidationResult {
    const errors: WorkflowValidationIssue[] = [];
    const warnings: WorkflowValidationIssue[] = [];

    if (!isRecord(bundle)) {
      return {
        ok: false,
        warnings,
        errors: [issue("invalid_bundle", "Workflow bundle must be an object.")],
        identity: null
      };
    }

    const contentHash = hashBundle(bundle);
    const projection = projectWorkflowBundle(bundle, errors);
    const requiredAppCapabilities = readRequiredAppCapabilities(bundle, errors);

    for (const capability of requiredAppCapabilities) {
      if (!(SUPPORTED_WORKFLOW_APP_CAPABILITIES as readonly string[]).includes(capability)) {
        errors.push(
          issue(
            "unsupported_app_capability",
            `Workflow requires unsupported app capability ${capability}.`,
            "requiredAppCapabilities"
          )
        );
      }
    }

    if (requiresAppCodeMigration(bundle) || (projection?.requiredMigrationKey ?? null) !== null) {
      errors.push(
        issue(
          "app_code_migration_required",
          "Workflow bundles that require app-code migrations cannot be activated in V1.",
          "requiresAppCodeMigration"
        )
      );
    }

    const requiredMigrations = readRequiredAppMigrations(bundle);
    if (requiredMigrations.length > 0) {
      errors.push(
        issue(
          "app_code_migration_required",
          "Workflow bundles that require app migrations cannot be activated in V1.",
          "requiredAppMigrations"
        )
      );
    }

    if (projection !== null) {
      for (const state of WORK_ITEM_STATES) {
        if (!projection.states.has(state)) {
          errors.push(issue("missing_state", `Workflow bundle must define state ${state}.`, "states"));
        }
      }

      for (const state of INITIAL_WORK_ITEM_STATES) {
        if (!projection.states.has(state)) {
          errors.push(issue("missing_initial_state", `Workflow bundle must support initial state ${state}.`, "states"));
        }
      }

      if (projection.actions.length === 0) {
        warnings.push(issue("no_user_actions", "Workflow bundle has no valid user-triggered actions.", "actions"));
      }

      if (projection.buckets.length === 0) {
        errors.push(issue("missing_buckets", "Workflow bundle must define at least one bucket.", "buckets"));
      }

      for (const hook of projection.hooks) {
        if (!(SUPPORTED_WORKFLOW_HOOK_HANDLERS as readonly string[]).includes(hook.handlerKey)) {
          errors.push(issue("unsupported_hook_handler", `Unsupported workflow hook handler ${hook.handlerKey}.`, "hooks"));
        }
      }

      if (
        projection.actions.some((action) => action.to === "accepted") &&
        !projection.hooks.some(
          (hook) =>
            hook.phase === "on_state_entry" &&
            hook.targetType === "state" &&
            hook.targetId === "accepted" &&
            hook.handlerKey === "create_accepted_snapshot"
        )
      ) {
        errors.push(
          issue(
            "missing_accepted_snapshot_hook",
            "Workflow actions that enter accepted must define the create_accepted_snapshot state-entry hook.",
            "hooks"
          )
        );
      }
    }

    const identity =
      projection === null
        ? null
        : {
            workflowId: projection.workflowId,
            workflowVersion: projection.workflowVersion,
            stateMachineVersion: projection.stateMachineVersion,
            contentHash,
            requiredAppCapabilities
          };

    return {
      ok: errors.length === 0,
      warnings,
      errors,
      identity
    };
  }

  getBuckets(bundle: unknown): WorkflowBucket[] {
    return projectWorkflowBundle(bundle)?.buckets ?? [];
  }

  getAllowedActions(bundle: unknown, workflowState: string): AllowedWorkflowAction[] {
    return (projectWorkflowBundle(bundle)?.actions ?? [])
      .filter((action) => action.trigger === "user" && action.from === workflowState)
      .map(({ id, label, visible, trigger, requiresInput, confirmationRequired }) => ({
        id,
        label,
        visible,
        trigger,
        requiresInput,
        confirmationRequired
      }));
  }

  executeAction(bundle: unknown, workflowState: string, actionId: string): WorkflowActionResult | null {
    const projection = projectWorkflowBundle(bundle);
    if (projection === null) {
      return null;
    }

    const action = projection.actions.find(
      (candidate) => candidate.id === actionId && candidate.trigger === "user" && candidate.from === workflowState
    );
    if (action === undefined) {
      return null;
    }

    return {
      actionId: action.id,
      label: action.label,
      previousState: workflowState,
      newState: action.to,
      requiresInput: action.requiresInput,
      confirmationRequired: action.confirmationRequired,
      entryHooks: projection.hooks.filter(
        (hook) => hook.phase === "on_state_entry" && hook.targetType === "state" && hook.targetId === action.to
      )
    };
  }

  getStateEntryHooks(bundle: unknown, workflowState: string): WorkflowHook[] {
    return (projectWorkflowBundle(bundle)?.hooks ?? []).filter(
      (hook) => hook.phase === "on_state_entry" && hook.targetType === "state" && hook.targetId === workflowState
    );
  }
}

export function hashBundle(bundle: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(bundle)).digest("hex")}`;
}

function projectWorkflowBundle(bundle: unknown, errors?: WorkflowValidationIssue[]): WorkflowBundleProjection | null {
  const validation = validateDefinitionBundle(bundle);
  if (!validation.valid) {
    if (errors !== undefined) {
      for (const validationIssue of validation.issues) {
        errors.push(issue("invalid_definition_bundle", validationIssue.message, validationIssue.path));
      }
    }
    return null;
  }

  let definitionBundle: DefinitionBundle;
  try {
    definitionBundle = importDefinitionBundle(bundle).bundle;
  } catch (error) {
    if (errors !== undefined) {
      errors.push(
        issue(
          "invalid_definition_bundle",
          error instanceof Error ? error.message : "Workflow bundle could not be imported."
        )
      );
    }
    return null;
  }

  const workflowRecord = readWorkflowRecord(bundle);
  const workflow = definitionBundle.workflowDefinition;
  const stateMachine = definitionBundle.embeddedStateMachineDefinition;

  return {
    workflowId: workflow.workflowId,
    workflowVersion: workflow.workflowVersion,
    stateMachineVersion: workflow.stateMachine.definitionVersion || stateMachine.definitionVersion || stateMachine.version,
    requiredMigrationKey:
      typeof workflow.requiredMigrationKey === "string" && workflow.requiredMigrationKey.trim() !== ""
        ? workflow.requiredMigrationKey.trim()
        : null,
    states: new Set(workflow.states.map((state) => state.id).filter(Boolean)),
    actions: projectWorkflowActions(workflow, workflowRecord),
    buckets: projectWorkflowBuckets(workflow, workflowRecord),
    hooks: projectWorkflowHooks(workflow)
  };
}

function projectWorkflowActions(
  workflow: WorkflowDefinition,
  workflowRecord: Record<string, unknown> | null
): WorkflowActionDefinition[] {
  const rawActionsById = readRawDefinitionsById(workflowRecord?.actions);

  return workflow.actions.flatMap((action) => {
    const rawAction = rawActionsById.get(action.id) ?? null;
    const from = typeof action.from === "string" ? action.from.trim() : "";
    const to = action.to.trim();
    if (action.id.trim() === "" || from === "" || to === "") {
      return [];
    }

    return [
      {
        id: action.id.trim(),
        label: action.label.trim() !== "" ? action.label.trim() : action.id.trim(),
        from,
        to,
        trigger: action.trigger === "automatic" ? "automatic" : "user",
        visible: action.visible !== false,
        requiresInput: rawAction?.requiresInput === true || rawAction?.inputSchema !== undefined,
        confirmationRequired: rawAction?.confirmationRequired === true
      }
    ];
  });
}

function projectWorkflowBuckets(
  workflow: WorkflowDefinition,
  workflowRecord: Record<string, unknown> | null
): WorkflowBucket[] {
  const rawBucketsById = readRawDefinitionsById(workflowRecord?.buckets);

  return workflow.buckets
    .filter((bucket) => bucket.visible !== false)
    .map((bucket, index) => {
      const rawBucket = rawBucketsById.get(bucket.id) ?? null;
      return {
        id: bucket.id,
        label: bucket.label,
        order: typeof rawBucket?.order === "number" ? rawBucket.order : (index + 1) * 10,
        states: readBucketStates(bucket)
      };
    })
    .filter((bucket) => bucket.id !== "" && bucket.label !== "" && bucket.states.length > 0)
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
}

function projectWorkflowHooks(workflow: WorkflowDefinition): WorkflowHook[] {
  return workflow.hooks.flatMap((hook) => {
    const id = typeof hook.id === "string" ? hook.id.trim() : "";
    const phase = typeof hook.phase === "string" ? hook.phase.trim() : "";
    const targetType = typeof hook.targetType === "string" ? hook.targetType.trim() : "";
    const targetId = typeof hook.targetId === "string" ? hook.targetId.trim() : "";
    const handlerKey = typeof hook.handlerKey === "string" ? hook.handlerKey.trim() : "";
    if (id === "" || phase === "" || targetType === "" || targetId === "" || handlerKey === "") {
      return [];
    }

    return [{ id, phase, targetType, targetId, handlerKey }];
  });
}

function readStringArray(
  value: unknown,
  path: string,
  errors: WorkflowValidationIssue[]
): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    errors.push(issue("invalid_string_array", `${path} must be an array of strings.`, path));
    return [];
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function readStringArrayLenient(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function readRequiredAppCapabilities(bundle: Record<string, unknown>, errors: WorkflowValidationIssue[]): string[] {
  const workflowRecord = readWorkflowRecord(bundle);
  return readStringArray(
    bundle.requiredAppCapabilities ??
      bundle.required_app_capabilities ??
      workflowRecord?.requiredAppCapabilities ??
      workflowRecord?.required_app_capabilities,
    "requiredAppCapabilities",
    errors
  );
}

function requiresAppCodeMigration(bundle: Record<string, unknown>): boolean {
  const workflowRecord = readWorkflowRecord(bundle);
  return bundle.requiresAppCodeMigration === true || workflowRecord?.requiresAppCodeMigration === true;
}

function readRequiredAppMigrations(bundle: Record<string, unknown>): unknown[] {
  const workflowRecord = readWorkflowRecord(bundle);
  const value = bundle.requiredAppMigrations ?? workflowRecord?.requiredAppMigrations;
  return Array.isArray(value) ? value : [];
}

function readWorkflowRecord(bundle: unknown): Record<string, unknown> | null {
  if (!isRecord(bundle)) {
    return null;
  }
  return isRecord(bundle.workflowDefinition) ? bundle.workflowDefinition : bundle;
}

function readRawDefinitionsById(value: unknown): Map<string, Record<string, unknown>> {
  const definitions = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(value)) {
    return definitions;
  }
  for (const definition of value) {
    if (!isRecord(definition) || typeof definition.id !== "string") {
      continue;
    }
    definitions.set(definition.id, definition);
  }
  return definitions;
}

function readBucketStates(bucket: WorkflowBucketDefinition): string[] {
  const states = bucket.states.length > 0 ? bucket.states : bucket.stateIds;
  return readStringArrayLenient(states);
}

function issue(code: string, message: string, path?: string): WorkflowValidationIssue {
  return path === undefined ? { code, message } : { code, message, path };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
