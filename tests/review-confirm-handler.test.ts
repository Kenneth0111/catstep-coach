import { describe, expect, it, vi } from 'vitest';
import type { ReviewConfirmationRepository } from '../cloudfunctions/review-confirm/service';
import { handleReviewConfirm } from '../cloudfunctions/review-confirm/handler';

const review = {
  completionSummary: '今天完成了 1 项任务。',
  encouragement: '你已经把计划落到了实处。',
  nextSuggestion: '明天先用 15 分钟复习类型练习。',
  memoryCandidate: null,
};

function dependencies() {
  return {
    getOpenid: () => 'user-1',
    now: () => new Date('2026-08-11T12:00:00.000Z'),
    createRepository: vi.fn<() => ReviewConfirmationRepository>(() => ({
      async findOwnedPlan() {
        return { id: 'plan-1', date: '2026-08-11' };
      },
      async saveIfAbsent(_documentId, storedReview) {
        return { id: 'review-1', ...storedReview };
      },
    })),
  };
}

describe('review.confirm handler', () => {
  it('returns the stored review for the authenticated user', async () => {
    const deps = dependencies();

    await expect(
      handleReviewConfirm(
        { requestId: 'request-1', planId: 'plan-1', review, confirmMemory: false },
        {},
        deps,
      ),
    ).resolves.toMatchObject({
      ok: true,
      review: { id: 'review-1', owner: 'user-1', memoryConfirmed: false },
    });
  });
});
