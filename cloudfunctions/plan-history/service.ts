export type HistoryTaskStatus = 'pending' | 'in_progress' | 'completed';

export interface StoredHistoryTask {
  id: string;
  title: string;
  estimatedMinutes: number;
  doneCriteria: string;
  goalId: string;
  priority: number;
  status: HistoryTaskStatus;
  difficultyFeedback?: 'easy' | 'just_right' | 'hard';
}

export interface StoredHistoryPlan {
  id: string;
  date: string;
  availableMinutes: number;
  summary: string;
  tasks: StoredHistoryTask[];
}

export interface HistoryReview {
  completionSummary: string;
  encouragement: string;
  nextSuggestion: string;
}

export interface PlanHistoryRepository {
  findConfirmedPlans(openid: string, startDate: string, endDate: string): Promise<StoredHistoryPlan[]>;
  findGoalTitles(openid: string, goalIds: readonly string[]): Promise<Record<string, string>>;
  findConfirmedReview(openid: string, planId: string): Promise<HistoryReview | null>;
}

export interface PlanHistoryResult {
  month: string;
  selectedDate: string;
  planDates: string[];
  selectedDay: null | {
    date: string;
    availableMinutes: number;
    summary: string;
    groups: Array<{ goalId: string; goalTitle: string; tasks: StoredHistoryTask[] }>;
    review: HistoryReview | null;
  };
}

export class PlanHistoryError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'PlanHistoryError';
  }
}

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidMonth(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = MONTH_PATTERN.exec(value);
  return match !== null && Number(match[2]) >= 1 && Number(match[2]) <= 12;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function monthInShanghai(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

function invalidContext(): never {
  throw new PlanHistoryError('INVALID_CONTEXT');
}

export async function getPlanHistory(
  openid: string,
  input: unknown,
  repository: PlanHistoryRepository,
  now: () => Date,
): Promise<PlanHistoryResult> {
  if (!openid || typeof input !== 'object' || input === null) invalidContext();
  const context = input as { month?: unknown; selectedDate?: unknown };
  const month = context.month;
  const selectedDate = context.selectedDate;
  if (!isValidMonth(month) || !isValidDate(selectedDate) || !selectedDate.startsWith(`${month}-`)) {
    invalidContext();
  }
  if (month > monthInShanghai(now())) invalidContext();

  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const nextMonth = monthNumber === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`;
  const plans = await repository.findConfirmedPlans(openid, `${month}-01`, nextMonth);
  const planDates = [...new Set(plans.map((plan) => plan.date))].sort();
  const selectedPlan = plans.find((plan) => plan.date === selectedDate);
  if (!selectedPlan) return { month, selectedDate, planDates, selectedDay: null };

  const goalIds: string[] = [];
  const tasksByGoal = new Map<string, StoredHistoryTask[]>();
  for (const task of selectedPlan.tasks) {
    if (!tasksByGoal.has(task.goalId)) {
      goalIds.push(task.goalId);
      tasksByGoal.set(task.goalId, []);
    }
    tasksByGoal.get(task.goalId)?.push(task);
  }
  const [goalTitles, review] = await Promise.all([
    repository.findGoalTitles(openid, goalIds),
    repository.findConfirmedReview(openid, selectedPlan.id),
  ]);
  const groups = goalIds.map((goalId) => ({
    goalId,
    goalTitle: goalTitles[goalId] || '历史目标',
    tasks: tasksByGoal.get(goalId) ?? [],
  }));
  return {
    month,
    selectedDate,
    planDates,
    selectedDay: {
      date: selectedPlan.date,
      availableMinutes: selectedPlan.availableMinutes,
      summary: selectedPlan.summary,
      groups,
      review,
    },
  };
}
