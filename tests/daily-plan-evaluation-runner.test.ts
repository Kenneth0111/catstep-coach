import { describe, expect, it, vi } from 'vitest';
import {
  DailyPlanEvaluationRunnerError,
  runDailyPlanEvaluation,
} from '../cloudfunctions/plan-generate/evaluation';

function responseForRequest(request: RequestInit): Response {
  const body = JSON.parse(request.body as string) as {
    messages: Array<{ role: string; content: string }>;
  };
  const input = JSON.parse(body.messages.find((message) => message.role === 'user')!.content) as {
    input: { availableMinutes: number; goalIds: string[] };
  };
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({
      summary: '先完成一个脱敏的练习。',
      tasks: [{
        title: '完成一个小练习',
        action: '完成一个与目标相关的小练习',
        estimatedMinutes: input.input.availableMinutes,
        doneCriteria: '完成练习并记录结果',
        goalId: input.input.goalIds[0],
        reason: '验证结构化计划输出',
        difficulty: 'easy',
      }],
    }) } }],
  }), { status: 200 });
}

describe('daily plan evaluation runner', () => {
  it('reports only sanitized structural results for all de-identified cases', async () => {
    const fetchRequest = vi.fn<typeof fetch>(async (_url, request) => responseForRequest(request!));

    const result = await runDailyPlanEvaluation(
      { TOKENHUB_API_KEY: 'api-secret', TOKENHUB_MODEL: 'hy3' },
      fetchRequest,
    );

    expect(result).toMatchObject({ model: 'hy3', total: 30, structurallyValid: 30 });
    expect(result.cases).toHaveLength(30);
    expect(result.cases[0]).toEqual({ caseId: 'daily-plan-01', structurallyValid: true });
    expect(fetchRequest).toHaveBeenCalledTimes(30);
    expect(JSON.stringify(result)).not.toContain('api-secret');
    expect(JSON.stringify(result)).not.toContain('完成一个小练习');
  });

  it('uses the production DeepSeek request mode for direct DeepSeek evaluation', async () => {
    const fetchRequest = vi.fn<typeof fetch>(async (_url, request) => responseForRequest(request!));

    await runDailyPlanEvaluation(
      {
        TOKENHUB_API_KEY: 'api-secret',
        TOKENHUB_MODEL: 'deepseek-v4-flash',
        TOKENHUB_BASE_URL: 'https://api.deepseek.com',
      },
      fetchRequest,
    );

    expect(fetchRequest).toHaveBeenCalledTimes(30);
    expect(fetchRequest.mock.calls[0]?.[0]).toBe('https://api.deepseek.com/chat/completions');
    expect(JSON.parse(fetchRequest.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      thinking: { type: 'disabled' },
    });
  });

  it('runs only the requested evaluation case', async () => {
    const fetchRequest = vi.fn<typeof fetch>(async (_url, request) => responseForRequest(request!));

    const result = await runDailyPlanEvaluation(
      {
        TOKENHUB_API_KEY: 'api-secret',
        TOKENHUB_MODEL: 'deepseek-v4-flash',
        DAILY_PLAN_EVALUATION_CASE_ID: 'daily-plan-05',
      },
      fetchRequest,
    );

    expect(result).toMatchObject({ total: 1, structurallyValid: 1 });
    expect(result.cases).toEqual([{ caseId: 'daily-plan-05', structurallyValid: true }]);
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });

  it('does not call the network for an unknown evaluation case', async () => {
    const fetchRequest = vi.fn<typeof fetch>();

    await expect(runDailyPlanEvaluation(
      {
        TOKENHUB_API_KEY: 'api-secret',
        TOKENHUB_MODEL: 'deepseek-v4-flash',
        DAILY_PLAN_EVALUATION_CASE_ID: 'daily-plan-99',
      },
      fetchRequest,
    )).rejects.toEqual(new DailyPlanEvaluationRunnerError('MISCONFIGURED'));
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it('does not call the network without a complete TokenHub configuration', async () => {
    const fetchRequest = vi.fn<typeof fetch>();

    await expect(runDailyPlanEvaluation(
      { TOKENHUB_API_KEY: undefined, TOKENHUB_MODEL: 'hy3' },
      fetchRequest,
    )).rejects.toEqual(new DailyPlanEvaluationRunnerError('MISCONFIGURED'));
    expect(fetchRequest).not.toHaveBeenCalled();
  });
});
