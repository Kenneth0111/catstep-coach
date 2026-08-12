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

function repository(ids: string[]): OwnedGoalRepository {
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
