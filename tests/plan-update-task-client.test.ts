import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  updatePlanTask,
  type CloudFunctionCaller,
} from '../miniprogram/shared/cloud-api';
import {
  beginTodayTaskUpdate,
  createTodayFlowState,
  receiveTodayPlan,
  receiveTodayTaskUpdate,
  retryTodayTaskUpdate,
  setTodayTaskUpdateError,
  toggleTodayGoal,
  type TodayDashboardPlan,
  type TodayPlan,
} from '../miniprogram/shared/today-flow';

function createPlan(status: 'pending' | 'in_progress' | 'completed' = 'pending'): TodayPlan {
  return {
    id: 'plan-1', date: '2026-08-11', availableMinutes: 30, summary: '先走一步。',
    tasks: [{ id: 'task-1', title: '完成练习', action: '完成五道练习', estimatedMinutes: 30,
      doneCriteria: '五道练习通过', goalId: 'goal-1', reason: '巩固基础', difficulty: 'medium',
      priority: 1, status }],
  };
}

function createDashboardPlan(): TodayDashboardPlan {
  const tasks = Array.from({ length: 10 }, (_unused, index) => ({
    ...createPlan().tasks[0],
    id: `task-${index + 1}`,
    goalId: index < 4 ? 'goal-1' : index < 7 ? 'goal-2' : 'goal-3',
    priority: index + 1,
    status: 'pending' as const,
  }));
  return {
    ...createPlan(),
    availableMinutes: 300,
    tasks,
    groups: [
      { goalId: 'goal-1', goalTitle: '目标一', tasks: tasks.slice(0, 4) },
      { goalId: 'goal-2', goalTitle: '目标二', tasks: tasks.slice(4, 7) },
      { goalId: 'goal-3', goalTitle: '目标三', tasks: tasks.slice(7) },
    ],
  };
}

