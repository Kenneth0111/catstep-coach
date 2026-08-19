import { describe, expect, it, vi } from 'vitest';
import {
  CloudApiError,
  confirmDailyPlan,
  confirmGoal,
  getPlanHistory,
  getTodayPlan,
  requestDailyPlan,
  requestGoalNextStep,
  scheduleReminder,
  requestTodayReview,
  type CloudFunctionCaller,
} from '../miniprogram/shared/cloud-api';

describe('Mini Program CloudBase API boundary', () => {
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

  it('loads the nullable authenticated Today plan', async () => {
    const caller = vi.fn(async () => ({
      result: {
        ok: true,
        plan: {
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
        },
      },
    })) satisfies CloudFunctionCaller;

    const plan = await getTodayPlan(caller);

    expect(plan?.id).toBe('plan-1');
    expect(caller).toHaveBeenCalledWith({ name: 'plan-get-today', data: {} });
  });

  it('accepts an empty Today plan result', async () => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, plan: null },
    });

    await expect(getTodayPlan(caller)).resolves.toBeNull();
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
      review: null,
    },
  };

  it.each([
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

  it.each([
    'UNAUTHENTICATED',
    'INVALID_CONTEXT',
    'MISCONFIGURED',
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
