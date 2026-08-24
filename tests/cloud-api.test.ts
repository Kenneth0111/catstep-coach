import { describe, expect, it, vi } from 'vitest';
import {
  CloudApiError,
  confirmDailyPlan,
  confirmGoal,
  getPlanHistory,
  getGrowthSummary,
  getTodayPlan,
  requestDailyPlan,
  requestGoalNextStep,
  scheduleReminder,
  resizeTodayTask,
  requestTodayReview,
  updatePlanTask,
  type CloudFunctionCaller,
} from '../miniprogram/shared/cloud-api';

describe('Mini Program CloudBase API boundary', () => {
  const todayTasks = Array.from({ length: 10 }, (_value, index) => {
    const goalId = index < 4 ? 'goal-1' : index < 7 ? 'goal-2' : 'goal-3';
    return {
      id: `task-${index + 1}`,
      title: `任务 ${index + 1}`,
      action: `执行任务 ${index + 1}`,
      estimatedMinutes: 3,
      doneCriteria: `完成任务 ${index + 1}`,
      goalId,
      reason: `原因 ${index + 1}`,
      difficulty: 'medium' as const,
      priority: index + 1,
      status: index === 0 ? 'in_progress' as const : 'pending' as const,
    };
  });
  const todayDashboardPlan = {
    id: 'plan-1',
    date: '2026-08-10',
    availableMinutes: 30,
    summary: '先走一步',
    tasks: todayTasks,
    groups: [
      {
        goalId: 'goal-1',
        goalTitle: '学习测试',
        tasks: todayTasks.slice(0, 4),
      },
      {
        goalId: 'goal-2',
        goalTitle: '工作推进',
        tasks: todayTasks.slice(4, 7),
      },
      {
        goalId: 'goal-3',
        goalTitle: '生活整理',
        tasks: todayTasks.slice(7),
      },
    ],
  };

  it('loads a safe authenticated growth summary', async () => {
    const caller = vi.fn(async () => ({
      result: {
        ok: true,
        result: {
          growth: 115,
          recentAwards: [{ date: '2026-08-19', growthAwarded: 10 }],
        },
      },
    })) satisfies CloudFunctionCaller;

    await expect(getGrowthSummary(caller)).resolves.toEqual({
      growth: 115,
      recentAwards: [{ date: '2026-08-19', growthAwarded: 10 }],
    });
    expect(caller).toHaveBeenCalledWith({ name: 'growth-summary', data: {} });
  });

  it.each([
    ['negative growth', { growth: -1, recentAwards: [] }],
    ['fractional growth', { growth: 1.5, recentAwards: [] }],
    ['invalid award date', { growth: 1, recentAwards: [{ date: '2026-02-30', growthAwarded: 1 }] }],
    ['negative award', { growth: 1, recentAwards: [{ date: '2026-08-19', growthAwarded: -1 }] }],
    ['too many awards', { growth: 1, recentAwards: Array.from({ length: 4 }, (_, index) => ({ date: `2026-08-1${index}`, growthAwarded: 1 })) }],
    ['private field', { growth: 1, recentAwards: [], openid: 'private' }],
  ] as const)('rejects malformed growth summaries: %s', async (_name, result) => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, result },
    });
    await expect(getGrowthSummary(caller)).rejects.toEqual(
      new CloudApiError('INTERNAL_ERROR'),
    );
  });

  it('schedules an accepted reminder with the exact server-owned request', async () => {
    const input = { requestId: 'request-1', planId: 'plan-1', kind: 'review' as const };
    const caller = vi.fn(async () => ({
      result: { ok: true, reminder: { id: 'request-1', status: 'pending' } },
    })) satisfies CloudFunctionCaller;

    await expect(scheduleReminder(input, caller)).resolves.toEqual({
      id: 'request-1', status: 'pending',
    });
    expect(caller).toHaveBeenCalledWith({ name: 'reminder-schedule', data: input });
  });

  it('requests a structured review for the selected Today plan', async () => {
    const caller = vi.fn(async () => ({
      result: {
        ok: true,
        result: {
          source: 'fallback',
          review: {
            completionSummary: '今天完成了 1 项任务。',
            encouragement: '你已经把计划落到了实处。',
            nextSuggestion: '明天先用 15 分钟复习。',
            memoryCandidate: null,
          },
        },
      },
    })) satisfies CloudFunctionCaller;

    await expect(requestTodayReview({ planId: 'plan-1' }, caller)).resolves.toMatchObject({ source: 'fallback' });
    expect(caller).toHaveBeenCalledWith({ name: 'review-generate', data: { planId: 'plan-1' } });
  });

  it('calls goal-next-step with the exact clarification input', async () => {
    const input = { type: 'study' as const, title: '学习测试', answers: [] };
    const caller = vi.fn(async () => ({
      result: {
        ok: true,
        result: {
          source: 'ai',
          step: {
            kind: 'question',
            field: 'currentProgress',
            question: '你已经学到哪里了？',
          },
        },
      },
    })) satisfies CloudFunctionCaller;

    await requestGoalNextStep(input, caller);

    expect(caller).toHaveBeenCalledWith({ name: 'goal-next-step', data: input });
  });

  it('calls goal-confirm with the exact confirmation input', async () => {
    const input = {
      requestId: 'request-1',
      type: 'study' as const,
      summary: {
        goal: '学习测试',
        successCriteria: '完成练习',
        deadline: null,
        currentProgress: '刚开始',
        suggestedStage: '完成基础练习',
        excludedContent: [],
      },
    };
    const caller = vi.fn(async () => ({
      result: { ok: true, goal: { id: 'goal-1' } },
    })) satisfies CloudFunctionCaller;

    await confirmGoal(input, caller);

    expect(caller).toHaveBeenCalledWith({ name: 'goal-confirm', data: input });
  });

  it('calls plan-generate with the exact trusted constraints request', async () => {
    const input = { availableMinutes: 30, goalIds: ['goal-1'] };
    const caller = vi.fn(async () => ({
      result: {
        ok: true,
        result: {
          source: 'fallback',
          plan: {
            summary: '先走一步',
            tasks: [
              {
                title: '写下下一步',
                action: '写下一条具体行动',
                estimatedMinutes: 15,
                doneCriteria: '写下一条行动',
                goalId: 'goal-1',
                reason: '先建立起点',
                difficulty: 'easy',
              },
            ],
          },
        },
      },
    })) satisfies CloudFunctionCaller;

    await requestDailyPlan(input, caller);

    expect(caller).toHaveBeenCalledWith({ name: 'plan-generate', data: input });
  });

  it('confirms the complete edited daily plan with the exact input', async () => {
    const input = {
      requestId: 'plan-request-1',
      availableMinutes: 30,
      plan: {
        summary: '先走一步',
        tasks: [
          {
            title: '完成练习',
            action: '完成五道练习',
            estimatedMinutes: 30,
            doneCriteria: '五道练习通过',
            goalId: 'goal-1',
            reason: '巩固基础',
            difficulty: 'medium' as const,
          },
        ],
      },
    };
    const caller = vi.fn(async () => ({
      result: {
        ok: true,
        plan: { id: 'plan-1', date: '2026-08-10' },
      },
    })) satisfies CloudFunctionCaller;

    await expect(confirmDailyPlan(input, caller)).resolves.toEqual({
      id: 'plan-1',
      date: '2026-08-10',
    });
    expect(caller).toHaveBeenCalledWith({ name: 'plan-confirm', data: input });
  });

  it('loads a grouped Today dashboard plan with up to 3 groups and 10 tasks', async () => {
    const caller = vi.fn(async () => ({
      result: {
        ok: true,
        plan: todayDashboardPlan,
      },
    })) satisfies CloudFunctionCaller;

    const plan = await getTodayPlan(caller);

    expect(plan?.id).toBe('plan-1');
    expect(plan?.groups).toHaveLength(3);
    expect(plan?.tasks).toHaveLength(10);
    expect(caller).toHaveBeenCalledWith({ name: 'plan-get-today', data: {} });
  });

  it('accepts an empty Today plan result', async () => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, plan: null },
    });

    await expect(getTodayPlan(caller)).resolves.toBeNull();
  });

  it.each([
    ['a fourth group', {
      ...todayDashboardPlan,
      groups: [
        ...todayDashboardPlan.groups,
        {
          goalId: 'goal-4',
          goalTitle: '额外目标',
          tasks: [{
            ...todayTasks[0],
            id: 'task-11',
            goalId: 'goal-4',
          }],
        },
      ],
    }],
    ['an eleventh task', {
      ...todayDashboardPlan,
      tasks: [
        ...todayTasks,
        {
          ...todayTasks[0],
          id: 'task-11',
        },
      ],
      groups: [
        {
          ...todayDashboardPlan.groups[0],
          tasks: [
            ...todayDashboardPlan.groups[0].tasks,
            {
              ...todayTasks[0],
              id: 'task-11',
            },
          ],
        },
        ...todayDashboardPlan.groups.slice(1),
      ],
    }],
    ['a duplicate group id', {
      ...todayDashboardPlan,
      groups: [
        todayDashboardPlan.groups[0],
        {
          ...todayDashboardPlan.groups[1],
          goalId: 'goal-1',
        },
        todayDashboardPlan.groups[2],
      ],
    }],
    ['duplicate task ids across groups', {
      ...todayDashboardPlan,
      groups: [
        {
          ...todayDashboardPlan.groups[0],
          tasks: [
            ...todayDashboardPlan.groups[0].tasks,
            todayDashboardPlan.groups[1].tasks[0],
          ],
        },
        todayDashboardPlan.groups[1],
        todayDashboardPlan.groups[2],
      ],
    }],
    ['a missing task id from groups', {
      ...todayDashboardPlan,
      groups: [
        {
          ...todayDashboardPlan.groups[0],
          tasks: todayDashboardPlan.groups[0].tasks.slice(1),
        },
        todayDashboardPlan.groups[1],
        todayDashboardPlan.groups[2],
      ],
    }],
    ['a mismatched group goal id', {
      ...todayDashboardPlan,
      groups: [
        {
          ...todayDashboardPlan.groups[0],
          tasks: [
            {
              ...todayDashboardPlan.groups[0].tasks[0],
              goalId: 'goal-2',
            },
            ...todayDashboardPlan.groups[0].tasks.slice(1),
          ],
        },
        todayDashboardPlan.groups[1],
        todayDashboardPlan.groups[2],
      ],
    }],
    ['conflicting grouped task content', {
      ...todayDashboardPlan,
      groups: [
        {
          ...todayDashboardPlan.groups[0],
          tasks: [
            {
              ...todayDashboardPlan.groups[0].tasks[0],
              title: '与扁平计划不一致',
            },
            ...todayDashboardPlan.groups[0].tasks.slice(1),
          ],
        },
        todayDashboardPlan.groups[1],
        todayDashboardPlan.groups[2],
      ],
    }],
    ['a missing group title', {
      ...todayDashboardPlan,
      groups: [
        {
          ...todayDashboardPlan.groups[0],
          goalTitle: ' ',
        },
        todayDashboardPlan.groups[1],
        todayDashboardPlan.groups[2],
      ],
    }],
    ['a flat plan missing groups', {
      id: 'plan-1',
      date: '2026-08-10',
      availableMinutes: 30,
      summary: '先走一步',
      tasks: todayTasks,
    }],
  ] as const)('rejects malformed Today dashboard data: %s', async (_label, plan) => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, plan },
    });

    await expect(getTodayPlan(caller)).rejects.toEqual(
      new CloudApiError('INTERNAL_ERROR'),
    );
  });

  it('loads plan history with the exact month and selected date request', async () => {
    const input = { month: '2026-08', selectedDate: '2026-08-17' };
    const caller = vi.fn(async () => ({
      result: {
        ok: true,
        result: {
          month: '2026-08',
          selectedDate: '2026-08-17',
          planDates: ['2026-08-17'],
          selectedDay: {
            date: '2026-08-17',
            availableMinutes: 30,
            summary: '完成今天的练习',
            groups: [{
              goalId: 'goal-1',
              goalTitle: '学习测试',
              tasks: [{
                id: 'task-1',
                title: '完成练习',
                estimatedMinutes: 30,
                doneCriteria: '完成五道练习',
                goalId: 'goal-1',
                priority: 1,
                status: 'completed',
                difficultyFeedback: 'just_right',
              }],
            }],
            review: {
              completionSummary: '完成了一项任务',
              encouragement: '做得很好',
              nextSuggestion: '明天继续',
            },
          },
        },
      },
    })) satisfies CloudFunctionCaller;

    await expect(getPlanHistory(input, caller)).resolves.toMatchObject({
      month: '2026-08', selectedDate: '2026-08-17', planDates: ['2026-08-17'],
    });
    expect(caller).toHaveBeenCalledWith({ name: 'plan-history', data: input });
  });

  const validHistoryResult = {
    month: '2026-08',
    selectedDate: '2026-08-17',
    planDates: ['2026-08-17'],
    selectedDay: {
      date: '2026-08-17',
      availableMinutes: 30,
      summary: '完成今天的练习',
      groups: todayDashboardPlan.groups.map((group) => ({
        goalId: group.goalId,
        goalTitle: group.goalTitle,
        tasks: group.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          estimatedMinutes: task.estimatedMinutes,
          doneCriteria: task.doneCriteria,
          goalId: task.goalId,
          priority: task.priority,
          status: task.status,
        })),
      })),
      review: null,
    },
  };

  it.each([
    ['too many history groups', {
      selectedDay: {
        ...validHistoryResult.selectedDay,
        groups: [
          ...validHistoryResult.selectedDay.groups,
          {
            goalId: 'goal-4',
            goalTitle: '额外目标',
            tasks: [{
              ...validHistoryResult.selectedDay.groups[0].tasks[0],
              id: 'task-11',
              goalId: 'goal-4',
            }],
          },
        ],
      },
    }],
    ['too many history tasks', {
      selectedDay: {
        ...validHistoryResult.selectedDay,
        groups: [
          {
            ...validHistoryResult.selectedDay.groups[0],
            tasks: [
              ...validHistoryResult.selectedDay.groups[0].tasks,
              {
                ...validHistoryResult.selectedDay.groups[0].tasks[0],
                id: 'task-11',
              },
            ],
          },
          ...validHistoryResult.selectedDay.groups.slice(1),
        ],
      },
    }],
    ['planDates is not an array', { planDates: '2026-08-17' }],
    ['planDates contains an out-of-month date', { planDates: ['2026-09-01'] }],
    ['task has an unknown status', { selectedDay: { ...validHistoryResult.selectedDay, groups: [{ ...validHistoryResult.selectedDay.groups[0], tasks: [{ ...validHistoryResult.selectedDay.groups[0].tasks[0], status: 'blocked' }] }] } }],
    ['task is missing doneCriteria', { selectedDay: { ...validHistoryResult.selectedDay, groups: [{ ...validHistoryResult.selectedDay.groups[0], tasks: [{ ...validHistoryResult.selectedDay.groups[0].tasks[0], doneCriteria: undefined }] }] } }],
    ['task has an invalid difficulty feedback', { selectedDay: { ...validHistoryResult.selectedDay, groups: [{ ...validHistoryResult.selectedDay.groups[0], tasks: [{ ...validHistoryResult.selectedDay.groups[0].tasks[0], difficultyFeedback: 'unknown' }] }] } }],
    ['group is missing its goal title', { selectedDay: { ...validHistoryResult.selectedDay, groups: [{ ...validHistoryResult.selectedDay.groups[0], goalTitle: undefined }] } }],
    ['review has malformed text', { selectedDay: { ...validHistoryResult.selectedDay, review: { completionSummary: '', encouragement: '继续前进', nextSuggestion: '明天复习' } } }],
  ] as const)('rejects malformed nested plan history data: %s', async (_name, patch) => {
    const result = {
      ...validHistoryResult,
      ...patch,
      selectedDay: 'selectedDay' in patch && patch.selectedDay
        ? patch.selectedDay
        : validHistoryResult.selectedDay,
    };
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, result },
    });

    await expect(
      getPlanHistory({ month: '2026-08', selectedDate: '2026-08-17' }, caller),
    ).rejects.toEqual(new CloudApiError('INTERNAL_ERROR'));
  });

  it.each([
    { id: 'plan-1' },
    {
      id: 'plan-1',
      date: '2026-08-10',
      availableMinutes: 30,
      summary: '缺少任务',
      tasks: [],
    },
  ])('rejects malformed Today plan data: %j', async (plan) => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, plan },
    });

    await expect(getTodayPlan(caller)).rejects.toEqual(
      new CloudApiError('INTERNAL_ERROR'),
    );
  });

  it('accepts a flat 10-task plan for task updates', async () => {
    const input = {
      requestId: 'request-1',
      planId: 'plan-1',
      taskId: 'task-1',
      action: 'start' as const,
    };
    const caller: CloudFunctionCaller = async () => ({
      result: {
        ok: true,
        plan: {
          id: 'plan-1',
          date: '2026-08-10',
          availableMinutes: 30,
          summary: '先走一步',
          tasks: todayTasks.map((task, index) => ({
            ...task,
            status: index === 0 ? 'in_progress' as const : task.status,
          })),
        },
      },
    });

    const plan = await updatePlanTask(input, caller);
    expect(plan.id).toBe('plan-1');
    expect(plan.tasks).toHaveLength(10);
    expect(plan.tasks[0]).toMatchObject({ id: 'task-1', status: 'in_progress' });
  });

  it('accepts a flat 10-task plan for task resize', async () => {
    const input = {
      requestId: 'request-1',
      planId: 'plan-1',
      taskId: 'task-1',
      action: 'resize' as const,
    };
    const caller: CloudFunctionCaller = async () => ({
      result: {
        ok: true,
        result: {
          plan: {
            id: 'plan-1',
            date: '2026-08-10',
            availableMinutes: 30,
            summary: '先走一步',
            tasks: todayTasks,
          },
        },
      },
    });

    await expect(resizeTodayTask(input, caller)).resolves.toMatchObject({
      id: 'plan-1',
      tasks: todayTasks,
    });
  });

  it.each([
    'UNAUTHENTICATED',
    'INVALID_CONTEXT',
    'MISCONFIGURED',
    'LIMIT_REACHED',
    'QUOTA_EXCEEDED',
    'INTERNAL_ERROR',
  ] as const)('maps the public server error %s', async (code) => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: false, code },
    });

    await expect(
      requestGoalNextStep(
        { type: 'study', title: '学习', answers: [] },
        caller,
      ),
    ).rejects.toEqual(new CloudApiError(code));
  });

  it.each([{}, { result: null }, { result: { ok: true } }])(
    'maps malformed platform response to INTERNAL_ERROR: %j',
    async (response) => {
      const caller: CloudFunctionCaller = async () => response;

      await expect(
        requestGoalNextStep(
          { type: 'study', title: '学习', answers: [] },
          caller,
        ),
      ).rejects.toEqual(new CloudApiError('INTERNAL_ERROR'));
    },
  );

  it.each([
    { source: 'ai', step: {} },
    {
      source: 'unknown',
      step: {
        kind: 'question',
        field: 'deadline',
        question: '何时完成？',
      },
    },
    {
      source: 'ai',
      step: { kind: 'question', field: 'deadline', question: '' },
    },
  ])('rejects malformed nested goal result: %j', async (result) => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, result },
    });

    await expect(
      requestGoalNextStep(
        { type: 'study', title: '学习', answers: [] },
        caller,
      ),
    ).rejects.toEqual(new CloudApiError('INTERNAL_ERROR'));
  });

  it.each([
    { source: 'ai', plan: { summary: '缺少任务', tasks: [] } },
    {
      source: 'ai',
      plan: {
        summary: '字段不完整',
        tasks: [{ title: '只有标题' }],
      },
    },
  ])('rejects malformed nested plan result: %j', async (result) => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, result },
    });

    await expect(
      requestDailyPlan(
        { availableMinutes: 30, goalIds: ['goal-1'] },
        caller,
      ),
    ).rejects.toEqual(new CloudApiError('INTERNAL_ERROR'));
  });

  it('rejects a blank confirmed goal ID', async () => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, goal: { id: ' ' } },
    });

    await expect(
      confirmGoal(
        {
          requestId: 'request-1',
          type: 'study',
          summary: {
            goal: '学习',
            successCriteria: '完成练习',
            deadline: null,
            currentProgress: '开始',
            suggestedStage: '基础练习',
            excludedContent: [],
          },
        },
        caller,
      ),
    ).rejects.toEqual(new CloudApiError('INTERNAL_ERROR'));
  });
});
