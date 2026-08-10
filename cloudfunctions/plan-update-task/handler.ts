import {
  PlanTaskUpdateError,
  toPublicPlan,
  updatePlanTask,
  type PlanTaskUpdateRepository,
} from './service';

export interface PlanUpdateTaskDependencies {
  getOpenid(context: unknown): string | undefined;
  createRepository(): PlanTaskUpdateRepository;
  now(): Date;
}

export async function handlePlanUpdateTask(
  event: unknown,
  context: unknown,
  dependencies: PlanUpdateTaskDependencies,
) {
  try {
    const openid = dependencies.getOpenid(context);
    if (!openid?.trim()) {
      return { ok: false as const, code: 'UNAUTHENTICATED' as const };
    }
    const plan = await updatePlanTask(
      openid,
      event,
      dependencies.createRepository(),
      dependencies.now,
    );
    return { ok: true as const, plan: toPublicPlan(plan) };
  } catch (error) {
    if (error instanceof PlanTaskUpdateError) {
      return { ok: false as const, code: error.code };
    }
    return { ok: false as const, code: 'INTERNAL_ERROR' as const };
  }
}
