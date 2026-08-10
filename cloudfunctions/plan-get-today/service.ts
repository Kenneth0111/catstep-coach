import type {
  ConfirmedDailyPlan,
  PersistedDailyPlanTask,
} from '../plan-confirm/service';

export interface TodayPlan {
  id: string;
  date: string;
  availableMinutes: number;
  summary: string;
  tasks: PersistedDailyPlanTask[];
}

export interface TodayPlanRepository {
  findConfirmedByDate(
    openid: string,
    date: string,
  ): Promise<ConfirmedDailyPlan | null>;
}

export class TodayPlanError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'TodayPlanError';
  }
}

const shanghaiDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toTodayPlan(plan: ConfirmedDailyPlan): TodayPlan {
  return {
    id: plan.id,
    date: plan.date,
    availableMinutes: plan.availableMinutes,
    summary: plan.summary,
    tasks: plan.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      action: task.action,
      estimatedMinutes: task.estimatedMinutes,
      doneCriteria: task.doneCriteria,
      goalId: task.goalId,
      reason: task.reason,
      difficulty: task.difficulty,
      priority: task.priority,
      status: task.status,
    })),
  };
}

export async function getTodayPlan(
  openid: string,
  repository: TodayPlanRepository,
  now: () => Date,
): Promise<TodayPlan | null> {
  if (!openid.trim()) {
    throw new TodayPlanError('INVALID_CONTEXT');
  }

  const plan = await repository.findConfirmedByDate(
    openid,
    shanghaiDate.format(now()),
  );
  return plan ? toTodayPlan(plan) : null;
}
