import { describe, expect, it, vi } from 'vitest';
import {
  CloudApiError,
  confirmGoal,
  requestDailyPlan,
  requestGoalNextStep,
  type CloudFunctionCaller,
} from '../miniprogram/shared/cloud-api';

describe('Mini Program CloudBase API boundary', () => {
  it('calls goal-next-step with the exact clarification input', async () => {
    const input = { type: 'study' as const, title: '学习测试', answers: [] };
    const caller = vi.fn(async () => ({
      result: {
        ok: true,
        result: {
          source: 'ai',
          step: {
            kind: 'question',
            field: 'currentProgress',
            question: '你已经学到哪里了？',
          },
        },
      },
    })) satisfies CloudFunctionCaller;

    await requestGoalNextStep(input, caller);

    expect(caller).toHaveBeenCalledWith({ name: 'goal-next-step', data: input });
  });

  it('calls goal-confirm with the exact confirmation input', async () => {
    const input = {
      requestId: 'request-1',
      type: 'study' as const,
      summary: {
        goal: '学习测试',
        successCriteria: '完成练习',
        deadline: null,
        currentProgress: '刚开始',
        suggestedStage: '完成基础练习',
        excludedContent: [],
      },
    };
    const caller = vi.fn(async () => ({
      result: { ok: true, goal: { id: 'goal-1' } },
    })) satisfies CloudFunctionCaller;

    await confirmGoal(input, caller);

    expect(caller).toHaveBeenCalledWith({ name: 'goal-confirm', data: input });
  });

  it('calls plan-generate with the exact trusted constraints request', async () => {
    const input = { availableMinutes: 30, goalIds: ['goal-1'] };
    const caller = vi.fn(async () => ({
      result: {
        ok: true,
        result: { source: 'fallback', plan: { summary: '先走一步', tasks: [] } },
      },
    })) satisfies CloudFunctionCaller;

    await requestDailyPlan(input, caller);

    expect(caller).toHaveBeenCalledWith({ name: 'plan-generate', data: input });
  });

  it.each([
    'UNAUTHENTICATED',
    'INVALID_CONTEXT',
    'MISCONFIGURED',
    'INTERNAL_ERROR',
  ] as const)('maps the public server error %s', async (code) => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: false, code },
    });

    await expect(
      requestGoalNextStep(
        { type: 'study', title: '学习', answers: [] },
        caller,
      ),
    ).rejects.toEqual(new CloudApiError(code));
  });

  it.each([{}, { result: null }, { result: { ok: true } }])(
    'maps malformed platform response to INTERNAL_ERROR: %j',
    async (response) => {
      const caller: CloudFunctionCaller = async () => response;

      await expect(
        requestGoalNextStep(
          { type: 'study', title: '学习', answers: [] },
          caller,
        ),
      ).rejects.toEqual(new CloudApiError('INTERNAL_ERROR'));
    },
  );
});
