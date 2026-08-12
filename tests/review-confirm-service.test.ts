import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  confirmOwnedReview,
  type ReviewConfirmationRepository,
  type StoredReview,
} from '../cloudfunctions/review-confirm/service';

const review = {
  completionSummary: '今天完成了 1 项任务。',
  encouragement: '你已经把计划落到了实处。',
  nextSuggestion: '明天先用 15 分钟复习类型练习。',
  memoryCandidate: '完成短时练习时状态刚好。',
};

function createRepository() {
  const saved: Array<{ review: StoredReview; memory: string | null }> = [];
  const repository: ReviewConfirmationRepository = {
    async findOwnedPlan() {
      return { id: 'plan-1', date: '2026-08-11' };
    },
    async saveIfAbsent(_documentId, storedReview, memory) {
      saved.push({ review: storedReview, memory });
      return { id: 'review-1', ...storedReview };
    },
  };
  return { repository, saved };
}

describe('confirmOwnedReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves a confirmed review and its user-confirmed memory for the owned plan', async () => {
    const { repository, saved } = createRepository();

    await expect(
      confirmOwnedReview(
        'user-1',
        {
          requestId: 'request-1',
          planId: 'plan-1',
          review,
          confirmMemory: true,
        },
        repository,
        () => new Date('2026-08-11T12:00:00.000Z'),
      ),
    ).resolves.toMatchObject({
      id: 'review-1',
      _openid: 'user-1',
      owner: 'user-1',
      planId: 'plan-1',
      date: '2026-08-11',
      memoryConfirmed: true,
    });
    expect(saved).toEqual([
      {
        review: expect.objectContaining({
          _openid: 'user-1',
          owner: 'user-1',
          requestId: 'request-1',
          memoryConfirmed: true,
          createdAt: '2026-08-11T12:00:00.000Z',
        }),
        memory: review.memoryCandidate,
      },
    ]);
  });

  it('records whether an invalid confirmation was rejected before plan lookup', async () => {
    const { repository } = createRepository();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      confirmOwnedReview(
        'user-1',
        {
          requestId: '',
          planId: 'plan-1',
          review,
          confirmMemory: false,
        },
        repository,
        () => new Date('2026-08-12T12:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });

    expect(warning).toHaveBeenCalledWith('review_confirm_rejected', {
      stage: 'invalid_input',
    });
  });

  it('records when the selected plan is not eligible for confirmation', async () => {
    const { repository } = createRepository();
    repository.findOwnedPlan = async () => null;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      confirmOwnedReview(
        'user-1',
        {
          requestId: 'request-1',
          planId: 'plan-1',
          review,
          confirmMemory: false,
        },
        repository,
        () => new Date('2026-08-12T12:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });

    expect(warning).toHaveBeenCalledWith('review_confirm_rejected', {
      stage: 'plan_not_owned_or_not_today',
    });
  });
});
