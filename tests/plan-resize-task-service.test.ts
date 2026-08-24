import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../cloudfunctions/shared/ai-provider';
import {
  resizeOwnedTask,
  type PlanResizeRepository,
  type StoredResizablePlan,
} from '../cloudfunctions/plan-resize-task/service';

function createPlan(): StoredResizablePlan {
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
        title: '完成类型练习',
        action: '完成五道类型练习',
        estimatedMinutes: 30,
        doneCriteria: '五道练习全部通过',
        goalId: 'goal-1',
        reason: '巩固基础类型',
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

function repository(plan = createPlan()): PlanResizeRepository {
  return {
    async updateOwnedPlan(_openid, _planId, update) {
      return update(plan);
    },
  };
}

describe('resizeOwnedTask', () => {
  it('replaces an owned pending task with a shorter same-goal task', async () => {
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => ({
        title: '完成一道类型练习',
        action: '完成一道类型练习并记录错题',
        estimatedMinutes: 10,
        doneCriteria: '一道练习通过并写下一个错因',
        reason: '先降低启动成本',
        difficulty: 'easy',
      })),
    };

    const result = await resizeOwnedTask(
      'user-1',
      { requestId: 'resize-1', planId: 'plan-1', taskId: 'task-1', reason: '现在时间不够' },
      repository(),
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );

    expect(result.source).toBe('ai');
    expect(result.plan.tasks[0]).toMatchObject({
      goalId: 'goal-1',
      estimatedMinutes: 10,
      difficulty: 'easy',
      resizeRequestId: 'resize-1',
      resizedAt: '2026-08-11T12:00:00.000Z',
      resizeSource: 'ai',
    });
    expect(provider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ workflow: 'resizeTask' }),
    );
  });

  it('replays a resize without claiming quota or calling the provider', async () => {
    const plan = createPlan();
    plan.tasks[0] = {
      ...plan.tasks[0],
      estimatedMinutes: 10,
      resizeRequestId: 'resize-1',
      resizedAt: '2026-08-11T11:55:00.000Z',
      resizeSource: 'ai',
    };
    const provider: AIProvider = { generateStructured: vi.fn() };
    const createProvider = vi.fn(() => provider);
    const claimQuota = vi.fn(async () => undefined);

    const result = await resizeOwnedTask(
      'user-1',
      { requestId: 'resize-1', planId: 'plan-1', taskId: 'task-1' },
      repository(plan),
      createProvider,
      () => new Date('2026-08-11T12:00:00.000Z'),
      claimQuota,
    );

    expect(result).toMatchObject({ source: 'ai', plan });
    expect(claimQuota).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });

  it('replays a legacy resize with the rule source', async () => {
    const plan = createPlan();
    plan.tasks[0] = {
      ...plan.tasks[0],
      resizeRequestId: 'resize-1',
      resizedAt: '2026-08-11T11:55:00.000Z',
    };
    const createProvider = vi.fn<() => AIProvider>();
    const claimQuota = vi.fn(async () => undefined);

    const result = await resizeOwnedTask(
      'user-1',
      { requestId: 'resize-1', planId: 'plan-1', taskId: 'task-1' },
      repository(plan),
      createProvider,
      () => new Date('2026-08-11T12:00:00.000Z'),
      claimQuota,
    );

    expect(result.source).toBe('rule');
    expect(claimQuota).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('stores the fallback source when the provider fails', async () => {
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => {
        throw new Error('provider unavailable');
      }),
    };

    const result = await resizeOwnedTask(
      'user-1',
      { requestId: 'resize-1', planId: 'plan-1', taskId: 'task-1' },
      repository(),
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );

    expect(result).toMatchObject({
      source: 'fallback',
      plan: { tasks: [{ resizeSource: 'fallback' }] },
    });
  });

  it('replays the winning resize when concurrent calls share a request id', async () => {
    let storedPlan = createPlan();
    const concurrentRepository: PlanResizeRepository = {
      async updateOwnedPlan(_openid, _planId, update) {
        storedPlan = update(storedPlan);
        return storedPlan;
      },
    };
    const resolvers: Array<(value: unknown) => void> = [];
    const provider: AIProvider = {
      generateStructured: vi.fn(
        () =>
          new Promise<unknown>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    };
    const input = { requestId: 'resize-1', planId: 'plan-1', taskId: 'task-1' };
    const first = resizeOwnedTask(
      'user-1',
      input,
      concurrentRepository,
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );
    const second = resizeOwnedTask(
      'user-1',
      input,
      concurrentRepository,
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );
    await vi.waitFor(() => expect(provider.generateStructured).toHaveBeenCalledTimes(2));

    resolvers[0]({
      title: '完成一道类型练习',
      action: '完成一道类型练习并记录错题',
      estimatedMinutes: 10,
      doneCriteria: '一道练习通过并写下一个错因',
      reason: '先降低启动成本',
      difficulty: 'easy',
    });
    const firstResult = await first;
    resolvers[1]({});
    const secondResult = await second;

    expect(firstResult).toMatchObject({ source: 'ai' });
    expect(secondResult).toEqual(firstResult);
  });

  it('replays a concurrent resize after the winning task is completed', async () => {
    let storedPlan = createPlan();
    const concurrentRepository: PlanResizeRepository = {
      async updateOwnedPlan(_openid, _planId, update) {
        storedPlan = update(storedPlan);
        return storedPlan;
      },
    };
    const resolvers: Array<(value: unknown) => void> = [];
    const provider: AIProvider = {
      generateStructured: vi.fn(
        () =>
          new Promise<unknown>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    };
    const input = { requestId: 'resize-1', planId: 'plan-1', taskId: 'task-1' };
    const first = resizeOwnedTask(
      'user-1',
      input,
      concurrentRepository,
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );
    const second = resizeOwnedTask(
      'user-1',
      input,
      concurrentRepository,
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );
    await vi.waitFor(() => expect(provider.generateStructured).toHaveBeenCalledTimes(2));

    resolvers[0]({
      title: '完成一道类型练习',
      action: '完成一道类型练习并记录错题',
      estimatedMinutes: 10,
      doneCriteria: '一道练习通过并写下一个错因',
      reason: '先降低启动成本',
      difficulty: 'easy',
    });
    const firstResult = await first;
    storedPlan.tasks[0] = { ...storedPlan.tasks[0], status: 'completed' };
    resolvers[1]({});

    await expect(second).resolves.toMatchObject({
      source: 'ai',
      plan: { tasks: [{ status: 'completed', resizeRequestId: 'resize-1' }] },
    });
    expect(firstResult.source).toBe('ai');
  });

  it('rejects a stale candidate after another resize updates the task', async () => {
    const plan = createPlan();
    let resolveCandidate: (value: unknown) => void = () => undefined;
    const candidate = new Promise<unknown>((resolve) => {
      resolveCandidate = resolve;
    });
    const provider: AIProvider = {
      generateStructured: vi.fn(() => candidate),
    };

    const resizeA = resizeOwnedTask(
      'user-1',
      { requestId: 'resize-a', planId: 'plan-1', taskId: 'task-1' },
      repository(plan),
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );
    await vi.waitFor(() => expect(provider.generateStructured).toHaveBeenCalledOnce());

    plan.tasks[0] = {
      ...plan.tasks[0],
      estimatedMinutes: 5,
      resizeRequestId: 'resize-b',
      resizedAt: '2026-08-11T12:01:00.000Z',
      resizeSource: 'ai',
    };
    resolveCandidate({
      title: '完成一道类型练习',
      action: '完成一道类型练习并记录错题',
      estimatedMinutes: 10,
      doneCriteria: '一道练习通过并写下一个错因',
      reason: '先降低启动成本',
      difficulty: 'easy',
    });

    await expect(resizeA).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });
    expect(plan.tasks[0]).toMatchObject({
      estimatedMinutes: 5,
      resizeRequestId: 'resize-b',
      resizedAt: '2026-08-11T12:01:00.000Z',
    });
  });

  it('rejects a candidate that is no longer shorter than the latest task', async () => {
    const plan = createPlan();
    let resolveCandidate: (value: unknown) => void = () => undefined;
    const candidate = new Promise<unknown>((resolve) => {
      resolveCandidate = resolve;
    });
    const provider: AIProvider = {
      generateStructured: vi.fn(() => candidate),
    };

    const resize = resizeOwnedTask(
      'user-1',
      { requestId: 'resize-1', planId: 'plan-1', taskId: 'task-1' },
      repository(plan),
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );
    await vi.waitFor(() => expect(provider.generateStructured).toHaveBeenCalledOnce());

    plan.tasks[0] = { ...plan.tasks[0], estimatedMinutes: 5 };
    resolveCandidate({
      title: '完成一道类型练习',
      action: '完成一道类型练习并记录错题',
      estimatedMinutes: 10,
      doneCriteria: '一道练习通过并写下一个错因',
      reason: '先降低启动成本',
      difficulty: 'easy',
    });

    await expect(resize).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });
    expect(plan.tasks[0]).toMatchObject({ estimatedMinutes: 5 });
  });

  it('rejects a different resize request after the task is completed', async () => {
    const plan = createPlan();
    let resolveCandidate: (value: unknown) => void = () => undefined;
    const candidate = new Promise<unknown>((resolve) => {
      resolveCandidate = resolve;
    });
    const provider: AIProvider = {
      generateStructured: vi.fn(() => candidate),
    };

    const resize = resizeOwnedTask(
      'user-1',
      { requestId: 'resize-a', planId: 'plan-1', taskId: 'task-1' },
      repository(plan),
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );
    await vi.waitFor(() => expect(provider.generateStructured).toHaveBeenCalledOnce());

    plan.tasks[0] = {
      ...plan.tasks[0],
      status: 'completed',
      resizeRequestId: 'resize-b',
    };
    resolveCandidate({
      title: '完成一道类型练习',
      action: '完成一道类型练习并记录错题',
      estimatedMinutes: 10,
      doneCriteria: '一道练习通过并写下一个错因',
      reason: '先降低启动成本',
      difficulty: 'easy',
    });

    await expect(resize).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });
  });

  it('resizes an in-progress task while preserving its execution metadata', async () => {
    const plan = createPlan();
    plan.tasks[0] = {
      ...plan.tasks[0],
      status: 'in_progress',
      startRequestId: 'start-1',
      startedAt: '2026-08-11T11:55:00.000Z',
    };
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => ({
        title: '完成一道类型练习',
        action: '完成一道类型练习并记录错题',
        estimatedMinutes: 10,
        doneCriteria: '一道练习通过并写下一个错因',
        reason: '先降低启动成本',
        difficulty: 'easy',
      })),
    };

    const result = await resizeOwnedTask(
      'user-1',
      { requestId: 'resize-1', planId: 'plan-1', taskId: 'task-1' },
      repository(plan),
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );

    expect(result.plan.tasks[0]).toMatchObject({
      estimatedMinutes: 10,
      status: 'in_progress',
      startRequestId: 'start-1',
      startedAt: '2026-08-11T11:55:00.000Z',
    });
  });

  it('keeps protected task fields when an AI candidate includes extra fields', async () => {
    const plan = createPlan();
    plan.tasks[0] = {
      ...plan.tasks[0],
      status: 'in_progress',
      startRequestId: 'start-1',
      startedAt: '2026-08-11T11:55:00.000Z',
    };
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => ({
        id: 'replacement-id',
        title: '完成一道类型练习',
        action: '完成一道类型练习并记录错题',
        estimatedMinutes: 10,
        doneCriteria: '一道练习通过并写下一个错因',
        goalId: 'goal-2',
        reason: '先降低启动成本',
        difficulty: 'easy',
        priority: 99,
        status: 'completed',
        startRequestId: 'replacement-start',
        startedAt: '2026-08-11T12:00:00.000Z',
        completeRequestId: 'replacement-complete',
        completedAt: '2026-08-11T12:00:00.000Z',
      })),
    };

    const result = await resizeOwnedTask(
      'user-1',
      { requestId: 'resize-1', planId: 'plan-1', taskId: 'task-1' },
      repository(plan),
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );

    expect(result.plan.tasks[0]).toMatchObject({
      id: 'task-1',
      goalId: 'goal-1',
      priority: 1,
      status: 'in_progress',
      startRequestId: 'start-1',
      startedAt: '2026-08-11T11:55:00.000Z',
    });
    expect(result.plan.tasks[0]).not.toHaveProperty('completeRequestId');
    expect(result.plan.tasks[0]).not.toHaveProperty('completedAt');
  });

  it('moves an owned pending task to the end without calling the model', async () => {
    const plan = createPlan();
    plan.tasks.push({
      ...plan.tasks[0],
      id: 'task-2',
      title: '整理错题',
      priority: 2,
    });
    const createProvider = vi.fn<() => AIProvider>();

    const result = await resizeOwnedTask(
      'user-1',
      { requestId: 'move-1', planId: 'plan-1', taskId: 'task-1', action: 'move_to_end' },
      repository(plan),
      createProvider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );

    expect(result.source).toBe('rule');
    expect(result.plan.tasks[0]?.priority).toBe(3);
    expect(result.plan.tasks[0]?.resizeSource).toBe('rule');
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('replays move_to_end after a winning move completes the task', async () => {
    let storedPlan = createPlan();
    let updateCount = 0;
    const concurrentRepository: PlanResizeRepository = {
      async updateOwnedPlan(_openid, _planId, update) {
        updateCount += 1;
        if (updateCount === 2) {
          storedPlan.tasks[0] = {
            ...storedPlan.tasks[0],
            status: 'completed',
            resizeRequestId: 'move-1',
            resizedAt: '2026-08-11T12:01:00.000Z',
            resizeSource: 'rule',
          };
        }
        storedPlan = update(storedPlan);
        return storedPlan;
      },
    };

    await expect(
      resizeOwnedTask(
        'user-1',
        { requestId: 'move-1', planId: 'plan-1', taskId: 'task-1', action: 'move_to_end' },
        concurrentRepository,
        vi.fn<() => AIProvider>(),
        () => new Date('2026-08-11T12:00:00.000Z'),
      ),
    ).resolves.toMatchObject({
      source: 'rule',
      plan: { tasks: [{ status: 'completed', resizeRequestId: 'move-1' }] },
    });
  });

  it('rejects moving an in-progress task to the end', async () => {
    const plan = createPlan();
    plan.tasks[0] = { ...plan.tasks[0], status: 'in_progress' };

    await expect(
      resizeOwnedTask(
        'user-1',
        { requestId: 'move-1', planId: 'plan-1', taskId: 'task-1', action: 'move_to_end' },
        repository(plan),
        vi.fn<() => AIProvider>(),
        () => new Date('2026-08-11T12:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });
  });

  it('moves a task to the end of its own goal without changing another goal priorities', async () => {
    const plan = createPlan();
    plan.tasks.push(
      {
        ...plan.tasks[0],
        id: 'task-2',
        title: '同目标后续任务',
        priority: 4,
      },
      {
        ...plan.tasks[0],
        id: 'task-3',
        goalId: 'goal-2',
        title: '另一目标任务',
        priority: 99,
      },
    );

    const result = await resizeOwnedTask(
      'user-1',
      { requestId: 'move-1', planId: 'plan-1', taskId: 'task-1', action: 'move_to_end' },
      repository(plan),
      vi.fn<() => AIProvider>(),
      () => new Date('2026-08-11T12:00:00.000Z'),
    );

    expect(result.plan.tasks).toMatchObject([
      { id: 'task-1', goalId: 'goal-1', priority: 5 },
      { id: 'task-2', goalId: 'goal-1', priority: 4 },
      { id: 'task-3', goalId: 'goal-2', priority: 99 },
    ]);
  });
});
