import type {
  GoalAnswer,
  GoalStep,
  GoalSummary,
  GoalType,
  PlanPreview,
  PublicErrorCode,
} from './goal-flow';
import type { TodayPlan } from './today-flow';

export interface CloudFunctionCaller {
  (options: { name: string; data: unknown }): Promise<{ result?: unknown }>;
}

export class CloudApiError extends Error {
  constructor(readonly code: PublicErrorCode) {
    super(code);
    this.name = 'CloudApiError';
  }
}

interface GoalNextStepResult {
  source: 'ai' | 'fallback' | 'repaired';
  step: GoalStep;
}

interface ConfirmedGoalResult {
  id: string;
}

interface DailyPlanResult {
  source: 'ai' | 'fallback' | 'repaired';
  plan: PlanPreview;
}

interface ConfirmedDailyPlanResult {
  id: string;
  date: string;
}

export interface PlanTaskUpdateInput {
  requestId: string;
  planId: string;
  taskId: string;
  action: 'start' | 'complete';
  difficulty?: 'easy' | 'just_right' | 'hard';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isSource(
  value: unknown,
): value is 'ai' | 'fallback' | 'repaired' {
  return value === 'ai' || value === 'fallback' || value === 'repaired';
}

function isDenseTextArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!isText(value[index])) {
      return false;
    }
  }
  return true;
}

function isGoalStep(value: unknown): value is GoalStep {
  if (!isRecord(value)) {
    return false;
  }
  if (value.kind === 'question') {
    return (
      (value.field === 'currentProgress' ||
        value.field === 'deadline' ||
        value.field === 'successCriteria') &&
      isText(value.question)
    );
  }
  if (value.kind !== 'summary' || !isRecord(value.summary)) {
    return false;
  }
  const summary = value.summary;
  return (
    isText(summary.goal) &&
    isText(summary.successCriteria) &&
    (summary.deadline === null || isText(summary.deadline)) &&
    isText(summary.currentProgress) &&
    isText(summary.suggestedStage) &&
    isDenseTextArray(summary.excludedContent)
  );
}

function isPlanResult(
  value: unknown,
  input: { availableMinutes: number; goalIds: string[] },
): value is DailyPlanResult {
  if (
    !isRecord(value) ||
    !isSource(value.source) ||
    !isRecord(value.plan) ||
    !isText(value.plan.summary) ||
    !Array.isArray(value.plan.tasks) ||
    value.plan.tasks.length < 1 ||
    value.plan.tasks.length > 5
  ) {
    return false;
  }

  let totalMinutes = 0;
  for (let index = 0; index < value.plan.tasks.length; index += 1) {
    const task = value.plan.tasks[index];
    if (
      !isRecord(task) ||
      !isText(task.title) ||
      !isText(task.action) ||
      !Number.isInteger(task.estimatedMinutes) ||
      (task.estimatedMinutes as number) <= 0 ||
      !isText(task.doneCriteria) ||
      !isText(task.goalId) ||
      !input.goalIds.includes(task.goalId) ||
      !isText(task.reason) ||
      (task.difficulty !== 'easy' &&
        task.difficulty !== 'medium' &&
        task.difficulty !== 'hard')
    ) {
      return false;
    }
    totalMinutes += task.estimatedMinutes as number;
  }
  return totalMinutes <= input.availableMinutes;
}

function isTodayPlan(value: unknown): value is TodayPlan {
  if (
    !isRecord(value) ||
    !isText(value.id) ||
    !isText(value.date) ||
    !Number.isInteger(value.availableMinutes) ||
    (value.availableMinutes as number) <= 0 ||
    !isText(value.summary) ||
    !Array.isArray(value.tasks) ||
    value.tasks.length < 1 ||
    value.tasks.length > 5
  ) {
    return false;
  }

  let totalMinutes = 0;
  for (let index = 0; index < value.tasks.length; index += 1) {
    const task = value.tasks[index];
    if (
      !isRecord(task) ||
      !isText(task.id) ||
      !isText(task.title) ||
      !isText(task.action) ||
      !Number.isInteger(task.estimatedMinutes) ||
      (task.estimatedMinutes as number) <= 0 ||
      !isText(task.doneCriteria) ||
      !isText(task.goalId) ||
      !isText(task.reason) ||
      (task.difficulty !== 'easy' &&
        task.difficulty !== 'medium' &&
        task.difficulty !== 'hard') ||
      !Number.isInteger(task.priority) ||
      (task.priority as number) <= 0 ||
      (task.status !== 'pending' &&
        task.status !== 'in_progress' &&
        task.status !== 'completed') ||
      (task.difficultyFeedback !== undefined &&
        task.difficultyFeedback !== 'easy' &&
        task.difficultyFeedback !== 'just_right' &&
        task.difficultyFeedback !== 'hard')
    ) {
      return false;
    }
    totalMinutes += task.estimatedMinutes as number;
  }
  return totalMinutes <= (value.availableMinutes as number);
}

