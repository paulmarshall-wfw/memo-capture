import type { Queryable } from "../db/types.js";
import { ProcessingJobRepository } from "../repositories/jobs.js";
import { WorkflowRepository } from "../repositories/workflows.js";
import type { WorkItemRecord } from "../repositories/work-items.js";
import { WorkflowRuntimeAdapter, type WorkflowHookSchedule } from "./workflow-runtime.js";

export const NOMINATE_TAGS_JOB_KIND = "nominate_tags";
const NOMINATE_TAGS_HANDLER_KEY = "nominate_tags";

export class WorkflowHookScheduler {
  private readonly runtime = new WorkflowRuntimeAdapter();

  constructor(private readonly client: Queryable) {}

  async scheduleStateResidentHooksForWorkItem(input: {
    workItem: WorkItemRecord;
    actorUserId: string | null;
    now?: Date;
  }): Promise<string[]> {
    const active = await new WorkflowRepository(this.client).getActive();
    if (active === null) {
      return [];
    }

    const now = input.now ?? new Date();
    const jobs = new ProcessingJobRepository(this.client);
    const scheduledJobIds: string[] = [];
    const hooks = this.runtime
      .getStateResidentHooks(active.bundle, input.workItem.workflowState)
      .filter((hook): hook is typeof hook & { schedule: WorkflowHookSchedule } =>
        hook.handlerKey === NOMINATE_TAGS_HANDLER_KEY && hook.schedule !== null
      );

    for (const hook of hooks) {
      const job = await jobs.create({
        jobKind: NOMINATE_TAGS_JOB_KIND,
        sourceMemoId: input.workItem.sourceMemoId,
        workItemId: input.workItem.id,
        maxAttempts: 3,
        initiatedBy: input.actorUserId,
        runAfter: dueAtForSchedule(hook.schedule, now)
      });
      scheduledJobIds.push(job.id);
    }

    return scheduledJobIds;
  }

  async cancelPendingNominationJobs(workItemId: string): Promise<number> {
    return new ProcessingJobRepository(this.client).cancelPendingWorkItemJobs({
      workItemId,
      jobKind: NOMINATE_TAGS_JOB_KIND
    });
  }
}

function dueAtForSchedule(schedule: WorkflowHookSchedule, now: Date): Date {
  const delayMs = schedule.trigger === "after_duration" ? schedule.delayMs : schedule.intervalMs;
  return new Date(now.getTime() + (delayMs ?? 0));
}
