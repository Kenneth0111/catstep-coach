import { describe, expect, it, vi } from 'vitest';
import { handlePlanConfirm } from '../cloudfunctions/plan-confirm/handler';
import type { DailyPlanRepository } from '../cloudfunctions/plan-confirm/service';

const event = {
  requestId: 'request-1',
  availableMinutes: 30,
  plan: {
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
  },
};

function repository(): DailyPlanRepository {
  return {
    async findActiveGoalIds() {
      return ['goal-1'];
    },
    async saveIfAbsent(documentId, plan) {
      return { id: documentId, ...plan };
    },
  };
}

describe('plan.confirm handler', () => {
  it('rejects unauthenticated requests before creating a repository', async () => {
    const createRepository = vi.fn(repository);

    await expect(
      handlePlanConfirm(event, {}, {
        getOpenid: () => undefined,
        createRepository,
        now: () => new Date(),
      }),
    ).resolves.toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('returns only the confirmed plan identity and date', async () => {
    const result = await handlePlanConfirm(event, {}, {
      getOpenid: () => 'user-1',
      createRepository: repository,
      now: () => new Date('2026-08-10T16:30:00.000Z'),
    });

    expect(result).toMatchObject({
      ok: true,
      plan: { id: expect.any(String), date: '2026-08-11' },
    });
    expect(Object.keys((result as { plan: object }).plan)).toEqual([
      'id',
      'date',
    ]);
    expect(JSON.stringify(result)).not.toContain('user-1');
  });

  it('maps invalid input to a stable public error', async () => {
    await expect(
      handlePlanConfirm(null, {}, {
        getOpenid: () => 'user-1',
        createRepository: repository,
        now: () => new Date(),
      }),
    ).resolves.toEqual({ ok: false, code: 'INVALID_CONTEXT' });
  });

  it('sanitizes identity extraction failures', async () => {
    await expect(
      handlePlanConfirm(event, {}, {
        getOpenid: () => {
          throw new Error('identity-secret-detail');
        },
        createRepository: repository,
        now: () => new Date(),
      }),
    ).resolves.toEqual({ ok: false, code: 'INTERNAL_ERROR' });
  });

  it('does not expose unexpected repository errors', async () => {
    const brokenRepository: DailyPlanRepository = {
      async findActiveGoalIds() {
        throw new Error('database-secret-detail');
      },
      async saveIfAbsent() {
        throw new Error('unused');
      },
    };

    const result = await handlePlanConfirm(event, {}, {
      getOpenid: () => 'user-1',
      createRepository: () => brokenRepository,
      now: () => new Date(),
    });

    expect(result).toEqual({ ok: false, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(result)).not.toContain('database-secret-detail');
  });
});
