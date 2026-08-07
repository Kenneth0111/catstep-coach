import { describe, expect, it, vi } from 'vitest';
import {
  TokenHubSmokeError,
  runTokenHubSmoke,
} from '../cloudfunctions/plan-generate/smoke';

const validPlan = {
  summary: '先验证一个合成步骤。',
  tasks: [
    {
      title: '运行合约检查',
      action: '验证 TokenHub 返回结构',
      estimatedMinutes: 15,
      doneCriteria: '结构校验通过',
      goalId: 'smoke-goal',
      reason: '确认开发环境连通',
      difficulty: 'easy',
    },
  ],
};

function tokenHubResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
    { status: 200 },
  );
}

describe('TokenHub smoke runner', () => {
  it.each([
    { TOKENHUB_API_KEY: undefined, TOKENHUB_MODEL: 'hy3' },
    { TOKENHUB_API_KEY: 'secret', TOKENHUB_MODEL: undefined },
  ])('rejects missing configuration before network access', async (env) => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(runTokenHubSmoke(env, fetchMock)).rejects.toEqual(
      new TokenHubSmokeError('MISCONFIGURED'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports only sanitized structural success metadata', async () => {
    const times = [100, 145];
    const result = await runTokenHubSmoke(
      { TOKENHUB_API_KEY: 'secret', TOKENHUB_MODEL: 'hy3' },
      async () => tokenHubResponse(validPlan),
      () => times.shift() as number,
    );

    expect(result).toEqual({
      ok: true,
      model: 'hy3',
      latencyMs: 45,
      structurallyValid: true,
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('运行合约检查');
  });

  it('sanitizes HTTP failures and upstream response bodies', async () => {
    const failure = runTokenHubSmoke(
      { TOKENHUB_API_KEY: 'api-secret', TOKENHUB_MODEL: 'hy3' },
      async () => new Response('upstream-secret-body', { status: 401 }),
    );

    await expect(failure).rejects.toEqual(new TokenHubSmokeError('FAILED'));
    await expect(failure).rejects.not.toThrow(/api-secret|upstream-secret-body/);
  });

  it('fails when model output violates the daily plan contract', async () => {
    await expect(
      runTokenHubSmoke(
        { TOKENHUB_API_KEY: 'secret', TOKENHUB_MODEL: 'hy3' },
        async () => tokenHubResponse({ summary: '没有任务', tasks: [] }),
      ),
    ).rejects.toEqual(new TokenHubSmokeError('FAILED'));
  });
});
