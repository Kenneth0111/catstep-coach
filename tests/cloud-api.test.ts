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
        result: {
          source: 'fallback',
          plan: {
            summary: '先走一步',
            tasks: [
              {
                title: '写下下一步',
                action: '写下一条具体行动',
                estimatedMinutes: 15,
                doneCriteria: '写下一条行动',
                goalId: 'goal-1',
                reason: '先建立起点',
                difficulty: 'easy',
              },
            ],
          },
        },
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

  it.each([
    { source: 'ai', step: {} },
    {
      source: 'unknown',
      step: {
        kind: 'question',
        field: 'deadline',
        question: '何时完成？',
      },
    },
    {
      source: 'ai',
      step: { kind: 'question', field: 'deadline', question: '' },
    },
  ])('rejects malformed nested goal result: %j', async (result) => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, result },
    });

    await expect(
      requestGoalNextStep(
        { type: 'study', title: '学习', answers: [] },
        caller,
      ),
    ).rejects.toEqual(new CloudApiError('INTERNAL_ERROR'));
  });

  it.each([
    { source: 'ai', plan: { summary: '缺少任务', tasks: [] } },
    {
      source: 'ai',
      plan: {
        summary: '字段不完整',
        tasks: [{ title: '只有标题' }],
      },
    },
  ])('rejects malformed nested plan result: %j', async (result) => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, result },
    });

    await expect(
      requestDailyPlan(
        { availableMinutes: 30, goalIds: ['goal-1'] },
        caller,
      ),
    ).rejects.toEqual(new CloudApiError('INTERNAL_ERROR'));
  });

  it('rejects a blank confirmed goal ID', async () => {
    const caller: CloudFunctionCaller = async () => ({
      result: { ok: true, goal: { id: ' ' } },
    });

    await expect(
      confirmGoal(
        {
          requestId: 'request-1',
          type: 'study',
          summary: {
            goal: '学习',
            successCriteria: '完成练习',
            deadline: null,
            currentProgress: '开始',
            suggestedStage: '基础练习',
            excludedContent: [],
          },
        },
        caller,
      ),
    ).rejects.toEqual(new CloudApiError('INTERNAL_ERROR'));
  });
});
