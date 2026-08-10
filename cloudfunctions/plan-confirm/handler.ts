import {
  PlanConfirmationError,
  confirmDailyPlan,
  type DailyPlanRepository,
} from './service';

export interface PlanConfirmDependencies {
  getOpenid(context: unknown): string | undefined;
  createRepository(): DailyPlanRepository;
  now(): Date;
}

export async function handlePlanConfirm(
  event: unknown,
  context: unknown,
  dependencies: PlanConfirmDependencies,
) {
  try {
    const openid = dependencies.getOpenid(context);
    if (!openid?.trim()) {
      return { ok: false as const, code: 'UNAUTHENTICATED' as const };
    }
    const plan = await confirmDailyPlan(
      openid,
      event,
      dependencies.createRepository(),
      dependencies.now,
    );
    return {
      ok: true as const,
      plan: { id: plan.id, date: plan.date },
    };
  } catch (error) {
    if (error instanceof PlanConfirmationError) {
      return { ok: false as const, code: error.code };
    }
    return { ok: false as const, code: 'INTERNAL_ERROR' as const };
  }
}
