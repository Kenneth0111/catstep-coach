export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface TodayTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  status: TaskStatus;
  priority: number;
}

export interface PlanSummary {
  remainingCount: number;
  remainingMinutes: number;
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

  return {
    remainingCount: remaining.length,
    remainingMinutes: remaining.reduce(
      (total, task) => total + task.estimatedMinutes,
      0,
    ),
  };
}
