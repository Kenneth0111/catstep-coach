import { createHash } from 'node:crypto';
import {
  DailyPlanValidationError,
  validateDailyPlanStructure,
  type DailyPlan,
  type DailyPlanTask,
} from '../shared/daily-plan';

export interface PlanConfirmationInput {
  requestId: string;
  availableMinutes: number;
  plan: DailyPlan;
}

export interface PersistedDailyPlanTask extends DailyPlanTask {
  id: string;
  priority: number;
  status: 'pending';
}

export interface PersistedDailyPlan {
  _openid: string;
  owner: string;
  date: string;
  availableMinutes: number;
  summary: string;
  tasks: PersistedDailyPlanTask[];
  status: 'confirmed';
  requestId: string;
  version: 1;
  createdAt: string;
}

export interface ConfirmedDailyPlan extends PersistedDailyPlan {
  id: string;
}

export interface DailyPlanRepository {
  findActiveGoalIds(
    openid: string,
    goalIds: readonly string[],
  ): Promise<string[]>;
  saveIfAbsent(
    documentId: string,
    plan: PersistedDailyPlan,
  ): Promise<ConfirmedDailyPlan>;
}

export class PlanConfirmationError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'PlanConfirmationError';
  }
}

const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isConfirmationInput(value: unknown): value is PlanConfirmationInput {
  return (
    isRecord(value) &&
    isText(value.requestId) &&
    value.requestId.trim().length <= 128 &&
    Number.isInteger(value.availableMinutes) &&
    (value.availableMinutes as number) > 0 &&
    isRecord(value.plan)
  );
}

function getGoalIds(plan: unknown): string[] {
  if (!isRecord(plan) || !Array.isArray(plan.tasks)) {
    return [];
  }
  const ids = plan.tasks.flatMap((task) =>
    isRecord(task) && isText(task.goalId) ? [task.goalId] : [],
  );
  return [...new Set(ids)];
}

export function createPlanDocumentId(openid: string, date: string): string {
  return createHash('sha256')
    .update(openid)
    .update('\0')
    .update(date)
    .digest('hex')
    .slice(0, 32);
}

export async function confirmDailyPlan(
  openid: string,
  input: unknown,
  repository: DailyPlanRepository,
  now: () => Date,
): Promise<ConfirmedDailyPlan> {
  if (!isText(openid) || !isConfirmationInput(input)) {
    throw new PlanConfirmationError('INVALID_CONTEXT');
  }

  const goalIds = getGoalIds(input.plan);
  let plan: DailyPlan;
  try {
    plan = validateDailyPlanStructure(input.plan, {
      availableMinutes: input.availableMinutes,
      goalIds,
    });
  } catch (error) {
    if (error instanceof DailyPlanValidationError) {
      throw new PlanConfirmationError('INVALID_CONTEXT');
    }
    throw error;
  }

  const currentTime = now();
  const date = shanghaiDate.format(currentTime);
  const ownedGoalIds = new Set(
    await repository.findActiveGoalIds(openid, goalIds),
  );
  if (goalIds.some((goalId) => !ownedGoalIds.has(goalId))) {
    throw new PlanConfirmationError('INVALID_CONTEXT');
  }

  const documentId = createPlanDocumentId(openid, date);
  const persisted = {
    _openid: openid,
    owner: openid,
    date,
    availableMinutes: input.availableMinutes,
    summary: plan.summary,
    tasks: plan.tasks.map((task, index) => ({
      title: task.title,
      action: task.action,
      estimatedMinutes: task.estimatedMinutes,
      doneCriteria: task.doneCriteria,
      goalId: task.goalId,
      reason: task.reason,
      difficulty: task.difficulty,
      id: `${documentId}-${index + 1}`,
      priority: index + 1,
      status: 'pending' as const,
    })),
    status: 'confirmed',
    requestId: input.requestId.trim(),
    version: 1,
    createdAt: currentTime.toISOString(),
  } satisfies PersistedDailyPlan;

  return repository.saveIfAbsent(documentId, persisted);
}
