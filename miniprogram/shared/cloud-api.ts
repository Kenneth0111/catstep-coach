import type {
  GoalAnswer,
  GoalStep,
  GoalSummary,
  GoalType,
  PlanPreview,
  PublicErrorCode,
} from './goal-flow';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  if (!isRecord(response.result)) {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  return response.result as unknown as GoalNextStepResult;
}

export async function confirmGoal(
  input: { requestId: string; type: GoalType; summary: GoalSummary },
  caller: CloudFunctionCaller = platformCaller,
): Promise<ConfirmedGoalResult> {
  const response = await callCloudFunction('goal-confirm', input, caller);
  if (!isRecord(response.goal) || typeof response.goal.id !== 'string') {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  return response.goal as unknown as ConfirmedGoalResult;
}

export async function requestDailyPlan(
  input: { availableMinutes: number; goalIds: string[] },
  caller: CloudFunctionCaller = platformCaller,
): Promise<DailyPlanResult> {
  const response = await callCloudFunction('plan-generate', input, caller);
  if (!isRecord(response.result)) {
    throw new CloudApiError('INTERNAL_ERROR');
  }
  return response.result as unknown as DailyPlanResult;
}
