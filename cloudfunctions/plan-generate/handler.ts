import type { AIProvider } from '../shared/ai-provider';
import {
  PlanGenerationServiceError,
  generateOwnedDailyPlan,
  type OwnedGoalRepository,
} from './service';
import { isAiQuotaError } from '../shared/ai-quota';

interface ProviderConfiguration {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

class MissingProviderConfigurationError extends Error {}

export interface PlanGenerateDependencies {
  getOpenid(context: unknown): string | undefined;
  env: Readonly<Record<string, string | undefined>>;
  createRepository(): OwnedGoalRepository;
  createProvider(configuration: ProviderConfiguration): AIProvider;
  claimQuota(openid: string): Promise<void>;
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

  try {
    const result = await generateOwnedDailyPlan(
      openid,
      event,
      dependencies.createRepository(),
      () => {
        const apiKey = dependencies.env.TOKENHUB_API_KEY?.trim();
        const model = dependencies.env.TOKENHUB_MODEL?.trim();
        if (!apiKey || !model) {
          throw new MissingProviderConfigurationError();
        }
        return dependencies.createProvider({
          apiKey,
          model,
          baseUrl: dependencies.env.TOKENHUB_BASE_URL?.trim() || undefined,
        });
      },
      () => dependencies.claimQuota(openid),
    );
    return { ok: true as const, result };
  } catch (error) {
    if (isAiQuotaError(error)) return { ok: false as const, code: 'QUOTA_EXCEEDED' as const };
    if (error instanceof MissingProviderConfigurationError) {
      return { ok: false as const, code: 'MISCONFIGURED' as const };
    }
    if (error instanceof PlanGenerationServiceError) {
      return { ok: false as const, code: error.code };
    }
    return { ok: false as const, code: 'INTERNAL_ERROR' as const };
  }
}
