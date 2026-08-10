import { getTodayPlan, type TodayPlanRepository } from './service';

export interface PlanGetTodayDependencies {
  getOpenid(context: unknown): string | undefined;
  createRepository(): TodayPlanRepository;
  now(): Date;
}

export async function handlePlanGetToday(
  context: unknown,
  dependencies: PlanGetTodayDependencies,
) {
  try {
    const openid = dependencies.getOpenid(context);
    if (!openid?.trim()) {
      return { ok: false as const, code: 'UNAUTHENTICATED' as const };
    }

    const plan = await getTodayPlan(
      openid,
      dependencies.createRepository(),
      dependencies.now,
    );
    return { ok: true as const, plan };
  } catch {
    return { ok: false as const, code: 'INTERNAL_ERROR' as const };
  }
}
