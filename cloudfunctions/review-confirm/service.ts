import { createHash } from 'node:crypto';

export interface ReviewContent {
  completionSummary: string;
  encouragement: string;
  nextSuggestion: string;
  memoryCandidate: string | null;
}

export interface ReviewConfirmationInput {
  requestId: string;
  planId: string;
  review: ReviewContent;
  confirmMemory: boolean;
}

export interface StoredReview extends ReviewContent {
  _openid: string;
  owner: string;
  planId: string;
  date: string;
  memoryConfirmed: boolean;
  growthAwarded: number;
  requestId: string;
  createdAt: string;
}

export interface ConfirmedReview extends StoredReview {
  id: string;
}

export interface ReviewConfirmationRepository {
  findOwnedPlan(
    openid: string,
    planId: string,
  ): Promise<{ id: string; date: string } | null>;
  saveIfAbsent(
    documentId: string,
    review: StoredReview,
    memory: string | null,
  ): Promise<ConfirmedReview>;
}

export class ReviewConfirmationError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'ReviewConfirmationError';
  }
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isReviewContent(value: unknown): value is ReviewContent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const review = value as Record<string, unknown>;
  return (
    isText(review.completionSummary) &&
    isText(review.encouragement) &&
    isText(review.nextSuggestion) &&
    (review.memoryCandidate === null || isText(review.memoryCandidate))
  );
}

function isConfirmationInput(value: unknown): value is ReviewConfirmationInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const input = value as Record<string, unknown>;
  return (
    isText(input.requestId) &&
    input.requestId.trim().length <= 128 &&
    isText(input.planId) &&
    isReviewContent(input.review) &&
    typeof input.confirmMemory === 'boolean' &&
    (!input.confirmMemory || input.review.memoryCandidate !== null)
  );
}

export function createReviewDocumentId(
  openid: string,
  requestId: string,
): string {
  return createHash('sha256')
    .update(openid)
    .update('\0')
    .update(requestId)
    .digest('hex')
    .slice(0, 32);
}

export async function confirmOwnedReview(
  openid: string,
  input: unknown,
  repository: ReviewConfirmationRepository,
  now: () => Date,
): Promise<ConfirmedReview> {
  if (!isText(openid) || !isConfirmationInput(input)) {
    console.warn('review_confirm_rejected', { stage: 'invalid_input' });
    throw new ReviewConfirmationError('INVALID_CONTEXT');
  }

  const plan = await repository.findOwnedPlan(openid, input.planId.trim());
  if (!plan) {
    console.warn('review_confirm_rejected', {
      stage: 'plan_not_owned_or_not_today',
    });
    throw new ReviewConfirmationError('INVALID_CONTEXT');
  }

  const review = {
    _openid: openid,
    owner: openid,
    planId: plan.id,
    date: plan.date,
    completionSummary: input.review.completionSummary,
    encouragement: input.review.encouragement,
    nextSuggestion: input.review.nextSuggestion,
    memoryCandidate: input.review.memoryCandidate,
    memoryConfirmed: input.confirmMemory,
    growthAwarded: 0,
    requestId: input.requestId.trim(),
    createdAt: now().toISOString(),
  } satisfies StoredReview;
  return repository.saveIfAbsent(
    createReviewDocumentId(openid, input.requestId.trim()),
    review,
    input.confirmMemory ? input.review.memoryCandidate : null,
  );
}
