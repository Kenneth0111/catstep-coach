import { describe, expect, it } from 'vitest';
import {
  createGoalViews,
  selectCurrentTask,
  summarizePlan,
  type TodayTask,
} from '../miniprogram/shared/today-plan';
import type { TodayGoalGroup } from '../miniprogram/shared/today-flow';

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

  it('prefers an in-progress task before priority-ranked pending tasks', () => {
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
        priority: 2,
      },
    ];

    expect(selectCurrentTask(tiedTasks)?.id).toBe('started');
  });
});

describe('summarizePlan', () => {
  it('counts remaining tasks and minutes', () => {
    expect(summarizePlan(tasks)).toEqual({
      completedCount: 1,
      totalCount: 3,
      remainingCount: 2,
      remainingMinutes: 70,
    });
  });
});

describe('createGoalViews', () => {
  it('computes independent current task, status, and progress for three goals', () => {
    const groups: TodayGoalGroup[] = [
      {
        goalId: 'goal-1',
        goalTitle: '学 TypeScript',
        tasks: [
          { ...tasks[1], id: 'g1-pending', goalId: 'goal-1', action: '读一节', doneCriteria: '完成', reason: '打基础', difficulty: 'medium' },
          { ...tasks[0], id: 'g1-done', goalId: 'goal-1', action: '复盘', doneCriteria: '完成', reason: '稳住', difficulty: 'easy' },
        ],
      },
      {
        goalId: 'goal-2',
        goalTitle: '做项目',
        tasks: [
          { ...tasks[1], id: 'g2-pending', goalId: 'goal-2', action: '列清单', doneCriteria: '完成', reason: '明确', difficulty: 'medium', priority: 1 },
          { ...tasks[2], id: 'g2-running', goalId: 'goal-2', action: '实现', doneCriteria: '完成', reason: '推进', difficulty: 'hard', status: 'in_progress', priority: 2 },
        ],
      },
      {
        goalId: 'goal-3',
        goalTitle: '复盘',
        tasks: [
          { ...tasks[0], id: 'g3-done', goalId: 'goal-3', action: '写下', doneCriteria: '完成', reason: '沉淀', difficulty: 'easy' },
        ],
      },
    ];

    const views = createGoalViews(groups);

    expect(views.map((view) => view.goalId)).toEqual(['goal-1', 'goal-2', 'goal-3']);
    expect(views[0]).toMatchObject({
      goalTitle: '学 TypeScript',
      status: 'in_progress',
      completedCount: 1,
      totalCount: 2,
      progressPercent: 50,
      currentTask: null,
      pendingTasks: [{ id: 'g1-pending' }],
      completedTasks: [{ id: 'g1-done' }],
    });
    expect(views[1]).toMatchObject({
      status: 'in_progress',
      progressPercent: 0,
      currentTask: { id: 'g2-running' },
      pendingTasks: [{ id: 'g2-pending' }],
    });
    expect(views[2]).toMatchObject({
      status: 'completed',
      progressPercent: 100,
      currentTask: null,
      pendingTasks: [],
      completedTasks: [{ id: 'g3-done' }],
    });
    expect(groups[1].tasks[0].id).toBe('g2-pending');
  });
});
