import type { AIProvider } from '../shared/ai-provider';
import {
  PlanResizeError,
  resizeOwnedTask,
  type PlanResizeRepository,
} from './service';
import { isAiQuotaError } from '../shared/ai-quota';

export interface PlanResizeTaskDependencies {
  getOpenid(context: unknown): string | undefined;
  createRepository(): PlanResizeRepository;
  createProvider(): AIProvider;
  now(): Date;
  claimQuota(openid: string): Promise<void>;
}

export async function handlePlanResizeTask(
  event: unknown,
  context: unknown,
  dependencies: PlanResizeTaskDependencies,
) {
  const openid = dependencies.getOpenid(context);
  if (!openid?.trim()) {
    return { ok: false as const, code: 'UNAUTHENTICATED' as const };
  }
  try {
    const result = await resizeOwnedTask(
      openid,
      event,
      dependencies.createRepository(),
      dependencies.createProvider,
      dependencies.now,
      () => dependencies.claimQuota(openid),
    );
    return { ok: true as const, result };
  } catch (error) {
    if (isAiQuotaError(error)) return { ok: false as const, code: 'QUOTA_EXCEEDED' as const };
    if (error instanceof PlanResizeError) {
      return { ok: false as const, code: error.code };
    }
    return { ok: false as const, code: 'INTERNAL_ERROR' as const };
  }
}
