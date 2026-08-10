import { describe, expect, it, vi } from 'vitest';
import {
  TodayPlanError,
  getTodayPlan,
  type TodayPlanRepository,
} from '../cloudfunctions/plan-get-today/service';
import type { ConfirmedDailyPlan } from '../cloudfunctions/plan-confirm/service';

const storedPlan: ConfirmedDailyPlan = {
  id: 'plan-1',
  _openid: 'user-1',
  owner: 'user-1',
  date: '2026-08-11',
  availableMinutes: 30,
  summary: '先完成一个明确的小步骤。',
  tasks: [
    {
      id: 'task-1',
      title: '完成类型练习',
      action: '完成五道 TypeScript 类型练习',
      estimatedMinutes: 30,
      doneCriteria: '五道练习全部通过',
      goalId: 'goal-1',
      reason: '巩固基础类型',
      difficulty: 'medium',
      priority: 1,
      status: 'pending',
    },
  ],
  status: 'confirmed',
  requestId: 'request-secret',
  version: 1,
  createdAt: '2026-08-10T16:30:00.000Z',
};

describe('getTodayPlan', () => {
  it('loads the authenticated Shanghai-date plan and exposes only client fields', async () => {
    const repository: TodayPlanRepository = {
      findConfirmedByDate: vi.fn(async () => storedPlan),
    };

    const plan = await getTodayPlan(
      'user-1',
      repository,
      () => new Date('2026-08-10T16:30:00.000Z'),
    );

    expect(repository.findConfirmedByDate).toHaveBeenCalledWith(
      'user-1',
      '2026-08-11',
    );
    expect(plan).toEqual({
      id: 'plan-1',
      date: '2026-08-11',
      availableMinutes: 30,
      summary: storedPlan.summary,
      tasks: storedPlan.tasks,
    });
    expect(JSON.stringify(plan)).not.toContain('request-secret');
    expect(JSON.stringify(plan)).not.toContain('user-1');
  });

  it('returns null when the user has no confirmed plan today', async () => {
    const repository: TodayPlanRepository = {
      findConfirmedByDate: async () => null,
    };

    await expect(
      getTodayPlan('user-1', repository, () => new Date()),
    ).resolves.toBeNull();
  });

  it('rejects a blank trusted identity before querying', async () => {
    const repository: TodayPlanRepository = {
      findConfirmedByDate: vi.fn(async () => null),
    };

    await expect(
      getTodayPlan(' ', repository, () => new Date()),
    ).rejects.toEqual(new TodayPlanError('INVALID_CONTEXT'));
    expect(repository.findConfirmedByDate).not.toHaveBeenCalled();
  });
});
