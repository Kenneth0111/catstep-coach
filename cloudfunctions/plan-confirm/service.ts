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
  status: 'pending' | 'in_progress' | 'completed';
  startRequestId?: string;
  startedAt?: string;
  completeRequestId?: string;
  completedAt?: string;
  difficultyFeedback?: 'easy' | 'just_right' | 'hard';
  resizeRequestId?: string;
  resizedAt?: string;
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
  processedRequestIds?: string[];
}

export interface ConfirmedDailyPlan extends PersistedDailyPlan {
  id: string;
}

export interface DailyPlanRepository {
  findActiveGoalIds(
    openid: string,
    goalIds: readonly string[],
  ): Promise<string[]>;
  createOrAppend(
    documentId: string,
    incoming: PersistedDailyPlan,
    merge: (current: PersistedDailyPlan) => PersistedDailyPlan,
  ): Promise<ConfirmedDailyPlan>;
}

export type PlanConfirmationCode = 'INVALID_CONTEXT' | 'LIMIT_REACHED';

export class PlanConfirmationError extends Error {
  constructor(readonly code: PlanConfirmationCode) {
    super(code);
    this.name = 'PlanConfirmationError';
  }
}

export type PlanConfirmationFailureStage =
  | 'find_active_goals'
  | 'persist_plan';

export class PlanConfirmationInternalError extends Error {
  constructor(readonly stage: PlanConfirmationFailureStage) {
    super(stage);
    this.name = 'PlanConfirmationInternalError';
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

function ensurePlanLimits(
  goalIds: Iterable<string>,
  taskCount: number,
): number {
  const goalCount = new Set(goalIds).size;
  if (goalCount > 3 || taskCount > 10) {
    throw new PlanConfirmationError('LIMIT_REACHED');
  }
  return goalCount;
}

export function mergeConfirmedPlan(
  documentId: string,
  current: PersistedDailyPlan,
  incoming: PersistedDailyPlan,
): PersistedDailyPlan {
  const processed = new Set(current.processedRequestIds ?? [current.requestId]);
  if (processed.has(incoming.requestId)) {
    return current;
  }

  const currentGoalIds = new Set(current.tasks.map((task) => task.goalId));
  const incomingGoalIds = new Set(incoming.tasks.map((task) => task.goalId));
  if ([...incomingGoalIds].every((goalId) => currentGoalIds.has(goalId))) {
    return current;
  }
  if ([...incomingGoalIds].some((goalId) => currentGoalIds.has(goalId))) {
    throw new PlanConfirmationError('INVALID_CONTEXT');
  }

  const taskCount = current.tasks.length + incoming.tasks.length;
  const goalCount = ensurePlanLimits(
    [...currentGoalIds, ...incomingGoalIds],
    taskCount,
  );

  const offset = current.tasks.length;
  return {
    ...current,
    availableMinutes: current.availableMinutes + incoming.availableMinutes,
    summary: `今天有 ${goalCount} 个目标，安排了 ${taskCount} 个小步。`,
    tasks: [
      ...current.tasks,
      ...incoming.tasks.map((task, index) => ({
        ...task,
        id: `${documentId}-${offset + index + 1}`,
        priority: offset + index + 1,
      })),
    ],
    processedRequestIds: [...processed, incoming.requestId],
  };
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
  let ownedGoalIds: Set<string>;
  try {
    ownedGoalIds = new Set(await repository.findActiveGoalIds(openid, goalIds));
  } catch (error) {
    if (error instanceof PlanConfirmationError) {
      throw error;
    }
    throw new PlanConfirmationInternalError('find_active_goals');
  }
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
    processedRequestIds: [input.requestId.trim()],
  } satisfies PersistedDailyPlan;

  ensurePlanLimits(
    persisted.tasks.map((task) => task.goalId),
    persisted.tasks.length,
  );

  try {
    return await repository.createOrAppend(documentId, persisted, (current) =>
      mergeConfirmedPlan(documentId, current, persisted),
    );
  } catch (error) {
    if (error instanceof PlanConfirmationError) {
      throw error;
    }
    throw new PlanConfirmationInternalError('persist_plan');
  }
}
