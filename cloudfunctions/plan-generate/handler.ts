import type { AIProvider } from '../shared/ai-provider';
import {
  PlanGenerationServiceError,
  generateOwnedDailyPlan,
  type OwnedGoalRepository,
} from './service';

interface ProviderConfiguration {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface PlanGenerateDependencies {
  getOpenid(context: unknown): string | undefined;
  env: Readonly<Record<string, string | undefined>>;
  createRepository(): OwnedGoalRepository;
  createProvider(configuration: ProviderConfiguration): AIProvider;
}

export async function handlePlanGenerate(
  event: unknown,
  context: unknown,
  dependencies: PlanGenerateDependencies,
) {
  const openid = dependencies.getOpenid(context);
  if (!openid?.trim()) {
    return { ok: false as const, code: 'UNAUTHENTICATED' as const };
  }

  const apiKey = dependencies.env.TOKENHUB_API_KEY?.trim();
  const model = dependencies.env.TOKENHUB_MODEL?.trim();
  if (!apiKey || !model) {
    return { ok: false as const, code: 'MISCONFIGURED' as const };
  }

  try {
    const configuration = {
      apiKey,
      model,
      baseUrl: dependencies.env.TOKENHUB_BASE_URL?.trim() || undefined,
    };
    const result = await generateOwnedDailyPlan(
      openid,
      event,
      dependencies.createRepository(),
      () => dependencies.createProvider(configuration),
    );
    return { ok: true as const, result };
  } catch (error) {
    if (error instanceof PlanGenerationServiceError) {
      return { ok: false as const, code: error.code };
    }
    return { ok: false as const, code: 'INTERNAL_ERROR' as const };
  }
}
