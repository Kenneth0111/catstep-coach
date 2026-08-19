import { describe, expect, it, vi } from 'vitest';
import type { PlanHistoryRepository } from '../cloudfunctions/plan-history/service';
import { handlePlanHistory } from '../cloudfunctions/plan-history/handler';

const event = { month: '2026-08', selectedDate: '2026-08-17', openid: 'untrusted-client-id' };
const now = () => new Date('2026-08-18T04:00:00.000Z');

function emptyRepository(): PlanHistoryRepository {
  return {
    async findConfirmedPlans() { return []; },
    async findGoalTitles() { return {}; },
    async findConfirmedReview() { return null; },
  };
}

describe('handlePlanHistory', () => {
  it('does not create a repository when the trusted context is unauthenticated', async () => {
    const createRepository = vi.fn(() => emptyRepository());

    await expect(handlePlanHistory(event, {}, {
      getOpenid: () => undefined,
      createRepository,
      now,
    })).resolves.toEqual({ ok: false, code: 'UNAUTHENTICATED' });

    expect(createRepository).not.toHaveBeenCalled();
  });

  it('returns the service result using the trusted context identity only', async () => {
    const findConfirmedPlans = vi.fn(async () => []);
    const repository: PlanHistoryRepository = {
      findConfirmedPlans,
      async findGoalTitles() { return {}; },
      async findConfirmedReview() { return null; },
    };

    await expect(handlePlanHistory(event, {}, {
      getOpenid: () => 'trusted-context-id',
      createRepository: () => repository,
      now,
    })).resolves.toEqual({
      ok: true,
      result: {
        month: '2026-08',
        selectedDate: '2026-08-17',
        planDates: [],
        selectedDay: null,
      },
    });

    expect(findConfirmedPlans).toHaveBeenCalledWith(
      'trusted-context-id', '2026-08-01', '2026-09-01',
    );
  });

  it('maps service context errors to INVALID_CONTEXT', async () => {
    await expect(handlePlanHistory(
      { month: 'not-a-month', selectedDate: '2026-08-17' },
      {},
      { getOpenid: () => 'trusted-context-id', createRepository: emptyRepository, now },
    )).resolves.toEqual({ ok: false, code: 'INVALID_CONTEXT' });
  });

  it('maps identity and repository failures to INTERNAL_ERROR without exposing details', async () => {
    const failures = [
      handlePlanHistory(event, {}, {
        getOpenid: () => { throw new Error('identity provider failed'); },
        createRepository: emptyRepository,
        now,
      }),
      handlePlanHistory(event, {}, {
        getOpenid: () => 'trusted-context-id',
        createRepository: () => ({
          ...emptyRepository(),
          async findConfirmedPlans() { throw new Error('database failed'); },
        }),
        now,
      }),
    ];

    await expect(Promise.all(failures)).resolves.toEqual([
      { ok: false, code: 'INTERNAL_ERROR' },
      { ok: false, code: 'INTERNAL_ERROR' },
    ]);
  });
});
