import { describe, expect, it } from 'vitest';
import {
  beginTodayTaskUpdate,
  beginTodayReview,
  beginTodayReviewConfirmation,
  createTodayFlowState,
  receiveTodayReview,
  receiveTodayReviewConfirmation,
  receiveTodayPlan,
  mergeTodayDashboardPlan,
  receiveTodayTaskUpdate,
  retryTodayFlow,
  setTodayFlowError,
  setTodayTaskUpdateError,
  toggleTodayGoal,
  type TodayDashboardPlan,
  type TodayPlan,
} from '../miniprogram/shared/today-flow';

const plan: TodayPlan = {
  id: 'plan-1',
  date: '2026-08-10',
  availableMinutes: 30,
  summary: '先走一步',
  tasks: [
    {
      id: 'task-1',
      title: '完成练习',
      action: '完成五道练习',
      estimatedMinutes: 30,
      doneCriteria: '五道练习通过',
      goalId: 'goal-1',
      reason: '巩固基础',
      difficulty: 'medium',
      priority: 1,
      status: 'pending',
    },
  ],
};

function dashboardPlan(overrides: Partial<TodayDashboardPlan> = {}): TodayDashboardPlan {
  const groupedTasks: TodayDashboardPlan['tasks'] = [
    {
      ...plan.tasks[0],
      id: 'goal-1-done',
      goalId: 'goal-1',
      priority: 1,
      status: 'completed',
    },
    {
      ...plan.tasks[0],
      id: 'goal-2-current',
      goalId: 'goal-2',
      priority: 1,
      status: 'in_progress',
    },
    {
      ...plan.tasks[0],
      id: 'goal-2-pending',
      goalId: 'goal-2',
      priority: 2,
      status: 'pending',
    },
    {
      ...plan.tasks[0],
      id: 'goal-3-pending',
      goalId: 'goal-3',
      priority: 1,
      status: 'pending',
    },
  ];
  return {
    ...plan,
    ...overrides,
    tasks: overrides.tasks ?? groupedTasks,
    groups: overrides.groups ?? [
      { goalId: 'goal-1', goalTitle: '目标一', tasks: [groupedTasks[0]] },
      { goalId: 'goal-2', goalTitle: '目标二', tasks: [groupedTasks[1], groupedTasks[2]] },
      { goalId: 'goal-3', goalTitle: '目标三', tasks: [groupedTasks[3]] },
    ],
  };
}

function concurrentPlan(): TodayDashboardPlan {
  const tasks = [
    { ...plan.tasks[0], id: 'goal-1-task', goalId: 'goal-1', priority: 1, status: 'pending' as const },
    { ...plan.tasks[0], id: 'goal-2-task', goalId: 'goal-2', priority: 1, status: 'pending' as const },
    { ...plan.tasks[0], id: 'goal-3-task', goalId: 'goal-3', priority: 1, status: 'pending' as const },
  ];
  return {
    ...plan,
    tasks,
    groups: [
      { goalId: 'goal-1', goalTitle: '目标一', tasks: [tasks[0]] },
      { goalId: 'goal-2', goalTitle: '目标二', tasks: [tasks[1]] },
      { goalId: 'goal-3', goalTitle: '目标三', tasks: [tasks[2]] },
    ],
  };
}

