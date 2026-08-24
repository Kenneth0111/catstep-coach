import { describe, expect, it, vi } from 'vitest';
import { createDailyPlanRepository, type PlanRepositoryDatabase } from '../cloudfunctions/plan-confirm/repository';
import type { PersistedDailyPlan } from '../cloudfunctions/plan-confirm/service';

const incoming: PersistedDailyPlan = {
  _openid: 'user-1', owner: 'user-1', date: '2026-08-11', availableMinutes: 10,
  summary: '完成一个小步', tasks: [], status: 'confirmed', requestId: 'request-1',
  processedRequestIds: ['request-1'], version: 1, createdAt: '2026-08-10T16:00:00.000Z',
};

function databaseWith(current: PersistedDailyPlan | null) {
  const set = vi.fn(async () => undefined);
  const update = vi.fn(async () => undefined);
  const document = { get: vi.fn(async () => ({ data: current ? { _id: 'plan-1', ...current } : null })), set, update };
  const database: PlanRepositoryDatabase = {
    command: { in: vi.fn() },
    plans: { doc: vi.fn(() => ({ get: vi.fn(async () => ({ data: current ? [{ _id: 'plan-1', ...current }] : [] })) })) },
    goals: { where: vi.fn(() => ({ get: async () => ({ data: [] }) })) },
    runTransaction: vi.fn(async (callback) => ({ result: await callback({ collection: vi.fn(() => ({ doc: vi.fn(() => document) })) }) })),
  };
  return { database, set, update };
}

describe('plan.confirm CloudBase repository', () => {
  it('updates an existing document with the merged plan in one transaction', async () => {
    const current = { ...incoming, requestId: 'request-0', processedRequestIds: ['request-0'], tasks: [{ title: '旧步骤', action: '完成旧步骤', estimatedMinutes: 10, doneCriteria: '完成检查', goalId: 'goal-1', reason: '保持节奏', difficulty: 'easy' as const, id: 'plan-1-1', priority: 1, status: 'pending' as const }] };
    const { database, set, update } = databaseWith(current);
    const repository = createDailyPlanRepository(database);
    const result = await repository.createOrAppend('plan-1', incoming, (stored) => ({ ...stored, tasks: [...stored.tasks, { ...stored.tasks[0], id: 'plan-1-2', priority: 2 }] }));
    expect(result.tasks).toHaveLength(2);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ tasks: expect.any(Array) }));
    expect(set).not.toHaveBeenCalled();
  });

  it('sets an absent document in its transaction', async () => {
    const { database, set, update } = databaseWith(null);
    const repository = createDailyPlanRepository(database);
    await expect(repository.createOrAppend('plan-1', incoming, () => incoming)).resolves.toEqual({ id: 'plan-1', ...incoming });
    expect(set).toHaveBeenCalledWith(incoming);
    expect(update).not.toHaveBeenCalled();
  });

  it('does not write when the merge fails', async () => {
    const current = {
      ...incoming,
      requestId: 'request-0',
      processedRequestIds: ['request-0'],
    };
    const { database, set, update } = databaseWith(current);
    const repository = createDailyPlanRepository(database);
    await expect(repository.createOrAppend('plan-1', incoming, () => { throw new Error('limit'); })).rejects.toThrow('limit');
    expect(set).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('recovers a committed request when the transaction response is interrupted', async () => {
    const committed = {
      ...incoming,
      requestId: 'request-0',
      processedRequestIds: ['request-0', 'request-1'],
    };
    const { database } = databaseWith(committed);
    database.runTransaction = vi.fn(async () => { throw new Error('transaction failed'); });
    const repository = createDailyPlanRepository(database);
    await expect(repository.createOrAppend('plan-1', incoming, () => incoming)).resolves.toEqual({
      id: 'plan-1',
      ...committed,
    });
  });

  it('does not mistake a prior plan for a committed request after a transaction failure', async () => {
    const previous = { ...incoming, requestId: 'request-0', processedRequestIds: ['request-0'] };
    const { database } = databaseWith(previous);
    database.runTransaction = vi.fn(async () => { throw new Error('transaction failed'); });
    const repository = createDailyPlanRepository(database);
    await expect(repository.createOrAppend('plan-1', incoming, () => incoming)).rejects.toThrow('transaction failed');
  });

  it('rejects a transaction result without a confirmed plan', async () => {
    const { database } = databaseWith(null);
    database.runTransaction = vi.fn(async () => ({ result: undefined as never }));
    const repository = createDailyPlanRepository(database);

    await expect(repository.createOrAppend('plan-1', incoming, () => incoming)).rejects.toThrow('invalid transaction result');
  });

  it.each([
    ['only id and date', { id: 'plan-1', date: '2026-08-23' }],
    ['missing _openid', { id: 'plan-1', ...incoming, _openid: undefined }],
    ['missing owner', { id: 'plan-1', ...incoming, owner: undefined }],
    ['missing availableMinutes', { id: 'plan-1', ...incoming, availableMinutes: undefined }],
    ['missing summary', { id: 'plan-1', ...incoming, summary: undefined }],
    ['missing tasks', { id: 'plan-1', ...incoming, tasks: undefined }],
    ['wrong status', { id: 'plan-1', ...incoming, status: 'draft' }],
    ['missing requestId', { id: 'plan-1', ...incoming, requestId: undefined }],
    ['wrong version', { id: 'plan-1', ...incoming, version: 2 }],
    ['missing createdAt', { id: 'plan-1', ...incoming, createdAt: undefined }],
    ['invalid processedRequestIds', { id: 'plan-1', ...incoming, processedRequestIds: [1] }],
  ])('rejects a transaction result with %s', async (_label, result) => {
    const { database } = databaseWith(null);
    database.runTransaction = vi.fn(async () => ({ result: result as never }));
    const repository = createDailyPlanRepository(database);

    await expect(repository.createOrAppend('plan-1', incoming, () => incoming)).rejects.toThrow('invalid transaction result');
  });
});