describe('plan-update-task client boundary', () => {
  it('sends a start request and accepts the matching server-refreshed public plan', async () => {
    const input = { requestId: 'start-1', planId: 'plan-1', taskId: 'task-1', action: 'start' as const };
    const caller: CloudFunctionCaller = vi.fn(async () => ({
      result: { ok: true, plan: createPlan('in_progress') },
    }));

    await expect(updatePlanTask(input, caller)).resolves.toEqual(createPlan('in_progress'));
    expect(caller).toHaveBeenCalledWith({ name: 'plan-update-task', data: input });
  });

  it.each([
    { plan: { ...createPlan('in_progress'), id: 'other-plan' }, label: 'another plan' },
    {
      plan: {
        ...createPlan('in_progress'),
        tasks: [{ ...createPlan('in_progress').tasks[0], id: 'other-task' }],
      },
      label: 'a missing task',
    },
    { plan: createPlan('pending'), label: 'a start that did not begin' },
  ])('rejects a structurally valid response for $label', async ({ plan }) => {
    const input = { requestId: 'start-1', planId: 'plan-1', taskId: 'task-1', action: 'start' as const };
    const caller: CloudFunctionCaller = async () => ({ result: { ok: true, plan } });

    await expect(updatePlanTask(input, caller)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('requires matching difficulty feedback when completing a task', async () => {
    const input = {
      requestId: 'complete-1', planId: 'plan-1', taskId: 'task-1', action: 'complete' as const,
      difficulty: 'hard' as const,
    };
    const plan = createPlan('completed');
    plan.tasks[0].difficultyFeedback = 'easy';
    const caller: CloudFunctionCaller = async () => ({ result: { ok: true, plan } });

    await expect(updatePlanTask(input, caller)).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it('replaces Today state from the server plan and retains a failed request for retry', () => {
    const ready = receiveTodayPlan(createTodayFlowState(), createPlan());
    const updating = beginTodayTaskUpdate(ready, {
      requestId: 'start-1', planId: 'plan-1', taskId: 'task-1', action: 'start',
    });
    const failed = setTodayTaskUpdateError(updating, 'INTERNAL_ERROR');

    expect(retryTodayTaskUpdate(failed)).toMatchObject({
      taskUpdate: { requestId: 'start-1', action: 'start' },
      taskUpdateErrorCode: null,
    });
    expect(receiveTodayTaskUpdate(updating, 'start-1', createPlan('in_progress'))).toMatchObject({
      currentTask: { id: 'task-1', status: 'in_progress' },
      summary: { remainingCount: 1, remainingMinutes: 30 },
      taskUpdate: null,
    });
  });

  it('ignores a stale task-update response instead of replacing a newer flow', () => {
    const ready = receiveTodayPlan(createTodayFlowState(), createPlan());
    const start = beginTodayTaskUpdate(ready, {
      requestId: 'start-1', planId: 'plan-1', taskId: 'task-1', action: 'start',
    });
    const failed = setTodayTaskUpdateError(start, 'INTERNAL_ERROR', 'start-1');
    const retry = retryTodayTaskUpdate(failed);

    expect(receiveTodayTaskUpdate(retry, 'other-request', createPlan('completed'))).toBe(retry);
  });

  it('retains loaded dashboard groups when a task update returns a flat ten-task plan', () => {
    const current = createDashboardPlan();
    const ready = toggleTodayGoal(
      receiveTodayPlan(createTodayFlowState(), current),
      'goal-2',
    );
    const updating = beginTodayTaskUpdate(ready, {
      requestId: 'start-1', planId: 'plan-1', taskId: 'task-5', action: 'start',
    });
    const { groups: _groups, ...flatCurrent } = current;
    const flatUpdated: TodayPlan = {
      ...flatCurrent,
      tasks: current.tasks.map((task) =>
        task.id === 'task-5' ? { ...task, status: 'in_progress' as const } : task,
      ),
    };

    expect(receiveTodayTaskUpdate(updating, 'start-1', flatUpdated)).toMatchObject({
      expandedGoalId: 'goal-2',
      goalViews: [
        { goalId: 'goal-1', goalTitle: '目标一', totalCount: 4 },
        { goalId: 'goal-2', goalTitle: '目标二', currentTask: { id: 'task-5' }, totalCount: 3 },
        { goalId: 'goal-3', goalTitle: '目标三', totalCount: 3 },
      ],
    });
  });

  it('keeps a failed request pending until that request is retried', () => {
    const ready = receiveTodayPlan(createTodayFlowState(), createPlan());
    const updating = beginTodayTaskUpdate(ready, {
      requestId: 'start-1', planId: 'plan-1', taskId: 'task-1', action: 'start',
    });
    const failed = setTodayTaskUpdateError(updating, 'INTERNAL_ERROR');

    expect(() => beginTodayTaskUpdate(failed, {
      requestId: 'start-2', planId: 'plan-1', taskId: 'task-1', action: 'start',
    })).toThrow('INVALID_TRANSITION');
  });

  it('wires start, difficulty completion, and retry actions in the native UI', async () => {
    const [page, card] = await Promise.all([
      readFile('miniprogram/pages/today/index.wxml', 'utf8'),
      readFile('miniprogram/components/task-card/index.wxml', 'utf8'),
    ]);

    expect(page).toContain('bind:starttask="onStartTask"');
    expect(page).toContain('bind:completetask="onCompleteTask"');
    expect(page).toContain('bindtap="onRetryTaskUpdate"');
    expect(page).toContain('flow.taskUpdatesByGoalId[item.goalId]');
    expect(page).toContain('data-goal-id="{{item.goalId}}"');
    expect(card).toContain('disabled="{{updating}}"');
    expect(card).toContain('disabled="{{updating || !selectedDifficulty}}"');
    expect(card).toContain('data-difficulty="just_right"');
  });

  it('visibly marks the selected difficulty before completion', async () => {
    const [card, styles] = await Promise.all([
      readFile('miniprogram/components/task-card/index.wxml', 'utf8'),
      readFile('miniprogram/components/task-card/index.wxss', 'utf8'),
    ]);

    expect(card).toContain('task-card__difficulty--selected');
    expect(card).toContain("selectedDifficulty === 'easy'");
    expect(styles).toContain('.task-card__difficulty--selected');
  });
});
