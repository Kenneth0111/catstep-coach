import type { AIProvider } from '../shared/ai-provider';

type DifficultyFeedback = 'easy' | 'just_right' | 'hard';
type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface OwnedTodayPlan {
  id: string;
  date: string;
  summary: string;
  tasks: Array<{
    id: string;
    title: string;
    estimatedMinutes: number;
    status: TaskStatus;
    difficultyFeedback?: DifficultyFeedback;
  }>;
}

export interface OwnedTodayPlanRepository {
  findTodayById(openid: string, planId: string): Promise<OwnedTodayPlan | null>;
}

export interface GeneratedReview {
  completionSummary: string;
  encouragement: string;
  nextSuggestion: string;
  memoryCandidate: string | null;
}

export interface ReviewGenerationResult {
  source: 'ai' | 'fallback';
  review: GeneratedReview;
}

export interface ReviewProviderOptions {
  timeoutMs: number;
}

export const REVIEW_REQUEST_TIMEOUT_MS = 10_000;

export class ReviewGenerationServiceError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'ReviewGenerationServiceError';
  }
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isReview(value: unknown): value is GeneratedReview {
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

function fallbackReview(plan: OwnedTodayPlan): GeneratedReview {
  const completedCount = plan.tasks.filter(
    (task) => task.status === 'completed',
  ).length;
  return {
    completionSummary: `今天完成了 ${completedCount} 项任务，共计划 ${plan.tasks.length} 项。`,
    encouragement:
      completedCount > 0
        ? '你已经为目标留下了清晰的脚印。'
        : '今天没有完成也没关系，明天可以从更小的一步开始。',
    nextSuggestion: '明天先留出 15 分钟，完成最容易开始的一项任务。',
    memoryCandidate: null,
  };
}

function getDiagnosticCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }

  return 'UNKNOWN_ERROR';
}

function logFallback(
  stage: 'provider_unavailable' | 'invalid_response',
  error: unknown,
): void {
  console.warn('review_generate_fallback', {
    workflow: 'generateReview',
    stage,
    code: getDiagnosticCode(error),
  });
}

export async function generateOwnedReview(
  openid: string,
  input: unknown,
  repository: OwnedTodayPlanRepository,
  createProvider: (options: ReviewProviderOptions) => AIProvider,
  claimQuota: () => Promise<void> = async () => undefined,
): Promise<ReviewGenerationResult> {
  if (
    !openid.trim() ||
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    !isText((input as Record<string, unknown>).planId)
  ) {
    throw new ReviewGenerationServiceError('INVALID_CONTEXT');
  }

  const planId = (input as { planId: string }).planId.trim();
  const plan = await repository.findTodayById(openid, planId);
  if (!plan) {
    throw new ReviewGenerationServiceError('INVALID_CONTEXT');
  }
  await claimQuota();

  let candidate: unknown;
  try {
    candidate = await createProvider({
      timeoutMs: REVIEW_REQUEST_TIMEOUT_MS,
    }).generateStructured({
      workflow: 'generateReview',
      promptVersion: 'review-v1',
      input: {
        date: plan.date,
        summary: plan.summary,
        tasks: plan.tasks,
      },
    });
  } catch (error) {
    logFallback('provider_unavailable', error);
    return { source: 'fallback', review: fallbackReview(plan) };
  }

  if (!isReview(candidate)) {
    logFallback('invalid_response', { code: 'INVALID_RESPONSE' });
    return { source: 'fallback', review: fallbackReview(plan) };
  }

  return { source: 'ai', review: candidate };
}
