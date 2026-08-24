import { describe, expect, it, vi } from 'vitest';
import { handleGrowthSummary } from '../cloudfunctions/growth-summary/handler';

describe('growth summary handler', () => {
  it('rejects an unauthenticated request before creating a repository', async () => {
    const createRepository = vi.fn();
    await expect(handleGrowthSummary({}, {}, {
      getOpenid: () => undefined,
      createRepository,
    })).resolves.toEqual({ ok: false, code: 'UNAUTHENTICATED' });
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('returns the authenticated safe summary', async () => {
    await expect(handleGrowthSummary({}, {}, {
      getOpenid: () => 'owner-a',
      createRepository: () => ({
        findGrowth: async () => 115,
        findRecentAwards: async () => [{ date: '2026-08-19', growthAwarded: 10 }],
      }),
    })).resolves.toEqual({
      ok: true,
      result: { growth: 115, recentAwards: [{ date: '2026-08-19', growthAwarded: 10 }] },
    });
  });

  it('maps internal failures without exposing their content', async () => {
    await expect(handleGrowthSummary({}, {}, {
      getOpenid: () => 'owner-a',
      createRepository: () => ({
        findGrowth: async () => { throw new Error('private content'); },
        findRecentAwards: async () => [],
      }),
    })).resolves.toEqual({ ok: false, code: 'INTERNAL_ERROR' });
  });
});
