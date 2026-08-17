import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../cloudfunctions/shared/ai-provider';
import type { OwnedTodayPlanRepository } from '../cloudfunctions/review-generate/service';
import { handleReviewGenerate } from '../cloudfunctions/review-generate/handler';

const review = {
  completionSummary: '今天完成了 1 项任务。',
  encouragement: '你已经把计划落到了实处。',
  nextSuggestion: '明天先用 15 分钟复习类型练习。',
  memoryCandidate: null,
};

function dependencies() {
  return {
    getOpenid: () => 'user-1',
    createRepository: vi.fn<() => OwnedTodayPlanRepository>(() => ({
      async findTodayById() {
        return {
          id: 'plan-1',
          date: '2026-08-11',
          summary: '先完成一小步。',
          tasks: [],
        };
      },
    })),
    createProvider: vi.fn<() => AIProvider>(() => ({
      async generateStructured() {
        return review;
      },
    })),
    claimQuota: async () => { throw Object.assign(new Error('quota'), { code: 'QUOTA_EXCEEDED' }); },
  };
}

describe('review.generate handler', () => {
  it('returns a generated review for the authenticated user', async () => {
    const deps = dependencies();

    await expect(
      handleReviewGenerate({ planId: 'plan-1' }, {}, deps),
    ).resolves.toEqual({ ok: false, code: 'QUOTA_EXCEEDED' });
  });
});
