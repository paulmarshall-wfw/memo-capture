import { randomUUID } from "node:crypto";
import type { AppUserRecord } from "../repositories/rows.js";
import { HttpError } from "./errors.js";

export interface WorkflowDebuggerItemRef {
  resourceType: string;
  resourceId: string;
}

export interface WorkflowDebuggerEvent {
  eventId: string;
  sequence: number;
  eventType: string;
  severity: "debug" | "info" | "warn" | "error";
  message: string;
  itemRef?: WorkflowDebuggerItemRef;
  operationId?: string;
  actorId?: string;
  actionId?: string;
  transitionId?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

export interface WorkflowDebuggerViews {
  transitions: WorkflowDebuggerEvent[];
  actions: WorkflowDebuggerEvent[];
  handlers: WorkflowDebuggerEvent[];
  handlerResponses: WorkflowDebuggerEvent[];
  recordEvents: WorkflowDebuggerEvent[];
  stateHooks: WorkflowDebuggerEvent[];
  failures: WorkflowDebuggerEvent[];
  debugSteps: WorkflowDebuggerEvent[];
}

export interface WorkflowDebuggerSnapshot {
  state: "running" | "paused" | "stopped";
  stepMode: boolean;
  currentStep?: WorkflowDebuggerEvent;
  events: WorkflowDebuggerEvent[];
  views: WorkflowDebuggerViews;
}

export interface WorkflowDebuggerEventInput {
  eventType: string;
  severity: WorkflowDebuggerEvent["severity"];
  message: string;
  itemRef?: WorkflowDebuggerItemRef;
  operationId?: string;
  actorId?: string;
  actionId?: string;
  transitionId?: string;
  metadata?: Record<string, unknown>;
}

interface Waiter {
  resolve: () => void;
}

export class WorkflowDebuggerService {
  private state: WorkflowDebuggerSnapshot["state"] = "running";
  private stepMode = false;
  private stepAllowance = 0;
  private sequence = 0;
  private currentStep: WorkflowDebuggerEvent | undefined;
  private readonly events: WorkflowDebuggerEvent[] = [];
  private readonly waiters: Waiter[] = [];

  async start(body: unknown, actor: AppUserRecord, requestId: string): Promise<WorkflowDebuggerSnapshot> {
    const input = parseControlBody(body);
    this.stepMode = input.stepMode;
    this.state = input.stepMode ? "paused" : "running";
    this.stepAllowance = 0;
    this.append({
      eventType: "debug_start",
      severity: "debug",
      message: input.stepMode ? "Debugger started in step mode." : "Debugger started.",
      actorId: actor.id,
      operationId: requestId,
      metadata: { stepMode: input.stepMode }
    });
    if (!input.stepMode) {
      this.releaseWaiters();
    }
    return this.getSnapshot();
  }

  async pause(body: unknown, actor: AppUserRecord, requestId: string): Promise<WorkflowDebuggerSnapshot> {
    const input = parseControlBody(body);
    this.state = "paused";
    this.append({
      eventType: "debug_pause",
      severity: "debug",
      message: "Debugger paused runtime execution.",
      actorId: actor.id,
      operationId: input.operationId ?? requestId
    });
    return this.getSnapshot();
  }

  async resume(body: unknown, actor: AppUserRecord, requestId: string): Promise<WorkflowDebuggerSnapshot> {
    const input = parseControlBody(body);
    this.stepMode = false;
    this.state = "running";
    this.stepAllowance = 0;
    this.append({
      eventType: "debug_resume",
      severity: "debug",
      message: "Debugger resumed runtime execution.",
      actorId: actor.id,
      operationId: input.operationId ?? requestId
    });
    this.releaseWaiters();
    return this.getSnapshot();
  }

  async stop(body: unknown, actor: AppUserRecord, requestId: string): Promise<WorkflowDebuggerSnapshot> {
    const input = parseControlBody(body);
    this.state = "stopped";
    this.stepAllowance = 0;
    this.append({
      eventType: "debug_stop",
      severity: "debug",
      message: "Debugger stopped runtime execution.",
      actorId: actor.id,
      operationId: input.operationId ?? requestId
    });
    this.releaseWaiters();
    return this.getSnapshot();
  }

  async step(body: unknown, actor: AppUserRecord, requestId: string): Promise<WorkflowDebuggerSnapshot> {
    const input = parseControlBody(body);
    this.stepAllowance += 1;
    this.state = "paused";
    this.append({
      eventType: "debug_step",
      severity: "debug",
      message: "Debugger advanced one runtime step.",
      actorId: actor.id,
      operationId: input.operationId ?? requestId
    });
    this.releaseWaiters();
    return this.getSnapshot();
  }

