import { describe, expect, it, vi } from 'vitest';
import {
  createPlanTaskUpdateRepository,
  type PlanTaskUpdateDatabase,
} from '../cloudfunctions/plan-update-task/repository';
import type { StoredPlan } from '../cloudfunctions/plan-update-task/service';

const storedPlan: StoredPlan = {
  id: 'plan-1',
  _openid: 'user-1',
  owner: 'user-1',
  date: '2026-08-10',
  availableMinutes: 20,
  summary: '完成一个小步骤',
  tasks: [
    {
      id: 'task-1',
      title: '写下下一步',
      action: '写下一个具体行动',
      estimatedMinutes: 20,
      doneCriteria: '写下一条行动',
      goalId: 'goal-1',
      reason: '继续向前',
      difficulty: 'easy',
      priority: 1,
      status: 'pending',
    },
  ],
  status: 'confirmed',
  requestId: 'confirm-1',
  version: 1,
  createdAt: '2026-08-10T10:00:00.000Z',
};

describe('plan.updateTask CloudBase repository', () => {
  it('recovers an applied update when the transaction result is unusable', async () => {
    let persisted = { ...storedPlan, _id: storedPlan.id };
    const document = {
      get: vi.fn(async () => ({ data: persisted })),
      set: vi.fn(async (fields: Omit<StoredPlan, 'id'>) => {
        persisted = { ...fields, id: storedPlan.id, _id: storedPlan.id };
      }),
    };
    const database = {
      plans: {
        doc: vi.fn(() => ({
          get: async () => ({ data: [persisted] }),
        })),
      },
      runTransaction: vi.fn(async (update: (transaction: {
        collection(name: 'plans'): { doc(id: string): typeof document };
      }) => Promise<StoredPlan | null>) => {
        await update({ collection: () => ({ doc: () => document }) });
        return { result: undefined as never };
      }) as unknown as PlanTaskUpdateDatabase['runTransaction'],
    };
    const repository = createPlanTaskUpdateRepository(database);

    const result = await repository.updateOwnedPlan(
      'user-1',
      'plan-1',
      (plan) => ({
        ...plan,
        tasks: plan.tasks.map((task) => ({
          ...task,
          status: 'in_progress' as const,
          startRequestId: 'start-1',
        })),
      }),
    );

    expect(result?.tasks[0]).toMatchObject({
      status: 'in_progress',
      startRequestId: 'start-1',
    });
  });
});
