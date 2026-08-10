import { describe, expect, it, vi } from 'vitest';
import {
  PlanTaskUpdateError,
  updatePlanTask,
  type PlanTaskUpdateRepository,
  type StoredPlan,
} from '../cloudfunctions/plan-update-task/service';

function createPlan(): StoredPlan {
  return {
    id: 'plan-1',
    _openid: 'user-1',
    owner: 'user-1',
    date: '2026-08-11',
    availableMinutes: 30,
    summary: '先走一步。',
    tasks: [
      {
        id: 'task-1',
        title: '完成练习',
        action: '完成五道练习',
        estimatedMinutes: 30,
        doneCriteria: '五道练习通过',
        goalId: 'goal-1',
        reason: '巩固基础',
        difficulty: 'medium',
        priority: 1,
        status: 'pending',
      },
    ],
    status: 'confirmed',
    requestId: 'confirm-1',
    version: 1,
    createdAt: '2026-08-10T16:00:00.000Z',
  };
}

function createRepository(plan: StoredPlan | null = createPlan()) {
  const repository: PlanTaskUpdateRepository = {
    updateOwnedPlan: vi.fn(async (_openid, _planId, update) =>
      plan ? update(plan) : null,
    ),
  };
  return repository;
}

const now = () => new Date('2026-08-10T16:30:00.000Z');

describe('updatePlanTask', () => {
  it('starts a pending task with a server timestamp and request id', async () => {
    const repository = createRepository();

    const plan = await updatePlanTask(
      'user-1',
      { requestId: 'start-1', planId: 'plan-1', taskId: 'task-1', action: 'start' },
      repository,
      now,
    );

    expect(plan.tasks[0]).toMatchObject({
      status: 'in_progress',
      startRequestId: 'start-1',
      startedAt: now().toISOString(),
    });
    expect(repository.updateOwnedPlan).toHaveBeenCalledWith(
      'user-1',
      'plan-1',
      expect.any(Function),
    );
  });

  it('completes an in-progress task without replacing its recommended difficulty', async () => {
    const stored = createPlan();
    stored.tasks[0] = {
      ...stored.tasks[0],
      status: 'in_progress',
      startRequestId: 'start-1',
      startedAt: '2026-08-10T16:10:00.000Z',
    };

    const plan = await updatePlanTask(
      'user-1',
      {
        requestId: 'complete-1',
        planId: 'plan-1',
        taskId: 'task-1',
        action: 'complete',
        difficulty: 'just_right',
      },
      createRepository(stored),
      now,
    );

    expect(plan.tasks[0]).toMatchObject({
      status: 'completed',
      difficulty: 'medium',
      difficultyFeedback: 'just_right',
      completeRequestId: 'complete-1',
      completedAt: now().toISOString(),
    });
  });

  it.each([
    { action: 'complete', difficulty: 'easy' },
    { action: 'start', difficulty: 'easy' },
    { action: 'complete', difficulty: undefined },
    { action: 'complete', difficulty: 'medium' },
  ])('rejects invalid transitions or difficulty: %j', async (candidate) => {
    await expect(
      updatePlanTask(
        'user-1',
        {
          requestId: 'request-1',
          planId: 'plan-1',
          taskId: 'task-1',
          ...candidate,
        },
        createRepository(),
        now,
      ),
    ).rejects.toEqual(new PlanTaskUpdateError('INVALID_CONTEXT'));
  });

  it('rejects a foreign or unknown plan and an unknown task', async () => {
    const foreign = createPlan();
    foreign._openid = 'user-2';
    foreign.owner = 'user-2';

    await expect(
      updatePlanTask(
        'user-1',
        { requestId: 'start-1', planId: 'plan-1', taskId: 'task-1', action: 'start' },
        createRepository(null),
        now,
      ),
    ).rejects.toEqual(new PlanTaskUpdateError('INVALID_CONTEXT'));
    await expect(
      updatePlanTask(
        'user-1',
        { requestId: 'start-1', planId: 'plan-1', taskId: 'missing', action: 'start' },
        createRepository(foreign),
        now,
      ),
    ).rejects.toEqual(new PlanTaskUpdateError('INVALID_CONTEXT'));
  });

  it('replays the original start and completion request ids idempotently', async () => {
    const completed = createPlan();
    completed.tasks[0] = {
      ...completed.tasks[0],
      status: 'completed',
      startRequestId: 'start-1',
      startedAt: '2026-08-10T16:10:00.000Z',
      completeRequestId: 'complete-1',
      completedAt: '2026-08-10T16:20:00.000Z',
      difficultyFeedback: 'hard',
    };

    const startReplay = await updatePlanTask(
      'user-1',
      { requestId: 'start-1', planId: 'plan-1', taskId: 'task-1', action: 'start' },
      createRepository(completed),
      now,
    );
    const completeReplay = await updatePlanTask(
      'user-1',
      {
        requestId: 'complete-1',
        planId: 'plan-1',
        taskId: 'task-1',
        action: 'complete',
        difficulty: 'hard',
      },
      createRepository(completed),
      now,
    );

    expect(startReplay).toEqual(completed);
    expect(completeReplay).toEqual(completed);
  });
});
