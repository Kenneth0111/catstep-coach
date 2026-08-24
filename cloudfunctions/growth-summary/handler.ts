import { getGrowthSummary, type GrowthSummaryRepository } from './service';

export interface GrowthSummaryDependencies {
  getOpenid(context: unknown): string | undefined;
  createRepository(): GrowthSummaryRepository;
}

export async function handleGrowthSummary(
  _event: unknown,
  context: unknown,
  dependencies: GrowthSummaryDependencies,
) {
  const openid = dependencies.getOpenid(context);
  if (!openid?.trim()) {
    return { ok: false as const, code: 'UNAUTHENTICATED' as const };
  }
  try {
    const result = await getGrowthSummary(openid, dependencies.createRepository());
    return { ok: true as const, result };
  } catch {
    return { ok: false as const, code: 'INTERNAL_ERROR' as const };
  }
}
