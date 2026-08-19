import { describe, expect, it } from 'vitest';
import {
  getPlanHistory,
  PlanHistoryError,
  type PlanHistoryRepository,
  type StoredHistoryPlan,
} from '../cloudfunctions/plan-history/service';

const plan = (date: string, goalId: string, id = `plan-${date}`): StoredHistoryPlan => ({
  id,
  date,
  availableMinutes: 45,
  summary: '合成历史摘要',
  tasks: [
    {
      id: `${id}-1`, title: '第一项', estimatedMinutes: 20, doneCriteria: '完成第一项',
      goalId, priority: 2, status: 'completed', difficultyFeedback: 'just_right',
    },
    {
      id: `${id}-2`, title: '第二项', estimatedMinutes: 25, doneCriteria: '完成第二项',
      goalId: 'goal-b', priority: 1, status: 'in_progress',
    },
    {
      id: `${id}-3`, title: '第三项', estimatedMinutes: 10, doneCriteria: '完成第三项',
      goalId, priority: 3, status: 'pending',
    },
  ],
});

describe('getPlanHistory', () => {
  it('loads the month and selected day through the read-only repository boundary', async () => {
    const repository: PlanHistoryRepository = {
      async findConfirmedPlans(openid, startDate, endDate) {
        expect({ openid, startDate, endDate }).toEqual({
          openid: 'user-a', startDate: '2026-08-01', endDate: '2026-09-01',
        });
        return [plan('2026-08-17', 'goal-a')];
      },
      async findGoalTitles(openid, goalIds) {
        expect({ openid, goalIds }).toEqual({ openid: 'user-a', goalIds: ['goal-a', 'goal-b'] });
        return { 'goal-a': '匿名测试目标', 'goal-b': '第二目标' };
      },
      async findConfirmedReview(openid, planId) {
        expect({ openid, planId }).toEqual({ openid: 'user-a', planId: 'plan-2026-08-17' });
        return { completionSummary: '完成一项', encouragement: '继续前进', nextSuggestion: '明天复习' };
      },
    };

    await expect(getPlanHistory(
      'user-a',
      { month: '2026-08', selectedDate: '2026-08-17' },
      repository,
      () => new Date('2026-08-18T04:00:00.000Z'),
    )).resolves.toEqual({
      month: '2026-08', selectedDate: '2026-08-17', planDates: ['2026-08-17'],
      selectedDay: {
        date: '2026-08-17', availableMinutes: 45, summary: '合成历史摘要',
        groups: [
          { goalId: 'goal-a', goalTitle: '匿名测试目标', tasks: [plan('2026-08-17', 'goal-a').tasks[0], plan('2026-08-17', 'goal-a').tasks[2]] },
          { goalId: 'goal-b', goalTitle: '第二目标', tasks: [plan('2026-08-17', 'goal-a').tasks[1]] },
        ],
        review: { completionSummary: '完成一项', encouragement: '继续前进', nextSuggestion: '明天复习' },
      },
    });
  });

  it('rejects invalid context values', async () => {
    const repository: PlanHistoryRepository = {
      async findConfirmedPlans() { return []; },
      async findGoalTitles() { return {}; },
      async findConfirmedReview() { return null; },
    };
    const invalidInputs: Array<[string, unknown]> = [
      ['empty identity', { month: '2026-08', selectedDate: '2026-08-17' }],
      ['short month', { month: '2026-8', selectedDate: '2026-08-17' }],
      ['nonexistent date', { month: '2026-08', selectedDate: '2026-08-32' }],
      ['date outside month', { month: '2026-08', selectedDate: '2026-09-01' }],
      ['future month', { month: '2026-09', selectedDate: '2026-09-01' }],
    ];

    for (const [name, input] of invalidInputs) {
      await expect(getPlanHistory(
        name === 'empty identity' ? '' : 'user-a', input, repository,
        () => new Date('2026-08-18T04:00:00.000Z'),
      )).rejects.toEqual(new PlanHistoryError('INVALID_CONTEXT'));
    }
  });

  it('returns no selected day when the selected date has no plan', async () => {
    const repository: PlanHistoryRepository = {
      async findConfirmedPlans() { return [plan('2026-08-01', 'goal-a')]; },
      async findGoalTitles() { throw new Error('must not query titles'); },
      async findConfirmedReview() { throw new Error('must not query review'); },
    };

    await expect(getPlanHistory(
      'user-a', { month: '2026-08', selectedDate: '2026-08-17' }, repository,
      () => new Date('2026-08-18T04:00:00.000Z'),
    )).resolves.toMatchObject({ planDates: ['2026-08-01'], selectedDay: null });
  });

  it('queries December with a half-open range ending at next January', async () => {
    const repository: PlanHistoryRepository = {
      async findConfirmedPlans(openid, startDate, endDate) {
        expect({ openid, startDate, endDate }).toEqual({
          openid: 'user-a', startDate: '2026-12-01', endDate: '2027-01-01',
        });
        return [];
      },
      async findGoalTitles() { throw new Error('must not query titles'); },
      async findConfirmedReview() { throw new Error('must not query review'); },
    };

    await expect(getPlanHistory(
      'user-a', { month: '2026-12', selectedDate: '2026-12-31' }, repository,
      () => new Date('2026-12-31T16:00:00.000Z'),
    )).resolves.toMatchObject({ month: '2026-12', selectedDay: null });
  });

  it('uses the Shanghai month boundary when deciding whether a month is future', async () => {
    const repository: PlanHistoryRepository = {
      async findConfirmedPlans(openid, startDate, endDate) {
        expect({ openid, startDate, endDate }).toEqual({
          openid: 'user-a', startDate: '2026-08-01', endDate: '2026-09-01',
        });
        return [];
      },
      async findGoalTitles() { throw new Error('must not query titles'); },
      async findConfirmedReview() { throw new Error('must not query review'); },
    };
    const input = { month: '2026-08', selectedDate: '2026-08-01' };

    await expect(getPlanHistory(
      'user-a', input, repository,
      () => new Date('2026-07-31T15:59:59.999Z'),
    )).rejects.toEqual(new PlanHistoryError('INVALID_CONTEXT'));
    await expect(getPlanHistory(
      'user-a', input, repository,
      () => new Date('2026-07-31T16:00:00.000Z'),
    )).resolves.toMatchObject({ month: '2026-08', selectedDay: null });
  });

  it('deduplicates and sorts dates, and falls back to a missing goal title', async () => {
    const selected = plan('2026-08-17', 'missing-goal');
    const repository: PlanHistoryRepository = {
      async findConfirmedPlans() { return [plan('2026-08-20', 'goal-a'), selected, plan('2026-08-20', 'goal-a')]; },
      async findGoalTitles() { return {}; },
      async findConfirmedReview() { return null; },
    };

    await expect(getPlanHistory(
      'user-a', { month: '2026-08', selectedDate: '2026-08-17' }, repository,
      () => new Date('2026-08-18T04:00:00.000Z'),
    )).resolves.toMatchObject({
      planDates: ['2026-08-17', '2026-08-20'],
      selectedDay: {
        groups: [
          { goalId: 'missing-goal', goalTitle: '历史目标' },
          { goalId: 'goal-b', goalTitle: '历史目标' },
        ],
        review: null,
      },
    });
  });
});
