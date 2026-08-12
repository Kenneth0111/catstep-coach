import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from '../cloudfunctions/shared/ai-provider';
import {
  generateOwnedReview,
  type OwnedTodayPlanRepository,
} from '../cloudfunctions/review-generate/service';

const plan = {
  id: 'plan-1',
  date: '2026-08-11',
  summary: '先完成一小步。',
  tasks: [
    {
      id: 'task-1',
      title: '完成类型练习',
      estimatedMinutes: 30,
      status: 'completed' as const,
      difficultyFeedback: 'just_right' as const,
    },
  ],
};

const review = {
  completionSummary: '今天完成了 1 项任务。',
  encouragement: '你已经把计划落到了实处。',
  nextSuggestion: '明天先用 15 分钟复习类型练习。',
  memoryCandidate: '完成短时练习时状态刚好。',
};

function repository(): OwnedTodayPlanRepository {
  return {
    async findTodayById() {
      return plan;
    },
  };
}

describe('generateOwnedReview', () => {
  it('generates a structured review from the authenticated user\'s own today plan', async () => {
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => review),
    };

    await expect(
      generateOwnedReview('user-1', { planId: 'plan-1' }, repository(), () => provider),
    ).resolves.toEqual({ source: 'ai', review });
    expect(provider.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ workflow: 'generateReview' }),
    );
  });
});
