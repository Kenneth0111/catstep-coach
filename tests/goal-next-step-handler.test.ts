import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../cloudfunctions/shared/ai-provider';
import { handleGoalNextStep } from '../cloudfunctions/goal-next-step/handler';

const validEvent = {
  type: 'study',
  title: '学会 TypeScript',
  answers: [],
};

function createDependencies(options?: {
  openid?: string;
  apiKey?: string;
  model?: string;
  provider?: AIProvider;
}) {
  const provider =
    options?.provider ??
    ({
      generateStructured: vi.fn(async () => ({
        kind: 'question',
        field: 'currentProgress',
        question: '你已经学到哪里了？',
      })),
    } satisfies AIProvider);
  const createProvider = vi.fn(() => provider);

  return {
    dependencies: {
      getOpenid: () => options?.openid,
      env: {
        TOKENHUB_API_KEY: options?.apiKey,
        TOKENHUB_MODEL: options?.model,
      },
      createProvider,
    },
    createProvider,
  };
}

describe('goal.nextStep cloud function handler', () => {
  it('rejects unauthenticated requests before creating a provider', async () => {
    const { dependencies, createProvider } = createDependencies({
      apiKey: 'secret',
      model: 'hy3',
    });

    await expect(
      handleGoalNextStep(validEvent, {}, dependencies),
    ).resolves.toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it.each([
    { apiKey: undefined, model: 'hy3' },
    { apiKey: 'secret', model: undefined },
  ])('rejects incomplete server configuration: %j', async (configuration) => {
    const { dependencies, createProvider } = createDependencies({
      openid: 'user-1',
      ...configuration,
    });

    await expect(
      handleGoalNextStep(validEvent, {}, dependencies),
    ).resolves.toEqual({ ok: false, code: 'MISCONFIGURED' });
    expect(createProvider).not.toHaveBeenCalled();
  });

  it('returns the validated next step for an authenticated request', async () => {
    const { dependencies, createProvider } = createDependencies({
      openid: 'user-1',
      apiKey: 'secret',
      model: 'hy3',
    });

    await expect(
      handleGoalNextStep(validEvent, {}, dependencies),
    ).resolves.toEqual({
      ok: true,
      result: {
        source: 'ai',
        step: {
          kind: 'question',
          field: 'currentProgress',
          question: '你已经学到哪里了？',
        },
      },
    });
    expect(createProvider).toHaveBeenCalledWith({
      apiKey: 'secret',
      model: 'hy3',
      baseUrl: undefined,
    });
  });

  it('maps invalid request data to a stable public error', async () => {
    const { dependencies } = createDependencies({
      openid: 'user-1',
      apiKey: 'secret',
      model: 'hy3',
    });

    await expect(handleGoalNextStep(null, {}, dependencies)).resolves.toEqual({
      ok: false,
      code: 'INVALID_CONTEXT',
    });
  });
});
