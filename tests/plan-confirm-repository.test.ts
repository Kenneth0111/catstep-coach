import { describe, expect, it, vi } from 'vitest';
import {
  createDailyPlanRepository,
  type PlanRepositoryDatabase,
} from '../cloudfunctions/plan-confirm/repository';

const storedPlan = {
  _id: 'plan-1',
  _openid: 'user-1',
  owner: 'user-1',
  date: '2026-08-11',
  availableMinutes: 30,
  summary: '完成一个小步',
  tasks: [],
  status: 'confirmed' as const,
  requestId: 'request-1',
  version: 1 as const,
  createdAt: '2026-08-10T16:00:00.000Z',
};
const { _id: documentId, ...persistedPlan } = storedPlan;

describe('plan.confirm CloudBase repository', () => {
  it('recovers the stored plan from an uncertain transaction result', async () => {
    const getPlan = vi.fn(async () => ({ data: [storedPlan] }));
    const database: PlanRepositoryDatabase = {
      command: { in: vi.fn() },
      plans: { doc: vi.fn(() => ({ get: getPlan })) },
      goals: {
        where: vi.fn(() => ({ get: async () => ({ data: [] }) })),
      },
      runTransaction: vi.fn(async () => {
        throw new Error('commit result unknown');
      }),
    };
    const repository = createDailyPlanRepository(database);

    await expect(repository.saveIfAbsent(
      documentId,
      persistedPlan,
    )).resolves.toEqual({ id: documentId, ...persistedPlan });
    expect(getPlan).toHaveBeenCalledOnce();
  });

  it('recovers when a committed transaction returns no usable result', async () => {
    const getPlan = vi.fn(async () => ({ data: [storedPlan] }));
    const database: PlanRepositoryDatabase = {
      command: { in: vi.fn() },
      plans: {
        doc: vi.fn(() => ({ get: getPlan })),
      },
      goals: {
        where: vi.fn(() => ({ get: async () => ({ data: [] }) })),
      },
      runTransaction: vi.fn(async () => ({ result: undefined as never })),
    };
    const repository = createDailyPlanRepository(database);

    await expect(
      repository.saveIfAbsent(documentId, persistedPlan),
    ).resolves.toEqual({ id: documentId, ...persistedPlan });
    expect(getPlan).toHaveBeenCalledOnce();
  });
});
