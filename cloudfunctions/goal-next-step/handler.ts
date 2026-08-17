import type { AIProvider } from '../shared/ai-provider';
import {
  GoalNextStepError,
  getNextGoalStep,
  type GoalClarificationInput,
} from '../shared/goal-next-step';
import { isAiQuotaError } from '../shared/ai-quota';

interface ProviderConfiguration {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface GoalNextStepDependencies {
  getOpenid(context: unknown): string | undefined;
  env: Readonly<Record<string, string | undefined>>;
  createProvider(configuration: ProviderConfiguration): AIProvider;
  claimQuota(openid: string): Promise<void>;
}

export async function handleGoalNextStep(
  event: unknown,
  context: unknown,
  dependencies: GoalNextStepDependencies,
) {
  if (!dependencies.getOpenid(context)?.trim()) {
    return { ok: false as const, code: 'UNAUTHENTICATED' as const };
  }

  const apiKey = dependencies.env.TOKENHUB_API_KEY?.trim();
  const model = dependencies.env.TOKENHUB_MODEL?.trim();
  if (!apiKey || !model) {
    return { ok: false as const, code: 'MISCONFIGURED' as const };
  }

  try {
    const provider = dependencies.createProvider({
      apiKey,
      model,
      baseUrl: dependencies.env.TOKENHUB_BASE_URL?.trim() || undefined,
    });
    const result = await getNextGoalStep(
      event as GoalClarificationInput,
      provider,
      () => dependencies.claimQuota(dependencies.getOpenid(context)!),
    );
    return { ok: true as const, result };
  } catch (error) {
    if (isAiQuotaError(error)) {
      return { ok: false as const, code: 'QUOTA_EXCEEDED' as const };
    }
    if (error instanceof GoalNextStepError) {
      return { ok: false as const, code: error.code };
    }
    return { ok: false as const, code: 'INTERNAL_ERROR' as const };
  }
}
