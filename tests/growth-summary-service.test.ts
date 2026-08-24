import { describe, expect, it } from 'vitest';
import {
  getGrowthSummary,
  type GrowthSummaryRepository,
} from '../cloudfunctions/growth-summary/service';

describe('growth summary service', () => {
  it('returns only safe growth fields from the authenticated owner', async () => {
    const repository: GrowthSummaryRepository = {
      findGrowth: async (openid) => openid === 'owner-a' ? 115 : 900,
      findRecentAwards: async (openid, limit) => {
        expect(openid).toBe('owner-a');
        expect(limit).toBe(3);
        return [
          { date: '2026-08-19', growthAwarded: 10 },
          { date: '2026-08-18', growthAwarded: 5 },
        ];
      },
    };

    await expect(getGrowthSummary('owner-a', repository)).resolves.toEqual({
      growth: 115,
      recentAwards: [
        { date: '2026-08-19', growthAwarded: 10 },
        { date: '2026-08-18', growthAwarded: 5 },
      ],
    });
  });

  it('normalizes malformed stored growth and filters malformed awards', async () => {
    const repository: GrowthSummaryRepository = {
      findGrowth: async () => -5,
      findRecentAwards: async () => [
        { date: '2026-08-19', growthAwarded: 10 },
        { date: 'not-a-date', growthAwarded: 10 },
        { date: '2026-08-18', growthAwarded: -1 },
        { date: '2026-08-17', growthAwarded: 5 },
        { date: '2026-08-16', growthAwarded: 4 },
        { date: '2026-08-15', growthAwarded: 3 },
      ],
    };

    await expect(getGrowthSummary('owner-a', repository)).resolves.toEqual({
      growth: 0,
      recentAwards: [
        { date: '2026-08-19', growthAwarded: 10 },
        { date: '2026-08-17', growthAwarded: 5 },
        { date: '2026-08-16', growthAwarded: 4 },
      ],
    });
  });
});
