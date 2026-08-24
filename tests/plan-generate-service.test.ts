import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../cloudfunctions/shared/ai-provider';
import {
  PlanGenerationServiceError,
  generateOwnedDailyPlan,
  type OwnedGoalRepository,
} from '../cloudfunctions/plan-generate/service';

const validPlan = {
  summary: '先完成一个明确的小步骤。',
  tasks: [
    {
      title: '完成类型练习',
      action: '完成五道 TypeScript 类型练习',
      estimatedMinutes: 30,
      doneCriteria: '五道练习全部通过',
      goalId: 'goal-1',
      reason: '巩固基础类型',
      difficulty: 'medium',
    },
  ],
};

function repository(
  ids: string[],
  capacity: { goalIds: string[]; taskCount: number } | null = null,
): OwnedGoalRepository {
  return {
    async findActiveByIds() {
      return ids.map((id) => ({
        id,
        title: '完成 TypeScript 入门练习',
        successCriteria: '完成五道类型练习并全部通过',
        currentProgress: '已学习基础类型',
        stage: '巩固基础类型',
      }));
    },
    async getTodayCapacity() {
      return capacity;
    },
  };
}

describe('generateOwnedDailyPlan', () => {
  it('generates a plan after every goal is verified for the owner', async () => {
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => validPlan),
    };
    const createProvider = vi.fn(() => provider);

    await expect(
      generateOwnedDailyPlan(
        'user-1',
        { availableMinutes: 45, goalIds: ['goal-1'] },
        repository(['goal-1']),
        createProvider,
      ),
    ).resolves.toEqual({ source: 'ai', plan: validPlan });
    expect(createProvider).toHaveBeenCalledTimes(1);
  });

  it('gives the provider verified goal details instead of only internal IDs', async () => {
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => validPlan),
    };
    const ownedGoals: OwnedGoalRepository = {
      async findActiveByIds() {
        return [
          {
            id: 'goal-1',
            title: '完成 TypeScript 入门练习',
            successCriteria: '完成五道类型练习并全部通过',
            currentProgress: '已学习基础类型',
            stage: '巩固基础类型',
          },
        ];
      },
      async getTodayCapacity() {
        return null;
      },
    };

    await generateOwnedDailyPlan(
      'user-1',
      { availableMinutes: 45, goalIds: ['goal-1'] },
      ownedGoals,
      () => provider,
    );

    expect(provider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          goals: [
            {
              id: 'goal-1',
              title: '完成 TypeScript 入门练习',
              successCriteria: '完成五道类型练习并全部通过',
              currentProgress: '已学习基础类型',
              stage: '巩固基础类型',
            },
          ],
        }),
      }),
    );
  });

  it('uses the remaining daily task capacity for generation', async () => {
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => validPlan),
    };

    await generateOwnedDailyPlan(
      'user-1',
      { availableMinutes: 45, goalIds: ['goal-1'] },
      repository(['goal-1'], { goalIds: ['goal-existing'], taskCount: 7 }),
      () => provider,
      async () => undefined,
      () => new Date('2026-08-23T16:30:00.000Z'),
    );

    expect(provider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ maxTasks: 3 }),
      }),
    );
  });

  it('uses all five task slots when no plan is confirmed today', async () => {
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => validPlan),
    };

    await generateOwnedDailyPlan(
      'user-1',
      { availableMinutes: 45, goalIds: ['goal-1'] },
      repository(['goal-1']),
      () => provider,
    );

    expect(provider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ maxTasks: 5 }),
      }),
    );
  });

  it.each([
    ['three goals', { goalIds: ['goal-2', 'goal-3', 'goal-4'], taskCount: 3 }],
    ['ten tasks', { goalIds: ['goal-2'], taskCount: 10 }],
    ['an already scheduled goal', { goalIds: ['goal-1'], taskCount: 1 }],
  ])('rejects %s before claiming quota or creating a provider', async (_label, capacity) => {
    const claimQuota = vi.fn(async () => undefined);
    const createProvider = vi.fn<() => AIProvider>();

    await expect(
      generateOwnedDailyPlan(
        'user-1',
        { availableMinutes: 45, goalIds: ['goal-1'] },
        repository(['goal-1'], capacity),
        createProvider,
        claimQuota,
      ),
    ).rejects.toEqual(new PlanGenerationServiceError('LIMIT_REACHED'));
    expect(claimQuota).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('rejects two new goals when today already has two distinct goals', async () => {
    const claimQuota = vi.fn(async () => undefined);
    const createProvider = vi.fn<() => AIProvider>();

    await expect(
      generateOwnedDailyPlan(
        'user-1',
        { availableMinutes: 45, goalIds: ['goal-1', 'goal-2'] },
        repository(['goal-1', 'goal-2'], {
          goalIds: ['goal-3', 'goal-4'],
          taskCount: 2,
        }),
        createProvider,
        claimQuota,
      ),
    ).rejects.toEqual(new PlanGenerationServiceError('LIMIT_REACHED'));
    expect(claimQuota).not.toHaveBeenCalled();
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('uses the Shanghai date when reading current daily capacity', async () => {
    const getTodayCapacity = vi.fn(async () => null);
    const ownedGoals: OwnedGoalRepository = {
      async findActiveByIds() {
        return [
          {
            id: 'goal-1',
            title: '完成 TypeScript 入门练习',
            successCriteria: '完成五道类型练习并全部通过',
            currentProgress: '已学习基础类型',
            stage: '巩固基础类型',
          },
        ];
      },
      getTodayCapacity,
    };

    await generateOwnedDailyPlan(
      'user-1',
      { availableMinutes: 45, goalIds: ['goal-1'] },
      ownedGoals,
      () => ({ generateStructured: async () => validPlan }),
      async () => undefined,
      () => new Date('2026-08-23T16:30:00.000Z'),
    );

    expect(getTodayCapacity).toHaveBeenCalledWith('user-1', '2026-08-24');
  });

  it('rejects a missing or foreign goal before creating a provider', async () => {
    const createProvider = vi.fn<() => AIProvider>();

    await expect(
      generateOwnedDailyPlan(
        'user-1',
        { availableMinutes: 45, goalIds: ['goal-1', 'foreign-goal'] },
        repository(['goal-1']),
        createProvider,
      ),
    ).rejects.toEqual(new PlanGenerationServiceError('INVALID_CONTEXT'));
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('returns the deterministic fallback when the provider stays unavailable', async () => {
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => {
        throw new Error('offline');
      }),
    };

    const result = await generateOwnedDailyPlan(
      'user-1',
      { availableMinutes: 15, goalIds: ['goal-1'] },
      repository(['goal-1']),
      () => provider,
    );

    expect(result.source).toBe('fallback');
    expect(result.plan.tasks[0]?.goalId).toBe('goal-1');
    expect(result.plan.tasks[0]?.estimatedMinutes).toBeLessThanOrEqual(15);
  });

  it.each([
    null,
    {},
    { availableMinutes: 0, goalIds: ['goal-1'] },
    { availableMinutes: 30.5, goalIds: ['goal-1'] },
    { availableMinutes: 30, goalIds: [] },
    { availableMinutes: 30, goalIds: ['goal-1', 'goal-1'] },
    { availableMinutes: 30, goalIds: [' '] },
    { availableMinutes: 30, goalIds: new Array(1) },
  ])('rejects invalid plan input before creating a provider: %j', async (input) => {
    const createProvider = vi.fn<() => AIProvider>();

    await expect(
      generateOwnedDailyPlan(
        'user-1',
        input,
        repository([]),
        createProvider,
      ),
    ).rejects.toEqual(new PlanGenerationServiceError('INVALID_CONTEXT'));
    expect(createProvider).not.toHaveBeenCalled();
  });
});