describe('Today loading flow', () => {
  it('moves from review generation to confirmation and exposes awarded growth', () => {
    const ready = receiveTodayPlan(createTodayFlowState(), plan);
    const reviewing = beginTodayReview(ready);
    const review = receiveTodayReview(reviewing, {
      completionSummary: '今天完成了 1 项任务。',
      encouragement: '你已经把计划落到了实处。',
      nextSuggestion: '明天先用 15 分钟复习。',
      memoryCandidate: '短时练习更容易开始。',
    });
    const confirming = beginTodayReviewConfirmation(review);
    const confirmed = receiveTodayReviewConfirmation(confirming, {
      id: 'review-1',
      growthAwarded: 10,
    });

    expect(review).toMatchObject({ reviewStage: 'ready' });
    expect(confirmed).toMatchObject({ reviewStage: 'confirmed', growthAwarded: 10 });
  });

  it('starts loading and derives the ready view from a persisted plan', () => {
    const loading = createTodayFlowState();
    const ready = receiveTodayPlan(loading, plan);

    expect(loading).toMatchObject({ stage: 'loading', plan: null });
    expect(ready).toMatchObject({
      stage: 'ready',
      plan,
      currentTask: plan.tasks[0],
      nextTasks: [],
      goalViews: [
        {
          goalId: 'goal-1',
          goalTitle: '今日目标',
          currentTask: null,
          pendingTasks: [{ id: 'task-1' }],
        },
      ],
      expandedGoalId: 'goal-1',
      summary: { completedCount: 0, totalCount: 1, remainingCount: 1, remainingMinutes: 30 },
    });
  });

  it('moves to empty when there is no confirmed plan', () => {
    expect(receiveTodayPlan(createTodayFlowState(), null)).toMatchObject({
      stage: 'empty',
      plan: null,
    });
  });

  it('moves from a public error back to loading on retry', () => {
    const failed = setTodayFlowError(
      createTodayFlowState(),
      'INTERNAL_ERROR',
    );

    expect(failed).toMatchObject({
      stage: 'error',
      errorCode: 'INTERNAL_ERROR',
    });
    expect(retryTodayFlow(failed)).toMatchObject({
      stage: 'loading',
      errorCode: null,
    });
  });

  it('keeps completed tasks available for the Today view', () => {
    const partiallyComplete: TodayPlan = {
      ...plan,
      tasks: [
        { ...plan.tasks[0], id: 'completed', status: 'completed', priority: 1 },
        { ...plan.tasks[0], id: 'pending', status: 'pending', priority: 2 },
      ],
    };
    const allComplete: TodayPlan = {
      ...partiallyComplete,
      tasks: partiallyComplete.tasks.map((task) => ({ ...task, status: 'completed' as const })),
    };

    expect(receiveTodayPlan(createTodayFlowState(), partiallyComplete)).toMatchObject({
      currentTask: { id: 'pending' },
      nextTasks: [],
      completedTasks: [{ id: 'completed', status: 'completed' }],
      summary: { completedCount: 1, totalCount: 2, remainingCount: 1, remainingMinutes: 30 },
    });
    expect(receiveTodayPlan(createTodayFlowState(), allComplete)).toMatchObject({
      currentTask: null,
      nextTasks: [],
      completedTasks: [
        { id: 'completed', status: 'completed' },
        { id: 'pending', status: 'completed' },
      ],
      summary: { completedCount: 2, totalCount: 2, remainingCount: 0, remainingMinutes: 0 },
    });
  });

  it('defaults expansion to running, then incomplete, then first completed goal', () => {
    expect(receiveTodayPlan(createTodayFlowState(), dashboardPlan())).toMatchObject({
      expandedGoalId: 'goal-2',
    });

    const noRunning = dashboardPlan({
      tasks: dashboardPlan().tasks.map((task) =>
        task.status === 'in_progress' ? { ...task, status: 'pending' as const } : task,
      ),
    });
    noRunning.groups = [
      { goalId: 'goal-1', goalTitle: '目标一', tasks: [noRunning.tasks[0]] },
      { goalId: 'goal-2', goalTitle: '目标二', tasks: [noRunning.tasks[1], noRunning.tasks[2]] },
      { goalId: 'goal-3', goalTitle: '目标三', tasks: [noRunning.tasks[3]] },
    ];
    expect(receiveTodayPlan(createTodayFlowState(), noRunning)).toMatchObject({
      expandedGoalId: 'goal-2',
    });

    const allDone = dashboardPlan({
      tasks: dashboardPlan().tasks.map((task) => ({ ...task, status: 'completed' as const })),
    });
    allDone.groups = [
      { goalId: 'goal-1', goalTitle: '目标一', tasks: [allDone.tasks[0]] },
      { goalId: 'goal-2', goalTitle: '目标二', tasks: [allDone.tasks[1], allDone.tasks[2]] },
      { goalId: 'goal-3', goalTitle: '目标三', tasks: [allDone.tasks[3]] },
    ];
    expect(receiveTodayPlan(createTodayFlowState(), allDone)).toMatchObject({
      expandedGoalId: 'goal-1',
    });
  });

  it('opens one goal at a time and lets the active goal close', () => {
    const ready = receiveTodayPlan(createTodayFlowState(), dashboardPlan());

    expect(toggleTodayGoal(ready, 'goal-3')).toMatchObject({
      expandedGoalId: 'goal-3',
    });
    expect(toggleTodayGoal({ ...ready, expandedGoalId: 'goal-3' }, 'goal-3')).toMatchObject({
      expandedGoalId: null,
    });
  });

  it('preserves an explicitly closed goal after a flat task mutation', () => {
    const ready = receiveTodayPlan(createTodayFlowState(), dashboardPlan());
    const closed = toggleTodayGoal(ready, 'goal-2');
    const updating = beginTodayTaskUpdate(closed, {
      requestId: 'start-1',
      planId: 'plan-1',
      taskId: 'goal-3-pending',
      action: 'start',
    });
    const updated: TodayPlan = {
      ...dashboardPlan(),
      tasks: dashboardPlan().tasks.map((task) =>
        task.id === 'goal-3-pending'
          ? { ...task, status: 'in_progress' as const }
          : task,
      ),
    };

    expect(closed.expandedGoalId).toBeNull();
    expect(receiveTodayTaskUpdate(updating, 'start-1', updated)).toMatchObject({
      expandedGoalId: null,
    });
  });

  it('tracks task requests per goal and rejects only a second request for the same goal', () => {
    const ready = receiveTodayPlan(createTodayFlowState(), concurrentPlan());
    const goalOneUpdating = beginTodayTaskUpdate(ready, {
      requestId: 'start-goal-1',
      planId: 'plan-1',
      taskId: 'goal-1-task',
      action: 'start',
    });

    expect(beginTodayTaskUpdate(goalOneUpdating, {
      requestId: 'start-goal-2',
      planId: 'plan-1',
      taskId: 'goal-2-task',
      action: 'start',
    })).toMatchObject({
      taskUpdatesByGoalId: {
        'goal-1': { requestId: 'start-goal-1' },
        'goal-2': { requestId: 'start-goal-2' },
      },
    });
    expect(() => beginTodayTaskUpdate(goalOneUpdating, {
      requestId: 'again-goal-1',
      planId: 'plan-1',
      taskId: 'goal-1-task',
      action: 'start',
    })).toThrow('INVALID_TRANSITION');
  });

  it('merges concurrent task responses by affected goal without rolling back another goal', () => {
    const ready = receiveTodayPlan(createTodayFlowState(), concurrentPlan());
    const twoUpdating = beginTodayTaskUpdate(
      beginTodayTaskUpdate(ready, {
        requestId: 'start-goal-1',
        planId: 'plan-1',
        taskId: 'goal-1-task',
        action: 'start',
      }),
      {
        requestId: 'start-goal-2',
        planId: 'plan-1',
        taskId: 'goal-2-task',
        action: 'start',
      },
    );
    const goalTwoUpdated: TodayPlan = {
      ...concurrentPlan(),
      tasks: concurrentPlan().tasks.map((task) =>
        task.id === 'goal-2-task'
          ? { ...task, status: 'in_progress' as const }
          : task,
      ),
    };
    const afterGoalTwo = receiveTodayTaskUpdate(
      twoUpdating,
      'start-goal-2',
      goalTwoUpdated,
    );
    const staleGoalOneUpdated: TodayPlan = {
      ...concurrentPlan(),
      tasks: concurrentPlan().tasks.map((task) =>
        task.id === 'goal-1-task'
          ? { ...task, status: 'in_progress' as const }
          : task,
      ),
    };

    expect(receiveTodayTaskUpdate(afterGoalTwo, 'start-goal-1', staleGoalOneUpdated).goalViews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ goalId: 'goal-1', currentTask: expect.objectContaining({ id: 'goal-1-task' }) }),
        expect.objectContaining({ goalId: 'goal-2', currentTask: expect.objectContaining({ id: 'goal-2-task' }) }),
      ]),
    );
  });

  it('keeps per-goal task errors retryable while other goals remain actionable', () => {
    const ready = receiveTodayPlan(createTodayFlowState(), concurrentPlan());
    const updating = beginTodayTaskUpdate(ready, {
      requestId: 'start-goal-1',
      planId: 'plan-1',
      taskId: 'goal-1-task',
      action: 'start',
    });
    const failed = setTodayTaskUpdateError(updating, 'INTERNAL_ERROR', 'start-goal-1');

    expect(failed).toMatchObject({
      taskUpdatesByGoalId: { 'goal-1': { requestId: 'start-goal-1' } },
      taskUpdateErrorsByGoalId: { 'goal-1': 'INTERNAL_ERROR' },
    });
    expect(beginTodayTaskUpdate(failed, {
      requestId: 'start-goal-2',
      planId: 'plan-1',
      taskId: 'goal-2-task',
      action: 'start',
    })).toMatchObject({
      taskUpdatesByGoalId: {
        'goal-1': { requestId: 'start-goal-1' },
        'goal-2': { requestId: 'start-goal-2' },
      },
    });
  });

  it('merges flat task mutations back into existing dashboard groups and titles', () => {
    const current = dashboardPlan();
    const updatedTasks = Array.from({ length: 10 }, (_unused, index) => ({
      ...plan.tasks[0],
      id: `task-${index + 1}`,
      goalId: index < 4 ? 'goal-1' : index < 7 ? 'goal-2' : 'goal-3',
      priority: index + 1,
      status: index === 4 ? 'in_progress' as const : 'pending' as const,
    }));
    const updated: TodayPlan = {
      ...plan,
      tasks: updatedTasks,
      availableMinutes: 300,
    };

    const merged = mergeTodayDashboardPlan(current, updated);

    expect(merged.groups.map((group) => [group.goalId, group.goalTitle, group.tasks.length])).toEqual([
      ['goal-1', '目标一', 4],
      ['goal-2', '目标二', 3],
      ['goal-3', '目标三', 3],
    ]);
    expect(merged.tasks).toHaveLength(10);
  });

  it('rejects a second task update while the first request is in flight', () => {
    const ready = receiveTodayPlan(createTodayFlowState(), plan);
    const updating = beginTodayTaskUpdate(ready, {
      requestId: 'start-1', planId: 'plan-1', taskId: 'task-1', action: 'start',
    });

    expect(() => beginTodayTaskUpdate(updating, {
      requestId: 'start-2', planId: 'plan-1', taskId: 'task-1', action: 'start',
    })).toThrow('INVALID_TRANSITION');
  });
});
