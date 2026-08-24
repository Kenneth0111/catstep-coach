export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface TodayTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  status: TaskStatus;
  priority: number;
}

export interface PlanSummary {
  completedCount: number;
  totalCount: number;
  remainingCount: number;
  remainingMinutes: number;
}

export type TodayGoalStatus = 'not_started' | 'in_progress' | 'completed';

export interface TodayGoalView<TTask extends TodayTask = TodayTask> {
  goalId: string;
  goalTitle: string;
  status: TodayGoalStatus;
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  currentTask: TTask | null;
  pendingTasks: TTask[];
  completedTasks: TTask[];
}

export interface TodayGoalInput<TTask extends TodayTask = TodayTask> {
  goalId: string;
  goalTitle: string;
  tasks: TTask[];
}

const statusRank: Record<TaskStatus, number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
};

export function selectCurrentTask(
  tasks: readonly TodayTask[],
): TodayTask | null {
  return (
    [...tasks]
      .filter((task) => task.status !== 'completed')
      .sort(
        (left, right) =>
          statusRank[left.status] - statusRank[right.status] ||
          left.priority - right.priority,
      )[0] ?? null
  );
}

export function summarizePlan(tasks: readonly TodayTask[]): PlanSummary {
  const remaining = tasks.filter((task) => task.status !== 'completed');
  const completed = tasks.filter((task) => task.status === 'completed');

  return {
    completedCount: completed.length,
    totalCount: tasks.length,
    remainingCount: remaining.length,
    remainingMinutes: remaining.reduce(
      (total, task) => total + task.estimatedMinutes,
      0,
    ),
  };
}

export function createGoalViews<TTask extends TodayTask>(
  groups: readonly TodayGoalInput<TTask>[],
): TodayGoalView<TTask>[] {
  return groups.map((group) => {
    const tasksByPriority = [...group.tasks].sort(
      (left, right) => left.priority - right.priority,
    );
    const completedTasks = tasksByPriority.filter(
      (task) => task.status === 'completed',
    );
    const pendingTasks = tasksByPriority.filter(
      (task) => task.status === 'pending',
    );
    const currentTask =
      tasksByPriority.find((task) => task.status === 'in_progress') ?? null;
    const totalCount = tasksByPriority.length;
    const completedCount = completedTasks.length;
    const hasProgress = currentTask !== null || completedCount > 0;
    const status: TodayGoalStatus =
      totalCount > 0 && completedCount === totalCount
        ? 'completed'
        : hasProgress
          ? 'in_progress'
          : 'not_started';

    return {
      goalId: group.goalId,
      goalTitle: group.goalTitle,
      status,
      completedCount,
      totalCount,
      progressPercent:
        totalCount === 0
          ? 0
          : Math.round((completedCount / totalCount) * 100),
      currentTask,
      pendingTasks,
      completedTasks,
    };
  });
}
