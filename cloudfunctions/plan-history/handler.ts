import {
  getPlanHistory,
  PlanHistoryError,
  type PlanHistoryRepository,
} from './service';

export interface PlanHistoryDependencies {
  getOpenid(context: unknown): string | undefined;
  createRepository(): PlanHistoryRepository;
  now(): Date;
}

export async function handlePlanHistory(
  event: unknown,
  context: unknown,
  dependencies: PlanHistoryDependencies,
) {
  try {
    const openid = dependencies.getOpenid(context);
    if (!openid?.trim()) {
      return { ok: false as const, code: 'UNAUTHENTICATED' as const };
    }

    const result = await getPlanHistory(
      openid,
      event,
      dependencies.createRepository(),
      dependencies.now,
    );
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      code: error instanceof PlanHistoryError ? 'INVALID_CONTEXT' as const : 'INTERNAL_ERROR' as const,
    };
  }
}
