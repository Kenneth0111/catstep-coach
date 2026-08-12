export type TaskDifficulty = 'easy' | 'medium' | 'hard';

export interface DailyPlanTask {
  title: string;
  action: string;
  estimatedMinutes: number;
  doneCriteria: string;
  goalId: string;
  reason: string;
  difficulty: TaskDifficulty;
}

export interface DailyPlan {
  summary: string;
  tasks: DailyPlanTask[];
}

export interface DailyPlanGoalContext {
  id: string;
  title: string;
  successCriteria: string;
  currentProgress: string;
  stage: string;
}

/** Trusted server-side context, not model output. */
export interface DailyPlanConstraints {
  availableMinutes: number;
  goalIds: readonly string[];
  goals?: readonly DailyPlanGoalContext[];
}

export type DailyPlanValidationCode =
  | 'DUPLICATE_TASK'
  | 'INCOMPLETE_FIELD'
  | 'INVALID_DIFFICULTY'
  | 'INVALID_DURATION'
  | 'TASK_COUNT'
  | 'TOTAL_DURATION'
  | 'UNKNOWN_GOAL'
  | 'INTERNAL_ID_EXPOSED';

export class DailyPlanValidationError extends Error {
  constructor(readonly code: DailyPlanValidationCode) {
    super(code);
    this.name = 'DailyPlanValidationError';
  }
}

const requiredTaskTextFields = [
  'title',
  'action',
  'doneCriteria',
  'goalId',
  'reason',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasRequiredTaskText(task: unknown): boolean {
  return (
    isRecord(task) &&
    requiredTaskTextFields.every(
      (field) =>
        typeof task[field] === 'string' &&
        Boolean((task[field] as string).trim()),
    )
  );
}

export function validateDailyPlanStructure(
  candidate: unknown,
  constraints: DailyPlanConstraints,
): DailyPlan {
  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('summary' in candidate) ||
    typeof candidate.summary !== 'string' ||
    !candidate.summary.trim() ||
    !('tasks' in candidate) ||
    !Array.isArray(candidate.tasks)
  ) {
    throw new DailyPlanValidationError('INCOMPLETE_FIELD');
  }

  if (candidate.tasks.length < 1 || candidate.tasks.length > 5) {
    throw new DailyPlanValidationError('TASK_COUNT');
  }

  for (let index = 0; index < candidate.tasks.length; index += 1) {
    if (!hasRequiredTaskText(candidate.tasks[index])) {
      throw new DailyPlanValidationError('INCOMPLETE_FIELD');
    }
  }

  const difficulties: readonly unknown[] = ['easy', 'medium', 'hard'];
  if (
    candidate.tasks.some(
      (task) =>
        typeof task !== 'object' ||
        task === null ||
        !('difficulty' in task) ||
        !difficulties.includes(task.difficulty),
    )
  ) {
    throw new DailyPlanValidationError('INVALID_DIFFICULTY');
  }

  if (
    candidate.tasks.some(
      (task) =>
        typeof task !== 'object' ||
        task === null ||
        !('estimatedMinutes' in task) ||
        !Number.isInteger(task.estimatedMinutes) ||
        (task.estimatedMinutes as number) <= 0 ||
        (task.estimatedMinutes as number) > constraints.availableMinutes,
    )
  ) {
    throw new DailyPlanValidationError('INVALID_DURATION');
  }

  const totalMinutes = candidate.tasks.reduce(
    (total, task) =>
      total +
      (task as { estimatedMinutes: number }).estimatedMinutes,
    0,
  );
  if (totalMinutes > constraints.availableMinutes) {
    throw new DailyPlanValidationError('TOTAL_DURATION');
  }

  if (
    candidate.tasks.some(
      (task) =>
        !constraints.goalIds.includes((task as { goalId: string }).goalId),
    )
  ) {
    throw new DailyPlanValidationError('UNKNOWN_GOAL');
  }

  const userVisibleText = [
    candidate.summary,
    ...candidate.tasks.flatMap((task) => {
      const { title, action, doneCriteria, reason } = task as {
        title: string;
        action: string;
        doneCriteria: string;
        reason: string;
      };
      return [title, action, doneCriteria, reason];
    }),
  ];
  if (
    constraints.goalIds.some((goalId) =>
      userVisibleText.some((text) => text.includes(goalId)),
    )
  ) {
    throw new DailyPlanValidationError('INTERNAL_ID_EXPOSED');
  }

  const taskKeys = candidate.tasks.map((task) => {
    const { action, title } = task as { action: string; title: string };
    return `${title.trim().toLowerCase()}\u0000${action
      .trim()
      .toLowerCase()}`;
  });
  if (new Set(taskKeys).size !== taskKeys.length) {
    throw new DailyPlanValidationError('DUPLICATE_TASK');
  }

  return candidate as DailyPlan;
}
