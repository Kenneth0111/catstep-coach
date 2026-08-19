import { describe, expect, it } from 'vitest';
import {
  beginTodayTaskUpdate,
  beginTodayReview,
  beginTodayReviewConfirmation,
  createTodayFlowState,
  receiveTodayReview,
  receiveTodayReviewConfirmation,
  receiveTodayPlan,
  retryTodayFlow,
  setTodayFlowError,
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
      summary: { remainingCount: 1, remainingMinutes: 30 },
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
      summary: { remainingCount: 1, remainingMinutes: 30 },
    });
    expect(receiveTodayPlan(createTodayFlowState(), allComplete)).toMatchObject({
      currentTask: null,
      nextTasks: [],
      completedTasks: [
        { id: 'completed', status: 'completed' },
        { id: 'pending', status: 'completed' },
      ],
      summary: { remainingCount: 0, remainingMinutes: 0 },
    });
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
