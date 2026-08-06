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

export function selectCurrentTask(
  tasks: readonly TodayTask[],
): TodayTask | null {
  return (
    [...tasks]
      .filter((task) => task.status !== 'completed')
      .sort((left, right) => left.priority - right.priority)[0] ?? null
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
