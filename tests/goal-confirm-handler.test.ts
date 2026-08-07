import { describe, expect, it, vi } from 'vitest';
import type { GoalRepository } from '../cloudfunctions/goal-confirm/service';
import { handleGoalConfirm } from '../cloudfunctions/goal-confirm/handler';

const event = {
  requestId: 'request-1',
  type: 'study',
  summary: {
    goal: '学会 TypeScript',
    successCriteria: '完成一个项目',
    deadline: null,
    currentProgress: '刚开始',
    suggestedStage: '完成基础练习',
    excludedContent: [],
  },
};

function repository(): GoalRepository {
  return {
    async findByRequestId() {
      return null;
    },
    async save(goal) {
      return { id: 'goal-1', ...goal };
    },
  };
}

describe('goal.confirm handler', () => {
  it('rejects unauthenticated requests before creating a repository', async () => {
    const createRepository = vi.fn(repository);

    await expect(
      handleGoalConfirm(event, {}, {
        getOpenid: () => undefined,
        createRepository,
        now: () => new Date(),
      }),
    ).resolves.toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('returns the confirmed goal', async () => {
    const result = await handleGoalConfirm(event, {}, {
      getOpenid: () => 'user-1',
      createRepository: repository,
      now: () => new Date('2026-08-07T08:00:00.000Z'),
    });

    expect(result).toEqual({
      ok: true,
      goal: { id: 'goal-1' },
    });
    expect(JSON.stringify(result)).not.toContain('user-1');
  });

  it('maps invalid input to a stable public error', async () => {
    await expect(
      handleGoalConfirm(null, {}, {
        getOpenid: () => 'user-1',
        createRepository: repository,
        now: () => new Date(),
      }),
    ).resolves.toEqual({ ok: false, code: 'INVALID_CONTEXT' });
  });

  it('does not expose unexpected repository errors', async () => {
    const brokenRepository: GoalRepository = {
      async findByRequestId() {
        throw new Error('database-secret-detail');
      },
      async save() {
        throw new Error('unused');
      },
    };

    const result = await handleGoalConfirm(event, {}, {
      getOpenid: () => 'user-1',
      createRepository: () => brokenRepository,
      now: () => new Date(),
    });

    expect(result).toEqual({ ok: false, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(result)).not.toContain('database-secret-detail');
  });
});
