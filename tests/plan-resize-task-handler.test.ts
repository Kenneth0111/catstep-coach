import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../cloudfunctions/shared/ai-provider';
import type { PlanResizeRepository } from '../cloudfunctions/plan-resize-task/service';
import { handlePlanResizeTask } from '../cloudfunctions/plan-resize-task/handler';

describe('plan.resizeTask handler', () => {
  it('returns a resized plan for the authenticated owner', async () => {
    const dependencies = {
      getOpenid: () => 'user-1',
      now: () => new Date('2026-08-11T12:00:00.000Z'),
      createProvider: vi.fn<() => AIProvider>(() => ({
        async generateStructured() {
          return {
            title: '完成一道类型练习', action: '完成一道练习', estimatedMinutes: 10,
            doneCriteria: '一道练习通过', reason: '先降低启动成本', difficulty: 'easy',
          };
        },
      })),
      createRepository: vi.fn<() => PlanResizeRepository>(() => ({
        async updateOwnedPlan(_openid, _planId, update) {
          return update({
            id: 'plan-1', _openid: 'user-1', owner: 'user-1', date: '2026-08-11',
            availableMinutes: 30, summary: '先走一步。', status: 'confirmed', requestId: 'confirm-1', version: 1, createdAt: '2026-08-10T16:00:00.000Z',
            tasks: [{ id: 'task-1', title: '完成类型练习', action: '完成五道类型练习', estimatedMinutes: 30, doneCriteria: '五道练习全部通过', goalId: 'goal-1', reason: '巩固基础类型', difficulty: 'medium', priority: 1, status: 'pending' }],
          });
        },
      })),
    };

    await expect(
      handlePlanResizeTask({ requestId: 'resize-1', planId: 'plan-1', taskId: 'task-1' }, {}, dependencies),
    ).resolves.toMatchObject({ ok: true, result: { source: 'ai', plan: { id: 'plan-1' } } });
  });
});
