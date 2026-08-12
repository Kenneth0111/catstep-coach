import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../cloudfunctions/shared/ai-provider';
import {
  resizeOwnedTask,
  type PlanResizeRepository,
  type StoredResizablePlan,
} from '../cloudfunctions/plan-resize-task/service';

function createPlan(): StoredResizablePlan {
  return {
    id: 'plan-1',
    _openid: 'user-1',
    owner: 'user-1',
    date: '2026-08-11',
    availableMinutes: 30,
    summary: '先走一步。',
    tasks: [
      {
        id: 'task-1',
        title: '完成类型练习',
        action: '完成五道类型练习',
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
    requestId: 'confirm-1',
    version: 1,
    createdAt: '2026-08-10T16:00:00.000Z',
  };
}

function repository(plan = createPlan()): PlanResizeRepository {
  return {
    async updateOwnedPlan(_openid, _planId, update) {
      return update(plan);
    },
  };
}

describe('resizeOwnedTask', () => {
  it('replaces an owned pending task with a shorter same-goal task', async () => {
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => ({
        title: '完成一道类型练习',
        action: '完成一道类型练习并记录错题',
        estimatedMinutes: 10,
        doneCriteria: '一道练习通过并写下一个错因',
        reason: '先降低启动成本',
        difficulty: 'easy',
      })),
    };

    const result = await resizeOwnedTask(
      'user-1',
      { requestId: 'resize-1', planId: 'plan-1', taskId: 'task-1', reason: '现在时间不够' },
      repository(),
      () => provider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );

    expect(result.source).toBe('ai');
    expect(result.plan.tasks[0]).toMatchObject({
      goalId: 'goal-1',
      estimatedMinutes: 10,
      difficulty: 'easy',
      resizeRequestId: 'resize-1',
      resizedAt: '2026-08-11T12:00:00.000Z',
    });
    expect(provider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ workflow: 'resizeTask' }),
    );
  });

  it('moves an owned pending task to the end without calling the model', async () => {
    const plan = createPlan();
    plan.tasks.push({
      ...plan.tasks[0],
      id: 'task-2',
      title: '整理错题',
      priority: 2,
    });
    const createProvider = vi.fn<() => AIProvider>();

    const result = await resizeOwnedTask(
      'user-1',
      { requestId: 'move-1', planId: 'plan-1', taskId: 'task-1', action: 'move_to_end' },
      repository(plan),
      createProvider,
      () => new Date('2026-08-11T12:00:00.000Z'),
    );

    expect(result.source).toBe('rule');
    expect(result.plan.tasks[0]?.priority).toBe(3);
    expect(createProvider).not.toHaveBeenCalled();
  });
});
