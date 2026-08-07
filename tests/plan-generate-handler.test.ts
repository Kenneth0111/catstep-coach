import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../cloudfunctions/shared/ai-provider';
import type { OwnedGoalRepository } from '../cloudfunctions/plan-generate/service';
import { handlePlanGenerate } from '../cloudfunctions/plan-generate/handler';

const event = { availableMinutes: 45, goalIds: ['goal-1'] };
const plan = {
  summary: '今天先走一小步。',
  tasks: [
    {
      title: '完成练习',
      action: '完成五道类型练习',
      estimatedMinutes: 30,
      doneCriteria: '五道练习通过',
      goalId: 'goal-1',
      reason: '巩固基础',
      difficulty: 'medium',
    },
  ],
};

function ownedRepository(): OwnedGoalRepository {
  return {
    async findActiveByIds() {
      return [{ id: 'goal-1' }];
    },
  };
}

function dependencies(options?: {
  openid?: string;
  apiKey?: string;
  model?: string;
  repository?: OwnedGoalRepository;
  provider?: AIProvider;
}) {
  const createProvider = vi.fn(
    () =>
      options?.provider ?? {
        generateStructured: vi.fn(async () => plan),
      },
  );
  const createRepository = vi.fn(
    () => options?.repository ?? ownedRepository(),
  );
  return {
    getOpenid: () => options?.openid,
    env: {
      TOKENHUB_API_KEY: options?.apiKey,
      TOKENHUB_MODEL: options?.model,
    },
    createProvider,
    createRepository,
  };
}

describe('plan.generate handler', () => {
  it('rejects unauthenticated requests before creating dependencies', async () => {
    const deps = dependencies({ apiKey: 'secret', model: 'hy3' });

    await expect(handlePlanGenerate(event, {}, deps)).resolves.toEqual({
      ok: false,
      code: 'UNAUTHENTICATED',
    });
    expect(deps.createRepository).not.toHaveBeenCalled();
    expect(deps.createProvider).not.toHaveBeenCalled();
  });

  it('rejects missing server configuration', async () => {
    const deps = dependencies({ openid: 'user-1', model: 'hy3' });

    await expect(handlePlanGenerate(event, {}, deps)).resolves.toEqual({
      ok: false,
      code: 'MISCONFIGURED',
    });
    expect(deps.createRepository).not.toHaveBeenCalled();
    expect(deps.createProvider).not.toHaveBeenCalled();
  });

  it('returns a generated plan for owned goals', async () => {
    const deps = dependencies({
      openid: 'user-1',
      apiKey: 'secret',
      model: 'hy3',
    });

    await expect(handlePlanGenerate(event, {}, deps)).resolves.toEqual({
      ok: true,
      result: { source: 'ai', plan },
    });
    expect(deps.createProvider).toHaveBeenCalledWith({
      apiKey: 'secret',
      model: 'hy3',
      baseUrl: undefined,
    });
  });

  it('returns a usable fallback when TokenHub remains unavailable', async () => {
    const deps = dependencies({
      openid: 'user-1',
      apiKey: 'secret',
      model: 'hy3',
      provider: {
        async generateStructured() {
          throw new Error('offline');
        },
      },
    });

    const result = await handlePlanGenerate(event, {}, deps);

    expect(result).toMatchObject({
      ok: true,
      result: {
        source: 'fallback',
        plan: { tasks: [{ goalId: 'goal-1' }] },
      },
    });
  });

  it('rejects foreign goals without creating a provider', async () => {
    const deps = dependencies({
      openid: 'user-1',
      apiKey: 'secret',
      model: 'hy3',
      repository: { async findActiveByIds() { return []; } },
    });

    await expect(handlePlanGenerate(event, {}, deps)).resolves.toEqual({
      ok: false,
      code: 'INVALID_CONTEXT',
    });
    expect(deps.createProvider).not.toHaveBeenCalled();
  });

  it('does not expose unexpected repository errors', async () => {
    const deps = dependencies({
      openid: 'user-1',
      apiKey: 'secret',
      model: 'hy3',
      repository: {
        async findActiveByIds() {
          throw new Error('database-secret-detail');
        },
      },
    });

    const result = await handlePlanGenerate(event, {}, deps);

    expect(result).toEqual({ ok: false, code: 'INTERNAL_ERROR' });
    expect(JSON.stringify(result)).not.toContain('database-secret-detail');
  });
});
