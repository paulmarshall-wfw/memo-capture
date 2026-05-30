import { createHash } from "node:crypto";
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

interface WorkflowHook {
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
    const workflowId = readRequiredString(bundle, ["workflow_id", "workflowId", "id"], errors, "workflow_id");
    const workflowVersion = readRequiredString(
      bundle,
      ["workflowVersion", "workflow_version", "version"],
      errors,
      "workflowVersion"
    );
    const stateMachineVersion = readStateMachineVersion(bundle, errors);
    const requiredAppCapabilities = readStringArray(
      bundle.requiredAppCapabilities ?? bundle.required_app_capabilities,
      "requiredAppCapabilities",
      errors
    );

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

    if (bundle.requiresAppCodeMigration === true) {
      errors.push(
        issue(
          "app_code_migration_required",
          "Workflow bundles that require app-code migrations cannot be activated in V1.",
          "requiresAppCodeMigration"
        )
      );
    }

    const requiredMigrations = readOptionalUnknownArray(bundle.requiredAppMigrations);
    if (requiredMigrations.length > 0) {
      errors.push(
        issue(
          "app_code_migration_required",
          "Workflow bundles that require app migrations cannot be activated in V1.",
          "requiredAppMigrations"
        )
      );
    }

    const stateIds = readStateIds(bundle, errors);
    for (const state of WORK_ITEM_STATES) {
      if (!stateIds.has(state)) {
        errors.push(issue("missing_state", `Workflow bundle must define state ${state}.`, "states"));
      }
    }

    for (const state of INITIAL_WORK_ITEM_STATES) {
      if (!stateIds.has(state)) {
        errors.push(issue("missing_initial_state", `Workflow bundle must support initial state ${state}.`, "states"));
      }
    }

    const actions = readActions(bundle, stateIds, errors);
    if (actions.length === 0) {
      warnings.push(issue("no_user_actions", "Workflow bundle has no valid user-triggered actions.", "actions"));
    }

    const buckets = readBuckets(bundle, stateIds, errors);
    if (buckets.length === 0) {
      errors.push(issue("missing_buckets", "Workflow bundle must define at least one bucket.", "buckets"));
    }

