import { describe, expect, it, vi } from 'vitest';
import {
  createReviewConfirmationRepository,
  type ReviewConfirmationDatabase,
} from '../cloudfunctions/review-confirm/repository';

const review = {
  _openid: 'user-1',
  owner: 'user-1',
  planId: 'plan-1',
  date: '2026-08-11',
  completionSummary: '今天完成了 1 项任务。',
  encouragement: '你已经把计划落到了实处。',
  nextSuggestion: '明天先用 15 分钟复习类型练习。',
  memoryCandidate: '完成短时练习时状态刚好。',
  memoryConfirmed: true,
  growthAwarded: 0,
  requestId: 'request-1',
  createdAt: '2026-08-11T12:00:00.000Z',
};

describe('review.confirm CloudBase repository', () => {
  it('returns the review when the CloudBase SDK returns the transaction callback result directly', async () => {
    const reviewSet = vi.fn(async () => undefined);
    const userSet = vi.fn(async () => undefined);
    const storedReview = { ...review, growthAwarded: 10 };
    const database: ReviewConfirmationDatabase = {
      plans: { doc: vi.fn(() => ({ get: async () => ({ data: [] }) })) },
      reviews: { doc: vi.fn(() => ({ get: async () => ({ data: null }), set: reviewSet })) },
      memories: { doc: vi.fn(() => ({ set: vi.fn(async () => undefined) })) },
      users: {
        where: vi.fn(() => ({ limit: () => ({ get: async () => ({ data: [{ _id: 'user-1', _openid: 'user-1', growth: 0, createdAt: '2026-08-01T00:00:00.000Z' }] }) }) })),
      },
      runTransaction: vi.fn(async (update) => update({
        collection: (name: 'reviews' | 'memories' | 'users') =>
          name === 'reviews'
            ? { doc: () => ({ get: async () => ({ data: null }), set: reviewSet }) }
            : name === 'users'
              ? { doc: () => ({ get: async () => ({ data: { _id: 'user-1', _openid: 'user-1', growth: 0, createdAt: '2026-08-01T00:00:00.000Z' } }), set: userSet }) }
              : { doc: () => ({ set: vi.fn(async () => undefined) }) },
      })),
    };

    await expect(
      createReviewConfirmationRepository(database).saveIfAbsent('review-1', review, null),
    ).resolves.toEqual({ id: 'review-1', ...storedReview });
  });

  it('logs only the failing persistence stage and error code', async () => {
    const error = Object.assign(new Error('database-secret-detail'), {
      code: 'DATABASE_WRITE_FAILED',
    });
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const database = {
      plans: { doc: vi.fn(() => ({ get: async () => ({ data: [] }) })) },
      reviews: { doc: vi.fn(() => ({ get: async () => ({ data: null }), set: vi.fn() })) },
      memories: { doc: vi.fn(() => ({ set: vi.fn() })) },
      users: {
        where: vi.fn(() => ({ limit: () => ({ get: async () => ({ data: [] }) }) })),
      },
      runTransaction: vi.fn(async (update: (transaction: unknown) => Promise<unknown>) =>
        update({
          collection: (name: 'reviews' | 'memories' | 'users') =>
            name === 'reviews'
              ? { doc: () => ({ get: async () => ({ data: null }), set: async () => { throw error; } }) }
              : name === 'users'
                ? { doc: () => ({ get: async () => ({ data: null }), set: vi.fn() }) }
                : { doc: () => ({ set: vi.fn() }) },
        }),
      ),
    } as ReviewConfirmationDatabase;

    try {
      await expect(
        createReviewConfirmationRepository(database).saveIfAbsent('review-1', review, null),
      ).rejects.toBe(error);
      expect(logger).toHaveBeenCalledWith('review_confirm_failure', {
        stage: 'save_review',
        code: 'DATABASE_WRITE_FAILED',
      });
      expect(JSON.stringify(logger.mock.calls)).not.toContain('database-secret-detail');
    } finally {
      logger.mockRestore();
    }
  });

  it('saves the review and confirmed memory in one transaction', async () => {
    const reviewSet = vi.fn(async () => undefined);
    const memorySet = vi.fn(async () => undefined);
    const database: ReviewConfirmationDatabase = {
      plans: {
        doc: vi.fn(() => ({ get: async () => ({ data: [] }) })),
      },
      reviews: {
        doc: vi.fn(() => ({ get: async () => ({ data: null }), set: reviewSet })),
      },
      memories: {
        doc: vi.fn(() => ({ set: memorySet })),
      },
      users: {
        where: vi.fn(() => ({ limit: () => ({ get: async () => ({ data: [{ _id: 'user-1', _openid: 'user-1', growth: 0, createdAt: '2026-08-01T00:00:00.000Z' }] }) }) })),
      },
      runTransaction: vi.fn(async (update) => ({
        result: await update({
          collection: (name: 'reviews' | 'memories' | 'users') =>
            name === 'reviews'
              ? { doc: () => ({ get: async () => ({ data: null }), set: reviewSet }) }
              : name === 'users'
                ? { doc: () => ({ get: async () => ({ data: { _id: 'user-1', _openid: 'user-1', growth: 0, createdAt: '2026-08-01T00:00:00.000Z' } }), set: vi.fn(async () => undefined) }) }
              : { doc: () => ({ set: memorySet }) },
        }),
      })),
    };
    const repository = createReviewConfirmationRepository(database);

    await expect(
      repository.saveIfAbsent('review-1', review, review.memoryCandidate),
    ).resolves.toEqual({ id: 'review-1', ...review, growthAwarded: 10 });
    expect(reviewSet).toHaveBeenCalledWith({ ...review, growthAwarded: 10 });
    expect(memorySet).toHaveBeenCalledWith({
      _openid: 'user-1',
      owner: 'user-1',
      summary: review.memoryCandidate,
      sourceDates: ['2026-08-11'],
      confirmedAt: review.createdAt,
      version: 1,
    });
  });

  it('awards review growth once and caps the current day total', async () => {
    const reviewSet = vi.fn(async () => undefined);
    const userSet = vi.fn(async () => undefined);
    const database = {
      plans: { doc: vi.fn(() => ({ get: async () => ({ data: [] }) })) },
      reviews: { doc: vi.fn(() => ({ get: async () => ({ data: null }), set: reviewSet })) },
      memories: { doc: vi.fn(() => ({ set: vi.fn(async () => undefined) })) },
      users: {
        where: vi.fn(() => ({ limit: () => ({ get: async () => ({ data: [{ _id: 'user-1', _openid: 'user-1', growth: 100, growthDate: '2026-08-11', dailyGrowth: 65, createdAt: '2026-08-01T00:00:00.000Z' }] }) }) })),
      },
      runTransaction: vi.fn(async (update: (transaction: unknown) => Promise<unknown>) => ({
        result: await update({
          collection: (name: 'reviews' | 'memories' | 'users') => {
            if (name === 'reviews') {
              return { doc: () => ({ get: async () => ({ data: null }), set: reviewSet }) };
            }
            if (name === 'users') {
              return { doc: () => ({ get: async () => ({ data: { _id: 'user-1', _openid: 'user-1', growth: 100, growthDate: '2026-08-11', dailyGrowth: 65, createdAt: '2026-08-01T00:00:00.000Z' } }), set: userSet }) };
            }
            return { doc: () => ({ set: vi.fn(async () => undefined) }) };
          },
        }),
      })),
    } as ReviewConfirmationDatabase;
    const repository = createReviewConfirmationRepository(database);

    await expect(
      repository.saveIfAbsent('review-1', review, null),
    ).resolves.toMatchObject({ growthAwarded: 5 });
    expect(userSet).toHaveBeenCalledWith(expect.objectContaining({
      growth: 105,
      growthDate: '2026-08-11',
      dailyGrowth: 70,
    }));
  });

  it('does not award growth again when the review request is replayed', async () => {
    const userSet = vi.fn(async () => undefined);
    const existingReview = { _id: 'review-1', ...review, growthAwarded: 10 };
    const database = {
      plans: { doc: vi.fn(() => ({ get: async () => ({ data: [] }) })) },
      reviews: { doc: vi.fn(() => ({ get: async () => ({ data: existingReview }), set: vi.fn(async () => undefined) })) },
      memories: { doc: vi.fn(() => ({ set: vi.fn(async () => undefined) })) },
      users: {
        where: vi.fn(() => ({ limit: () => ({ get: async () => ({ data: [{ _id: 'user-1', _openid: 'user-1', growth: 10, growthDate: '2026-08-11', dailyGrowth: 10, createdAt: '2026-08-01T00:00:00.000Z' }] }) }) })),
      },
      runTransaction: vi.fn(async (update: (transaction: unknown) => Promise<unknown>) => ({
        result: await update({
          collection: (name: 'reviews' | 'memories' | 'users') =>
            name === 'reviews'
              ? { doc: () => ({ get: async () => ({ data: existingReview }), set: vi.fn(async () => undefined) }) }
              : name === 'users'
                ? { doc: () => ({ get: async () => ({ data: null }), set: userSet }) }
                : { doc: () => ({ set: vi.fn(async () => undefined) }) },
        }),
      })),
    } as ReviewConfirmationDatabase;
    const repository = createReviewConfirmationRepository(database);

    await expect(repository.saveIfAbsent('review-1', review, null)).resolves.toEqual({
      id: 'review-1',
      ...review,
      growthAwarded: 10,
    });
    expect(userSet).not.toHaveBeenCalled();
  });
});
