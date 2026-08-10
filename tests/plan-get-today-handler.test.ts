import { describe, expect, it, vi } from 'vitest';
import { handlePlanGetToday } from '../cloudfunctions/plan-get-today/handler';
import type { TodayPlanRepository } from '../cloudfunctions/plan-get-today/service';

function repository(): TodayPlanRepository {
  return {
    async findConfirmedByDate() {
      return null;
    },
  };
}

describe('plan.getToday handler', () => {
  it('rejects unauthenticated requests before creating a repository', async () => {
    const createRepository = vi.fn(repository);

    await expect(
      handlePlanGetToday({}, {
        getOpenid: () => undefined,
        createRepository,
        now: () => new Date(),
      }),
    ).resolves.toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('returns a nullable current plan', async () => {
    await expect(
      handlePlanGetToday({}, {
        getOpenid: () => 'user-1',
        createRepository: repository,
        now: () => new Date(),
      }),
    ).resolves.toEqual({ ok: true, plan: null });
  });

  it('sanitizes identity and repository errors', async () => {
    const identityFailure = handlePlanGetToday({}, {
      getOpenid: () => {
        throw new Error('identity-secret');
      },
      createRepository: repository,
      now: () => new Date(),
    });
    const repositoryFailure = handlePlanGetToday({}, {
      getOpenid: () => 'user-1',
      createRepository: () => ({
        async findConfirmedByDate() {
          throw new Error('database-secret');
        },
      }),
      now: () => new Date(),
    });

    await expect(identityFailure).resolves.toEqual({
      ok: false,
      code: 'INTERNAL_ERROR',
    });
    await expect(repositoryFailure).resolves.toEqual({
      ok: false,
      code: 'INTERNAL_ERROR',
    });
  });
});
