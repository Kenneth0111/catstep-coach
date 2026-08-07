import {
  GoalConfirmationError,
  confirmGoal,
  type GoalRepository,
} from './service';

export interface GoalConfirmDependencies {
  getOpenid(context: unknown): string | undefined;
  createRepository(): GoalRepository;
  now(): Date;
}

export async function handleGoalConfirm(
  event: unknown,
  context: unknown,
  dependencies: GoalConfirmDependencies,
) {
  const openid = dependencies.getOpenid(context);
  if (!openid?.trim()) {
    return { ok: false as const, code: 'UNAUTHENTICATED' as const };
  }

  try {
    const goal = await confirmGoal(
      openid,
      event,
      dependencies.createRepository(),
      dependencies.now,
    );
    return { ok: true as const, goal: { id: goal.id } };
  } catch (error) {
    if (error instanceof GoalConfirmationError) {
      return { ok: false as const, code: error.code };
    }
    return { ok: false as const, code: 'INTERNAL_ERROR' as const };
  }
}