    const hooks = readHooks(bundle, errors);
    if (
      actions.some((action) => action.to === "accepted") &&
      !hooks.some(
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

    const identity =
      workflowId === null || workflowVersion === null || stateMachineVersion === null
        ? null
        : {
            workflowId,
            workflowVersion,
            stateMachineVersion,
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
    if (!isRecord(bundle) || !Array.isArray(bundle.buckets)) {
      return [];
    }

    return bundle.buckets
      .filter(isRecord)
      .filter((bucket) => bucket.visible !== false)
      .map((bucket, index) => ({
        id: String(bucket.id ?? ""),
        label: String(bucket.label ?? bucket.id ?? ""),
        order: typeof bucket.order === "number" ? bucket.order : (index + 1) * 10,
        states: readStringArrayLenient(bucket.states)
      }))
      .filter((bucket) => bucket.id !== "" && bucket.label !== "" && bucket.states.length > 0)
      .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
  }

  getAllowedActions(bundle: unknown, workflowState: string): AllowedWorkflowAction[] {
    return readActionDefinitions(bundle)
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
    const action = readActionDefinitions(bundle).find(
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
      entryHooks: readHookDefinitions(bundle).filter(
        (hook) => hook.phase === "on_state_entry" && hook.targetType === "state" && hook.targetId === action.to
      )
    };
  }
}

export function hashBundle(bundle: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(bundle)).digest("hex")}`;
}

function readStateMachineVersion(
  bundle: Record<string, unknown>,
  errors: WorkflowValidationIssue[]
): string | null {
  const stateMachine = isRecord(bundle.stateMachine) ? bundle.stateMachine : null;
  const embedded = isRecord(bundle.embeddedStateMachineDefinition)
    ? bundle.embeddedStateMachineDefinition
    : null;
  const value =
    readFirstString(stateMachine, ["definitionVersion", "definition_version", "version"]) ??
    readFirstString(embedded, ["definitionVersion", "definition_version", "version"]);

  if (value === null) {
    errors.push(issue("missing_state_machine_version", "stateMachine.definitionVersion is required.", "stateMachine"));
  }

  return value;
}

function readRequiredString(
  record: Record<string, unknown>,
  keys: string[],
  errors: WorkflowValidationIssue[],
  path: string
): string | null {
  const value = readFirstString(record, keys);
  if (value === null) {
    errors.push(issue("missing_required_field", `${path} is required.`, path));
  }
  return value;
}

function readStateIds(bundle: Record<string, unknown>, errors: WorkflowValidationIssue[]): Set<string> {
  if (!Array.isArray(bundle.states)) {
    errors.push(issue("missing_states", "states must be an array.", "states"));
    return new Set();
  }

  const stateIds = new Set<string>();
  for (const state of bundle.states) {
    if (typeof state === "string" && state.trim() !== "") {
      stateIds.add(state.trim());
    } else if (isRecord(state) && typeof state.id === "string" && state.id.trim() !== "") {
      stateIds.add(state.id.trim());
    } else {
      errors.push(issue("invalid_state", "Each state must be a string or object with an id.", "states"));
    }
  }
  return stateIds;
}

function readActions(
  bundle: Record<string, unknown>,
  stateIds: Set<string>,
  errors: WorkflowValidationIssue[]
): WorkflowActionDefinition[] {
  if (!Array.isArray(bundle.actions)) {
    errors.push(issue("missing_actions", "actions must be an array.", "actions"));
    return [];
  }

  const actions = readActionDefinitions(bundle);
  for (const action of actions) {
    if (!stateIds.has(action.from)) {
      errors.push(issue("unknown_action_from_state", `Action ${action.id} references unknown from state.`, "actions"));
    }
    if (!stateIds.has(action.to)) {
      errors.push(issue("unknown_action_to_state", `Action ${action.id} references unknown to state.`, "actions"));
    }
  }
  return actions;
}

function readActionDefinitions(bundle: unknown): WorkflowActionDefinition[] {
  if (!isRecord(bundle) || !Array.isArray(bundle.actions)) {
    return [];
  }

  return bundle.actions.filter(isRecord).flatMap((action) => {
    const id = typeof action.id === "string" ? action.id.trim() : "";
    const from = typeof action.from === "string" ? action.from.trim() : "";
    const to = typeof action.to === "string" ? action.to.trim() : "";
    if (id === "" || from === "" || to === "") {
      return [];
    }

    return [
      {
        id,
        label: typeof action.label === "string" && action.label.trim() !== "" ? action.label.trim() : id,
        from,
        to,
        trigger: action.trigger === "automatic" ? "automatic" : "user",
        visible: action.visible !== false,
        requiresInput: action.requiresInput === true || action.inputSchema !== undefined,
        confirmationRequired: action.confirmationRequired === true
      }
    ];
  });
}

function readBuckets(
  bundle: Record<string, unknown>,
  stateIds: Set<string>,
  errors: WorkflowValidationIssue[]
): WorkflowBucket[] {
  if (!Array.isArray(bundle.buckets)) {
    return [];
  }

  const buckets = new WorkflowRuntimeAdapter().getBuckets(bundle);
  for (const bucket of buckets) {
    for (const state of bucket.states) {
      if (!stateIds.has(state)) {
        errors.push(issue("unknown_bucket_state", `Bucket ${bucket.id} references unknown state ${state}.`, "buckets"));
      }
    }
  }
  return buckets;
}

function readHooks(bundle: Record<string, unknown>, errors: WorkflowValidationIssue[]): WorkflowHook[] {
  const hooks = readHookDefinitions(bundle);
  for (const hook of hooks) {
    if (!(SUPPORTED_WORKFLOW_HOOK_HANDLERS as readonly string[]).includes(hook.handlerKey)) {
      errors.push(issue("unsupported_hook_handler", `Unsupported workflow hook handler ${hook.handlerKey}.`, "hooks"));
    }
  }
  return hooks;
}

function readHookDefinitions(bundle: unknown): WorkflowHook[] {
  if (!isRecord(bundle) || !Array.isArray(bundle.hooks)) {
    return [];
  }

  return bundle.hooks.filter(isRecord).flatMap((hook) => {
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

function readFirstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (record === null) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
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

function readOptionalUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
