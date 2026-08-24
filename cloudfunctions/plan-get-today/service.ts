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
  groups: TodayGoalGroup[];
}

export interface TodayGoalGroup {
  goalId: string;
  goalTitle: string;
  tasks: PersistedDailyPlanTask[];
}

export interface TodayPlanRepository {
  findConfirmedByDate(
    openid: string,
    date: string,
  ): Promise<ConfirmedDailyPlan | null>;
  findOwnedGoalTitles(
    openid: string,
    goalIds: readonly string[],
  ): Promise<Record<string, string>>;
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
  const tasks = plan.tasks.map((task) => ({
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
    ...(task.difficultyFeedback === undefined
      ? {}
      : { difficultyFeedback: task.difficultyFeedback }),
  }));
  return {
    id: plan.id,
    date: plan.date,
    availableMinutes: plan.availableMinutes,
    summary: plan.summary,
    tasks,
    groups: [],
  };
}

function goalTitleFor(goalTitles: Record<string, string>, goalId: string): string {
  const title = goalTitles[goalId];
  return typeof title === 'string' && title.trim() ? title : '今日目标';
}

function groupTasks(
  tasks: PersistedDailyPlanTask[],
  goalTitles: Record<string, string>,
): TodayGoalGroup[] {
  const groups = new Map<string, TodayGoalGroup>();
  const orderedGroups: TodayGoalGroup[] = [];
  for (const task of tasks) {
    let group = groups.get(task.goalId);
    if (!group) {
      group = {
        goalId: task.goalId,
        goalTitle: goalTitleFor(goalTitles, task.goalId),
        tasks: [],
      };
      groups.set(task.goalId, group);
      orderedGroups.push(group);
    }
    group.tasks.push(task);
  }
  return orderedGroups;
}

async function toGroupedTodayPlan(
  openid: string,
  plan: ConfirmedDailyPlan,
  repository: TodayPlanRepository,
): Promise<TodayPlan> {
  const todayPlan = toTodayPlan(plan);
  const goalIds = [...new Set(todayPlan.tasks.map((task) => task.goalId))];
  const goalTitles = goalIds.length === 0
    ? {}
    : await repository.findOwnedGoalTitles(openid, goalIds);
  return {
    ...todayPlan,
    groups: groupTasks(todayPlan.tasks, goalTitles),
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
  return plan ? toGroupedTodayPlan(openid, plan, repository) : null;
}