function isPublicErrorCode(value: unknown): value is PublicErrorCode {
  return (
    value === 'UNAUTHENTICATED' ||
    value === 'INVALID_CONTEXT' ||
    value === 'MISCONFIGURED' ||
    value === 'INTERNAL_ERROR'
  );
}

const platformCaller: CloudFunctionCaller = async (options) => {
  const callFunction = wx.cloud.callFunction as unknown as (request: {
    name: string;
    data: WechatMiniprogram.IAnyObject;
  }) => Promise<{ result?: unknown }>;
  return callFunction({
    name: options.name,
    data: options.data as WechatMiniprogram.IAnyObject,
  });
};

async function callCloudFunction(
  name: string,
  data: unknown,
  caller: CloudFunctionCaller,
): Promise<Record<string, unknown>> {
  let response: { result?: unknown };
  try {
    response = await caller({ name, data });
  } catch {
    throw new CloudApiError('INTERNAL_ERROR');
  }

  if (!isRecord(response.result)) {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  if (response.result.ok === false) {
    throw new CloudApiError(
      isPublicErrorCode(response.result.code)
        ? response.result.code
        : 'INTERNAL_ERROR',
    );
  }
  if (response.result.ok !== true) {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  return response.result;
}

export async function requestGoalNextStep(
  input: { type: GoalType; title: string; answers: GoalAnswer[] },
  caller: CloudFunctionCaller = platformCaller,
): Promise<GoalNextStepResult> {
  const response = await callCloudFunction('goal-next-step', input, caller);
  if (
    !isRecord(response.result) ||
    !isSource(response.result.source) ||
    !isGoalStep(response.result.step)
  ) {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  return response.result as unknown as GoalNextStepResult;
}

export async function confirmGoal(
  input: { requestId: string; type: GoalType; summary: GoalSummary },
  caller: CloudFunctionCaller = platformCaller,
): Promise<ConfirmedGoalResult> {
  const response = await callCloudFunction('goal-confirm', input, caller);
  if (!isRecord(response.goal) || !isText(response.goal.id)) {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  return response.goal as unknown as ConfirmedGoalResult;
}

export async function requestDailyPlan(
  input: { availableMinutes: number; goalIds: string[] },
  caller: CloudFunctionCaller = platformCaller,
): Promise<DailyPlanResult> {
  const response = await callCloudFunction('plan-generate', input, caller);
  if (!isPlanResult(response.result, input)) {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  return response.result as unknown as DailyPlanResult;
}

export async function confirmDailyPlan(
  input: {
    requestId: string;
    availableMinutes: number;
    plan: PlanPreview;
  },
  caller: CloudFunctionCaller = platformCaller,
): Promise<ConfirmedDailyPlanResult> {
  const response = await callCloudFunction('plan-confirm', input, caller);
  if (
    !isRecord(response.plan) ||
    !isText(response.plan.id) ||
    !isText(response.plan.date)
  ) {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  return response.plan as unknown as ConfirmedDailyPlanResult;
}

export async function getTodayPlan(
  caller: CloudFunctionCaller = platformCaller,
): Promise<TodayPlan | null> {
  const response = await callCloudFunction('plan-get-today', {}, caller);
  if (response.plan === null) {
    return null;
  }
  if (!isTodayPlan(response.plan)) {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  return response.plan;
}

export async function updatePlanTask(
  input: PlanTaskUpdateInput,
  caller: CloudFunctionCaller = platformCaller,
): Promise<TodayPlan> {
  const response = await callCloudFunction('plan-update-task', input, caller);
  if (!isTodayPlan(response.plan) || !matchesTaskUpdate(input, response.plan)) {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  return response.plan;
}

function matchesTaskUpdate(
  input: PlanTaskUpdateInput,
  plan: TodayPlan,
): boolean {
  if (plan.id !== input.planId) {
    return false;
  }
  const task = plan.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task) {
    return false;
  }
  if (input.action === 'start') {
    return task.status === 'in_progress' || task.status === 'completed';
  }
  return (
    task.status === 'completed' &&
    task.difficultyFeedback === input.difficulty
  );
}