  getSnapshot(itemRef?: WorkflowDebuggerItemRef): WorkflowDebuggerSnapshot {
    const events = this.filterEvents(itemRef);
    const currentStep =
      this.currentStep === undefined || !eventMatchesItemRef(this.currentStep, itemRef) ? undefined : this.currentStep;
    return {
      state: this.state,
      stepMode: this.stepMode,
      ...(currentStep === undefined ? {} : { currentStep }),
      events,
      views: projectWorkflowEventViews(events)
    };
  }

  recordEvent(input: WorkflowDebuggerEventInput): WorkflowDebuggerEvent {
    return this.append(input);
  }

  async runtimeStep(input: WorkflowDebuggerEventInput): Promise<WorkflowDebuggerEvent> {
    const event = this.append({
      ...input,
      eventType: input.eventType === "" ? "runtime_step" : input.eventType
    });
    await this.waitForStep(event);
    return event;
  }

  private append(input: WorkflowDebuggerEventInput): WorkflowDebuggerEvent {
    const event: WorkflowDebuggerEvent = {
      eventId: randomUUID(),
      sequence: ++this.sequence,
      eventType: input.eventType,
      severity: input.severity,
      message: input.message,
      ...(input.itemRef === undefined ? {} : { itemRef: input.itemRef }),
      ...(input.operationId === undefined ? {} : { operationId: input.operationId }),
      ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
      ...(input.actionId === undefined ? {} : { actionId: input.actionId }),
      ...(input.transitionId === undefined ? {} : { transitionId: input.transitionId }),
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      occurredAt: new Date().toISOString()
    };
    this.currentStep = event;
    this.events.push(event);
    if (this.events.length > 500) {
      this.events.splice(0, this.events.length - 500);
    }
    return event;
  }

  private async waitForStep(event: WorkflowDebuggerEvent): Promise<void> {
    this.currentStep = event;
    if (this.currentState() === "stopped") {
      throw new HttpError(409, "workflow_debugger_stopped", "Debugger stopped runtime execution.", {
        operationId: event.operationId
      });
    }
    if (!this.stepMode && this.currentState() !== "paused") {
      return;
    }
    if (this.stepAllowance > 0) {
      this.stepAllowance -= 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push({ resolve });
    });
    if (this.currentState() === "stopped") {
      throw new HttpError(409, "workflow_debugger_stopped", "Debugger stopped runtime execution.", {
        operationId: event.operationId
      });
    }
    if (this.stepAllowance > 0) {
      this.stepAllowance -= 1;
    }
  }

  private releaseWaiters(): void {
    const pending = this.waiters.splice(0);
    for (const waiter of pending) {
      waiter.resolve();
    }
  }

  private filterEvents(itemRef: WorkflowDebuggerItemRef | undefined): WorkflowDebuggerEvent[] {
    if (itemRef === undefined) {
      return [...this.events];
    }
    return this.events.filter((event) => eventMatchesItemRef(event, itemRef));
  }

  private currentState(): WorkflowDebuggerSnapshot["state"] {
    return this.state;
  }
}

function parseControlBody(body: unknown): { stepMode: boolean; operationId?: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { stepMode: false };
  }
  const record = body as Record<string, unknown>;
  return {
    stepMode: record.stepMode === true,
    ...(typeof record.operationId === "string" && record.operationId.trim() !== ""
      ? { operationId: record.operationId.trim() }
      : {})
  };
}

function eventMatchesItemRef(event: WorkflowDebuggerEvent, itemRef: WorkflowDebuggerItemRef | undefined): boolean {
  if (itemRef === undefined) {
    return true;
  }
  return event.itemRef?.resourceType === itemRef.resourceType && event.itemRef.resourceId === itemRef.resourceId;
}

function projectWorkflowEventViews(events: WorkflowDebuggerEvent[]): WorkflowDebuggerViews {
  return {
    transitions: events.filter(
      (event) =>
        event.eventType === "transition_committed" ||
        event.eventType === "item_initiated" ||
        event.eventType === "item_initialized"
    ),
    actions: events.filter((event) => event.eventType.includes("action") || event.actionId !== undefined),
    handlers: events.filter((event) => event.eventType.startsWith("handler_")),
    handlerResponses: events.filter((event) => event.eventType === "handler_response_received"),
    recordEvents: events.filter((event) => event.eventType === "record_event" || event.eventType.includes("audit")),
    stateHooks: events.filter((event) => event.eventType.startsWith("state_hook_")),
    failures: events.filter(
      (event) =>
        event.severity === "error" || event.eventType.includes("failed") || event.eventType.includes("rejected")
    ),
    debugSteps: events.filter((event) => event.eventType.startsWith("debug_") || event.eventType === "runtime_step")
  };
}
