import { describe, expect, it } from 'vitest';
import {
  DailyPlanValidationError,
  validateDailyPlanStructure,
} from '../cloudfunctions/shared/daily-plan';

const validCandidate = {
  summary: '先完成最重要的一小步。',
  tasks: [
    {
      title: '实现结构校验',
      action: '编写并运行 daily plan 结构校验测试',
      estimatedMinutes: 40,
      doneCriteria: '预设测试全部通过',
      goalId: 'goal-1',
      reason: '先稳定 AI 输出进入业务层的接口',
      difficulty: 'medium',
    },
  ],
};

describe('validateDailyPlanStructure', () => {
  it('accepts a complete plan within the available time', () => {
    expect(
      validateDailyPlanStructure(validCandidate, {
        availableMinutes: 60,
        goalIds: ['goal-1'],
      }),
    ).toEqual(validCandidate);
  });

  it('rejects a plan without any tasks', () => {
    expect(() =>
      validateDailyPlanStructure(
        { ...validCandidate, tasks: [] },
        { availableMinutes: 60, goalIds: ['goal-1'] },
      ),
    ).toThrow(new DailyPlanValidationError('TASK_COUNT'));
  });

  it('rejects a plan with more than five tasks', () => {
    expect(() =>
      validateDailyPlanStructure(
        { ...validCandidate, tasks: Array(6).fill(validCandidate.tasks[0]) },
        { availableMinutes: 300, goalIds: ['goal-1'] },
      ),
    ).toThrow(new DailyPlanValidationError('TASK_COUNT'));
  });

  it('accepts exactly five distinct tasks', () => {
    const tasks = Array.from({ length: 5 }, (_value, index) => ({
      ...validCandidate.tasks[0],
      title: `任务 ${index + 1}`,
      action: `执行动作 ${index + 1}`,
      estimatedMinutes: 10,
    }));
    const candidate = { ...validCandidate, tasks };

    expect(
      validateDailyPlanStructure(candidate, {
        availableMinutes: 50,
        goalIds: ['goal-1'],
      }),
    ).toEqual(candidate);
  });

  it('exposes a stable validation error type and code', () => {
    try {
      validateDailyPlanStructure(
        { ...validCandidate, tasks: [] },
        { availableMinutes: 60, goalIds: ['goal-1'] },
      );
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DailyPlanValidationError);
      expect((error as DailyPlanValidationError).code).toBe('TASK_COUNT');
    }
  });

  it('rejects a plan without a non-empty summary', () => {
    expect(() =>
      validateDailyPlanStructure(
        { ...validCandidate, summary: '  ' },
        { availableMinutes: 60, goalIds: ['goal-1'] },
      ),
    ).toThrow(new DailyPlanValidationError('INCOMPLETE_FIELD'));
  });

  it('rejects a task with a missing required text field', () => {
    const task = { ...validCandidate.tasks[0], action: '' };

    expect(() =>
      validateDailyPlanStructure(
        { ...validCandidate, tasks: [task] },
        { availableMinutes: 60, goalIds: ['goal-1'] },
      ),
    ).toThrow(new DailyPlanValidationError('INCOMPLETE_FIELD'));
  });

  it('rejects a sparse task array', () => {
    expect(() =>
      validateDailyPlanStructure(
        { ...validCandidate, tasks: Array(1) },
        { availableMinutes: 60, goalIds: ['goal-1'] },
      ),
    ).toThrow(new DailyPlanValidationError('INCOMPLETE_FIELD'));
  });

  it('rejects an unsupported task difficulty', () => {
    const task = { ...validCandidate.tasks[0], difficulty: 'extreme' };

    expect(() =>
      validateDailyPlanStructure(
        { ...validCandidate, tasks: [task] },
        { availableMinutes: 60, goalIds: ['goal-1'] },
      ),
    ).toThrow(new DailyPlanValidationError('INVALID_DIFFICULTY'));
  });

  it('rejects a task with a non-positive duration', () => {
    const task = { ...validCandidate.tasks[0], estimatedMinutes: 0 };

    expect(() =>
      validateDailyPlanStructure(
        { ...validCandidate, tasks: [task] },
        { availableMinutes: 60, goalIds: ['goal-1'] },
      ),
    ).toThrow(new DailyPlanValidationError('INVALID_DURATION'));
  });

  it.each([
    ['fractional', 20.5],
    ['non-number', '20'],
    ['over the per-task limit', 61],
  ])('rejects a %s task duration', (_label, estimatedMinutes) => {
    const task = { ...validCandidate.tasks[0], estimatedMinutes };

    expect(() =>
      validateDailyPlanStructure(
        { ...validCandidate, tasks: [task] },
        { availableMinutes: 60, goalIds: ['goal-1'] },
      ),
    ).toThrow(new DailyPlanValidationError('INVALID_DURATION'));
  });

  it('accepts a task whose duration equals the available time', () => {
    const candidate = {
      ...validCandidate,
      tasks: [{ ...validCandidate.tasks[0], estimatedMinutes: 60 }],
    };

    expect(
      validateDailyPlanStructure(candidate, {
        availableMinutes: 60,
        goalIds: ['goal-1'],
      }),
    ).toEqual(candidate);
  });

  it('rejects a plan whose total duration exceeds the available time', () => {
    const secondTask = {
      ...validCandidate.tasks[0],
      title: '接入调用方',
      action: '让工作流调用结构校验',
      estimatedMinutes: 30,
    };

    expect(() =>
      validateDailyPlanStructure(
        { ...validCandidate, tasks: [...validCandidate.tasks, secondTask] },
        { availableMinutes: 60, goalIds: ['goal-1'] },
      ),
    ).toThrow(new DailyPlanValidationError('TOTAL_DURATION'));
  });

  it('rejects a task assigned to a goal outside the user context', () => {
    const task = { ...validCandidate.tasks[0], goalId: 'goal-2' };

    expect(() =>
      validateDailyPlanStructure(
        { ...validCandidate, tasks: [task] },
        { availableMinutes: 60, goalIds: ['goal-1'] },
      ),
    ).toThrow(new DailyPlanValidationError('UNKNOWN_GOAL'));
  });

  it('rejects duplicate tasks with the same normalized title and action', () => {
    const duplicate = {
      ...validCandidate.tasks[0],
      title: `  ${validCandidate.tasks[0].title}  `,
      action: validCandidate.tasks[0].action.toUpperCase(),
    };

    expect(() =>
      validateDailyPlanStructure(
        { ...validCandidate, tasks: [...validCandidate.tasks, duplicate] },
        { availableMinutes: 100, goalIds: ['goal-1'] },
      ),
    ).toThrow(new DailyPlanValidationError('DUPLICATE_TASK'));
  });
});
