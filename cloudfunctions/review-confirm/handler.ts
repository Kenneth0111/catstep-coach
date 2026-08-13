import {
  ReviewConfirmationError,
  confirmOwnedReview,
  type ReviewConfirmationRepository,
} from './service';

export interface ReviewConfirmDependencies {
  getOpenid(context: unknown): string | undefined;
  createRepository(): ReviewConfirmationRepository;
  now(): Date;
}

export async function handleReviewConfirm(
  event: unknown,
  context: unknown,
  dependencies: ReviewConfirmDependencies,
) {
  const openid = dependencies.getOpenid(context);
  if (!openid?.trim()) {
    return { ok: false as const, code: 'UNAUTHENTICATED' as const };
  }

  try {
    const review = await confirmOwnedReview(
      openid,
      event,
      dependencies.createRepository(),
      dependencies.now,
    );
    return { ok: true as const, review };
  } catch (error) {
    if (error instanceof ReviewConfirmationError) {
      return { ok: false as const, code: error.code };
    }
    return { ok: false as const, code: 'INTERNAL_ERROR' as const };
  }
}
