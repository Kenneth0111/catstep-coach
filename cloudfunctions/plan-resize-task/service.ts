import type { AIProvider } from '../shared/ai-provider';

type Difficulty = 'easy' | 'medium' | 'hard';

export interface StoredResizableTask {
  id: string;
  title: string;
  action: string;
  estimatedMinutes: number;
  doneCriteria: string;
  goalId: string;
  reason: string;
  difficulty: Difficulty;
  priority: number;
  status: 'pending' | 'in_progress' | 'completed';
  resizeRequestId?: string;
  resizedAt?: string;
}

export interface StoredResizablePlan {
  id: string;
  _openid: string;
  owner: string;
  date: string;
  availableMinutes: number;
  summary: string;
  tasks: StoredResizableTask[];
  status: 'confirmed';
  requestId: string;
  version: number;
  createdAt: string;
}

export interface PlanResizeRepository {
  updateOwnedPlan(
    openid: string,
    planId: string,
    update: (plan: StoredResizablePlan) => StoredResizablePlan,
  ): Promise<StoredResizablePlan | null>;
}

export interface PlanResizeInput {
  requestId: string;
  planId: string;
  taskId: string;
  action?: 'resize' | 'move_to_end';
  reason?: string;
}

export interface PlanResizeResult {
  source: 'ai' | 'fallback' | 'rule';
  plan: StoredResizablePlan;
}

export class PlanResizeError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'PlanResizeError';
  }
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isInput(value: unknown): value is PlanResizeInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const input = value as Record<string, unknown>;
  return (
    isText(input.requestId) &&
    input.requestId.trim().length <= 128 &&
    isText(input.planId) &&
    isText(input.taskId) &&
    (input.action === undefined ||
      input.action === 'resize' ||
      input.action === 'move_to_end') &&
    (input.reason === undefined ||
      (isText(input.reason) && input.reason.trim().length <= 240))
  );
}

function isCandidate(
  value: unknown,
  original: StoredResizableTask,
): value is Omit<StoredResizableTask, 'id' | 'goalId' | 'priority' | 'status'> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const task = value as Record<string, unknown>;
  return (
    isText(task.title) &&
    isText(task.action) &&
    Number.isInteger(task.estimatedMinutes) &&
    (task.estimatedMinutes as number) > 0 &&
    (task.estimatedMinutes as number) < original.estimatedMinutes &&
    isText(task.doneCriteria) &&
    isText(task.reason) &&
    (task.difficulty === 'easy' ||
      task.difficulty === 'medium' ||
      task.difficulty === 'hard')
  );
}

function fallbackTask(original: StoredResizableTask): Omit<
  StoredResizableTask,
  'id' | 'goalId' | 'priority' | 'status'
> {
  const minutes = Math.max(1, Math.ceil(original.estimatedMinutes / 2));
  return {
    title: `缩小：${original.title}`,
    action: `只完成原任务中最容易开始的一个小步骤：${original.action}`,
    estimatedMinutes: minutes,
    doneCriteria: `在 ${minutes} 分钟内完成一个可见的小步骤，并记录下一步。`,
    reason: '先缩小任务，降低重新开始的门槛。',
    difficulty: 'easy',
  };
}

export async function resizeOwnedTask(
  openid: string,
  input: unknown,
  repository: PlanResizeRepository,
  createProvider: () => AIProvider,
  now: () => Date,
  claimQuota: () => Promise<void> = async () => undefined,
): Promise<PlanResizeResult> {
  if (!isText(openid) || !isInput(input)) {
    throw new PlanResizeError('INVALID_CONTEXT');
  }

  let source: PlanResizeResult['source'] = 'fallback';
  const plan = await repository.updateOwnedPlan(
    openid,
    input.planId.trim(),
    (storedPlan) => {
      const taskIndex = storedPlan.tasks.findIndex(
        (task) => task.id === input.taskId.trim(),
      );
      const original = storedPlan.tasks[taskIndex];
      if (!original || original.status !== 'pending') {
        throw new PlanResizeError('INVALID_CONTEXT');
      }
      if (original.resizeRequestId === input.requestId.trim()) {
        return storedPlan;
      }

      return storedPlan;
    },
  );
  if (!plan) {
    throw new PlanResizeError('INVALID_CONTEXT');
  }

  const original = plan.tasks.find((task) => task.id === input.taskId.trim());
  if (!original || original.status !== 'pending') {
    throw new PlanResizeError('INVALID_CONTEXT');
  }
  if (input.action === 'move_to_end') {
    const updatedPlan = await repository.updateOwnedPlan(
      openid,
      input.planId.trim(),
      (storedPlan) => {
        const task = storedPlan.tasks.find(
          (candidate) => candidate.id === input.taskId.trim(),
        );
        if (!task || task.status !== 'pending') {
          throw new PlanResizeError('INVALID_CONTEXT');
        }
        if (task.resizeRequestId === input.requestId.trim()) {
          return storedPlan;
        }
        return {
          ...storedPlan,
          tasks: storedPlan.tasks.map((candidate) =>
            candidate.id === task.id
              ? {
                  ...candidate,
                  priority: Math.max(...storedPlan.tasks.map((item) => item.priority)) + 1,
                  resizeRequestId: input.requestId.trim(),
                  resizedAt: now().toISOString(),
                }
              : candidate,
          ),
        };
      },
    );
    if (!updatedPlan) {
      throw new PlanResizeError('INVALID_CONTEXT');
    }
    return { source: 'rule', plan: updatedPlan };
  }
  let replacement = fallbackTask(original);
  await claimQuota();
  try {
    const candidate = await createProvider().generateStructured({
      workflow: 'resizeTask',
      promptVersion: 'resize-task-v1',
      input: { task: original, reason: input.reason?.trim() },
    });
    if (isCandidate(candidate, original)) {
      replacement = candidate;
      source = 'ai';
    }
  } catch {
    // The deterministic fallback keeps task adjustment usable offline.
  }

  const updatedPlan = await repository.updateOwnedPlan(
    openid,
    input.planId.trim(),
    (storedPlan) => {
      const task = storedPlan.tasks.find(
        (candidate) => candidate.id === input.taskId.trim(),
      );
      if (!task || task.status !== 'pending') {
        throw new PlanResizeError('INVALID_CONTEXT');
      }
      if (task.resizeRequestId === input.requestId.trim()) {
        return storedPlan;
      }
      return {
        ...storedPlan,
        tasks: storedPlan.tasks.map((candidate) =>
          candidate.id === task.id
            ? {
                ...candidate,
                ...replacement,
                resizeRequestId: input.requestId.trim(),
                resizedAt: now().toISOString(),
              }
            : candidate,
        ),
      };
    },
  );
  if (!updatedPlan) {
    throw new PlanResizeError('INVALID_CONTEXT');
  }
  return { source, plan: updatedPlan };
}
