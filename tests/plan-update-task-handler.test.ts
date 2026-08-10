import { describe, expect, it, vi } from 'vitest';
import { handlePlanUpdateTask } from '../cloudfunctions/plan-update-task/handler';
import type { PlanTaskUpdateRepository, StoredPlan } from '../cloudfunctions/plan-update-task/service';

function repository(): PlanTaskUpdateRepository {
  const plan: StoredPlan = {
    id: 'plan-1', _openid: 'user-1', owner: 'user-1', date: '2026-08-11', availableMinutes: 30,
    summary: '先走一步。', status: 'confirmed', requestId: 'confirm-1', version: 1,
    createdAt: '2026-08-10T16:00:00.000Z',
    tasks: [{ id: 'task-1', title: '完成练习', action: '完成五道练习', estimatedMinutes: 30,
      doneCriteria: '五道练习通过', goalId: 'goal-1', reason: '巩固基础', difficulty: 'medium',
      priority: 1, status: 'pending' }],
  };
  return { updateOwnedPlan: async (_openid, _planId, update) => update(plan) };
}

const event = { requestId: 'start-1', planId: 'plan-1', taskId: 'task-1', action: 'start' as const };

describe('plan.updateTask handler', () => {
  it('rejects unauthenticated requests before creating a repository', async () => {
    const createRepository = vi.fn(repository);
    await expect(handlePlanUpdateTask(event, {}, {
      getOpenid: () => undefined, createRepository, now: () => new Date(),
    })).resolves.toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('returns only the updated public plan', async () => {
    const result = await handlePlanUpdateTask(event, {}, {
      getOpenid: () => 'user-1', createRepository: repository,
      now: () => new Date('2026-08-10T16:30:00.000Z'),
    });
    expect(result).toMatchObject({ ok: true, plan: { id: 'plan-1', tasks: [{ status: 'in_progress' }] } });
    expect(JSON.stringify(result)).not.toContain('user-1');
    expect(JSON.stringify(result)).not.toContain('confirm-1');
  });

  it('maps invalid input and unexpected failures to stable public errors', async () => {
    await expect(handlePlanUpdateTask(null, {}, {
      getOpenid: () => 'user-1', createRepository: repository, now: () => new Date(),
    })).resolves.toEqual({ ok: false, code: 'INVALID_CONTEXT' });
    await expect(handlePlanUpdateTask(event, {}, {
      getOpenid: () => { throw new Error('identity-secret'); }, createRepository: repository, now: () => new Date(),
    })).resolves.toEqual({ ok: false, code: 'INTERNAL_ERROR' });
  });
});
