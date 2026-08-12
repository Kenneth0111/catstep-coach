import type { AIProvider } from '../shared/ai-provider';
import {
  ReviewGenerationServiceError,
  generateOwnedReview,
  type OwnedTodayPlanRepository,
} from './service';

export interface ReviewGenerateDependencies {
  getOpenid(context: unknown): string | undefined;
  createRepository(): OwnedTodayPlanRepository;
  createProvider(): AIProvider;
}

export async function handleReviewGenerate(
  event: unknown,
  context: unknown,
  dependencies: ReviewGenerateDependencies,
) {
  const openid = dependencies.getOpenid(context);
  if (!openid?.trim()) {
    return { ok: false as const, code: 'UNAUTHENTICATED' as const };
  }

  try {
    const result = await generateOwnedReview(
      openid,
      event,
      dependencies.createRepository(),
      dependencies.createProvider,
    );
    return { ok: true as const, result };
  } catch (error) {
    if (error instanceof ReviewGenerationServiceError) {
      return { ok: false as const, code: error.code };
    }
    return { ok: false as const, code: 'INTERNAL_ERROR' as const };
  }
}
