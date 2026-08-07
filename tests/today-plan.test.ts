import { describe, expect, it } from 'vitest';
import {
  selectCurrentTask,
  summarizePlan,
  type TodayTask,
} from '../miniprogram/shared/today-plan';

const tasks: TodayTask[] = [
  {
    id: 'done',
    title: '整理资料',
    estimatedMinutes: 20,
    status: 'completed',
    priority: 3,
  },
  {
    id: 'later',
    title: '复习事件循环',
    estimatedMinutes: 30,
    status: 'pending',
    priority: 2,
  },
  {
    id: 'now',
    title: '实现任务调度器',
    estimatedMinutes: 40,
    status: 'pending',
    priority: 1,
  },
];

describe('selectCurrentTask', () => {
  it('returns the lowest-priority-number unfinished task', () => {
    expect(selectCurrentTask(tasks)?.id).toBe('now');
  });

  it('returns null when every task is completed', () => {
    expect(
      selectCurrentTask(
        tasks.map((task) => ({ ...task, status: 'completed' })),
      ),
    ).toBeNull();
  });

  it('prefers an in-progress task when priority is tied', () => {
    const tiedTasks: TodayTask[] = [
      {
        id: 'pending',
        title: '准备下一步',
        estimatedMinutes: 20,
        status: 'pending',
        priority: 1,
      },
      {
        id: 'started',
        title: '继续当前任务',
        estimatedMinutes: 30,
        status: 'in_progress',
        priority: 1,
      },
    ];

    expect(selectCurrentTask(tiedTasks)?.id).toBe('started');
  });
});

describe('summarizePlan', () => {
  it('counts remaining tasks and minutes', () => {
    expect(summarizePlan(tasks)).toEqual({
      remainingCount: 2,
      remainingMinutes: 70,
    });
  });
});
