import type { ConfirmedDailyPlan, PersistedDailyPlanTask } from '../plan-confirm/service';

export type TaskAction = 'start' | 'complete';
export type DifficultyFeedback = 'easy' | 'just_right' | 'hard';

export interface PlanTaskUpdateInput {
  requestId: string;
  planId: string;
  taskId: string;
  action: TaskAction;
  difficulty?: DifficultyFeedback;
}

export interface StoredPlanTask extends Omit<PersistedDailyPlanTask, 'status'> {
  status: 'pending' | 'in_progress' | 'completed';
  startRequestId?: string;
  startedAt?: string;
  completeRequestId?: string;
  completedAt?: string;
  difficultyFeedback?: DifficultyFeedback;
}

export interface StoredPlan extends Omit<ConfirmedDailyPlan, 'tasks'> {
  tasks: StoredPlanTask[];
}

export interface PublicPlanTask {
  id: string;
  title: string;
  action: string;
  estimatedMinutes: number;
  doneCriteria: string;
  goalId: string;
  reason: string;
  difficulty: 'easy' | 'medium' | 'hard';
  priority: number;
  status: 'pending' | 'in_progress' | 'completed';
  difficultyFeedback?: DifficultyFeedback;
}

export interface PublicPlan {
  id: string;
  date: string;
  availableMinutes: number;
  summary: string;
  tasks: PublicPlanTask[];
}

export interface PlanTaskUpdateRepository {
  updateOwnedPlan(
    openid: string,
    planId: string,
    update: (plan: StoredPlan) => StoredPlan,
  ): Promise<StoredPlan | null>;
}

export class PlanTaskUpdateError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'PlanTaskUpdateError';
  }
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isDifficulty(value: unknown): value is DifficultyFeedback {
  return value === 'easy' || value === 'just_right' || value === 'hard';
}

function isInput(value: unknown): value is PlanTaskUpdateInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const input = value as Record<string, unknown>;
  if (
    !isText(input.requestId) ||
    input.requestId.trim().length > 128 ||
    !isText(input.planId) ||
    !isText(input.taskId) ||
    (input.action !== 'start' && input.action !== 'complete')
  ) {
    return false;
  }
  return input.action === 'complete'
    ? isDifficulty(input.difficulty)
    : input.difficulty === undefined;
}

function updateTask(
  plan: StoredPlan,
  input: PlanTaskUpdateInput,
  timestamp: string,
): StoredPlan {
  const taskIndex = plan.tasks.findIndex((task) => task.id === input.taskId);
  if (taskIndex < 0) {
    throw new PlanTaskUpdateError('INVALID_CONTEXT');
  }
  const task = plan.tasks[taskIndex];
  const requestId = input.requestId.trim();

  if (
    (input.action === 'start' && task.startRequestId === requestId) ||
    (input.action === 'complete' && task.completeRequestId === requestId)
  ) {
    return plan;
  }

  let updatedTask: StoredPlanTask;
  if (input.action === 'start' && task.status === 'pending') {
    updatedTask = {
      ...task,
      status: 'in_progress',
      startRequestId: requestId,
      startedAt: timestamp,
    };
  } else if (input.action === 'complete' && task.status === 'in_progress') {
    updatedTask = {
      ...task,
      status: 'completed',
      completeRequestId: requestId,
      completedAt: timestamp,
      difficultyFeedback: input.difficulty,
    };
  } else {
    throw new PlanTaskUpdateError('INVALID_CONTEXT');
  }

  return {
    ...plan,
    tasks: plan.tasks.map((candidate, index) =>
      index === taskIndex ? updatedTask : candidate,
    ),
  };
}

export function toPublicPlan(plan: StoredPlan): PublicPlan {
  return {
    id: plan.id,
    date: plan.date,
    availableMinutes: plan.availableMinutes,
    summary: plan.summary,
    tasks: plan.tasks.map(({ difficultyFeedback, ...task }) => ({
      id: task.id,
      title: task.title,
      action: task.action,
      estimatedMinutes: task.estimatedMinutes,
      doneCriteria: task.doneCriteria,
      goalId: task.goalId,
      reason: task.reason,
      difficulty: task.difficulty,
      priority: task.priority,
      status: task.status,
      ...(difficultyFeedback ? { difficultyFeedback } : {}),
    })),
  };
}

export async function updatePlanTask(
  openid: string,
  input: unknown,
  repository: PlanTaskUpdateRepository,
  now: () => Date,
): Promise<StoredPlan> {
  if (!isText(openid) || !isInput(input)) {
    throw new PlanTaskUpdateError('INVALID_CONTEXT');
  }

  const timestamp = now().toISOString();
  const plan = await repository.updateOwnedPlan(
    openid,
    input.planId.trim(),
    (storedPlan) => updateTask(storedPlan, input, timestamp),
  );
  if (!plan) {
    throw new PlanTaskUpdateError('INVALID_CONTEXT');
  }
  return plan;
}
