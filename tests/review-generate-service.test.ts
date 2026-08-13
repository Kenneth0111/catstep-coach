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

  it('gives the single review request a ten second timeout budget', async () => {
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => review),
    };
    const createProvider = vi.fn(() => provider);

    await generateOwnedReview(
      'user-1',
      { planId: 'plan-1' },
      repository(),
      createProvider,
    );

    expect(createProvider).toHaveBeenCalledWith({ timeoutMs: 10_000 });
  });

  it('logs a safe provider error code when review generation falls back', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => {
        throw Object.assign(new Error('secret upstream response'), {
          code: 'NETWORK_ERROR',
        });
      }),
    };

    await expect(
      generateOwnedReview('user-1', { planId: 'plan-1' }, repository(), () => provider),
    ).resolves.toMatchObject({ source: 'fallback' });

    expect(warn).toHaveBeenCalledWith('review_generate_fallback', {
      workflow: 'generateReview',
      stage: 'provider_unavailable',
      code: 'NETWORK_ERROR',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret upstream response');
    warn.mockRestore();
  });

  it('distinguishes an invalid AI review from a provider failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const provider: AIProvider = {
      generateStructured: vi.fn(async () => ({ memoryCandidate: null })),
    };

    await expect(
      generateOwnedReview('user-1', { planId: 'plan-1' }, repository(), () => provider),
    ).resolves.toMatchObject({ source: 'fallback' });

    expect(warn).toHaveBeenCalledWith('review_generate_fallback', {
      workflow: 'generateReview',
      stage: 'invalid_response',
      code: 'INVALID_RESPONSE',
    });
    warn.mockRestore();
  });
});
