import { describe, expect, it, vi } from 'vitest';
import {
  DailyPlanGenerationError,
  generateDailyPlan,
} from '../cloudfunctions/shared/generate-daily-plan';
import type { StructuredGenerationRequest } from '../cloudfunctions/shared/ai-provider';

const validCandidate = {
  summary: '先完成最重要的一小步。',
  tasks: [
    {
      title: '实现结构校验',
      action: '编写并运行 daily plan 结构校验测试',
      estimatedMinutes: 40,
      doneCriteria: '预设测试全部通过',
      goalId: 'goal-1',
      reason: '先稳定 AI 输出进入业务层的接口',
      difficulty: 'medium',
    },
  ],
};

const fallbackPlan = {
  summary: 'AI 暂时不可用，先完成一个可控的小步骤。',
  tasks: [
    {
      title: '写下当前目标的下一步',
      action: '为当前目标写下一条可以立即开始的具体行动',
      estimatedMinutes: 10,
      doneCriteria: '写下一条包含具体动作和完成标准的下一步',
      goalId: 'goal-1',
      reason: '规则降级让计划仍可继续',
      difficulty: 'easy',
    },
  ],
};

describe('generateDailyPlan', () => {
  it('returns a valid first AI result', async () => {
    const provider = {
      generateStructured: async () => validCandidate,
    };

    await expect(
      generateDailyPlan(
        { availableMinutes: 60, goalIds: ['goal-1'] },
        provider,
      ),
    ).resolves.toEqual({ plan: validCandidate, source: 'ai' });
  });

  it('returns a valid repaired result after invalid AI output', async () => {
    const results = [
      { ...validCandidate, tasks: [] },
      validCandidate,
    ];
    const provider = {
      generateStructured: async () => results.shift(),
    };

    await expect(
      generateDailyPlan(
        { availableMinutes: 60, goalIds: ['goal-1'] },
        provider,
      ),
    ).resolves.toEqual({ plan: validCandidate, source: 'repaired' });
  });

  it('passes the invalid candidate and validation code to the repair request', async () => {
    const invalidCandidate = { ...validCandidate, tasks: [] };
    const requests: StructuredGenerationRequest[] = [];
    const provider = {
      generateStructured: async (request: StructuredGenerationRequest) => {
        requests.push(request);
        return requests.length === 1 ? invalidCandidate : validCandidate;
      },
    };

    await generateDailyPlan(
      { availableMinutes: 60, goalIds: ['goal-1'] },
      provider,
    );

    expect(requests[1]?.repair).toEqual({
      candidate: invalidCandidate,
      validationCode: 'TASK_COUNT',
    });
  });

  it('uses a rule fallback when repaired output is still invalid', async () => {
    const invalidCandidate = { ...validCandidate, tasks: [] };
    let attempts = 0;
    const provider = {
      generateStructured: async () => {
        attempts += 1;
        return invalidCandidate;
      },
    };

    await expect(
      generateDailyPlan(
        { availableMinutes: 60, goalIds: ['goal-1'] },
        provider,
      ).then((result) => ({ attempts, result })),
    ).resolves.toEqual({
      attempts: 2,
      result: { plan: fallbackPlan, source: 'fallback' },
    });
  });

  it('uses a rule fallback when the repair request fails', async () => {
    const invalidCandidate = { ...validCandidate, tasks: [] };
    let attempts = 0;
    const provider = {
      generateStructured: async () => {
        attempts += 1;
        if (attempts === 1) {
          return invalidCandidate;
        }
        throw new Error('repair unavailable');
      },
    };

    await expect(
      generateDailyPlan(
        { availableMinutes: 60, goalIds: ['goal-1'] },
        provider,
      ),
    ).resolves.toEqual({ plan: fallbackPlan, source: 'fallback' });
  });

  it('does not hide an unexpected repaired-result validation error', async () => {
    const invalidCandidate = { ...validCandidate, tasks: [] };
    const unexpectedCandidate = new Proxy(
      {},
      {
        has() {
          throw new Error('unexpected candidate access');
        },
      },
    );
    let attempts = 0;
    const provider = {
      generateStructured: async () => {
        attempts += 1;
        return attempts === 1 ? invalidCandidate : unexpectedCandidate;
      },
    };

    await expect(
      generateDailyPlan(
        { availableMinutes: 60, goalIds: ['goal-1'] },
        provider,
      ),
    ).rejects.toThrow('unexpected candidate access');
  });

  it('retries once after a provider error', async () => {
    let attempts = 0;
    const provider = {
      generateStructured: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('temporary provider error');
        }
        return validCandidate;
      },
    };

    await expect(
      generateDailyPlan(
        { availableMinutes: 60, goalIds: ['goal-1'] },
        provider,
      ).then((result) => ({ attempts, result })),
    ).resolves.toEqual({
      attempts: 2,
      result: { plan: validCandidate, source: 'ai' },
    });
  });

  it('uses a rule fallback after two provider errors', async () => {
    let attempts = 0;
    const provider = {
      generateStructured: async () => {
        attempts += 1;
        throw new Error('provider unavailable');
      },
    };

    await expect(
      generateDailyPlan(
        { availableMinutes: 60, goalIds: ['goal-1'] },
        provider,
      ).then((result) => ({ attempts, result })),
    ).resolves.toMatchObject({
      attempts: 2,
      result: {
        source: 'fallback',
        plan: { tasks: [{ goalId: 'goal-1', estimatedMinutes: 10 }] },
      },
    });
  });

  it('records a safe diagnostic when provider retries are exhausted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const provider = {
      generateStructured: async () => {
        const failure = Object.assign(new Error('provider-secret-detail'), {
          code: 'HTTP_ERROR',
        });
        throw failure;
      },
    };

    try {
      await expect(
        generateDailyPlan(
          { availableMinutes: 60, goalIds: ['goal-1'] },
          provider,
        ),
      ).resolves.toMatchObject({ source: 'fallback' });

      expect(warn).toHaveBeenCalledWith('daily_plan_fallback', {
        workflow: 'generateDailyPlan',
        stage: 'provider_unavailable',
        code: 'HTTP_ERROR',
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        'provider-secret-detail',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('caps the fallback task to the available time', async () => {
    const provider = {
      generateStructured: async () => {
        throw new Error('provider unavailable');
      },
    };

    await expect(
      generateDailyPlan(
        { availableMinutes: 5, goalIds: ['goal-1'] },
        provider,
      ),
    ).resolves.toMatchObject({
      source: 'fallback',
      plan: { tasks: [{ estimatedMinutes: 5 }] },
    });
  });

  it('rejects generation without a confirmed goal', async () => {
    const provider = {
      generateStructured: async () => {
        throw new Error('provider must not be called');
      },
    };

    await expect(
      generateDailyPlan({ availableMinutes: 60, goalIds: [] }, provider),
    ).rejects.toThrow(new DailyPlanGenerationError('INVALID_CONTEXT'));
  });

  it.each([0, -1, 1.5])(
    'rejects generation with invalid available minutes: %s',
    async (availableMinutes) => {
      const provider = {
        generateStructured: async () => {
          throw new Error('provider must not be called');
        },
      };

      await expect(
        generateDailyPlan(
          { availableMinutes, goalIds: ['goal-1'] },
          provider,
        ),
      ).rejects.toThrow(new DailyPlanGenerationError('INVALID_CONTEXT'));
    },
  );
});
