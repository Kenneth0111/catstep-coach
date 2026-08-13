import { describe, expect, it } from 'vitest';
import {
  DAILY_GROWTH_CAP,
  REVIEW_CONFIRMATION_GROWTH,
  awardReviewConfirmationGrowth,
} from '../cloudfunctions/review-confirm/growth';

describe('review confirmation growth', () => {
  it('awards the deterministic review amount without exceeding the daily cap', () => {
    expect(REVIEW_CONFIRMATION_GROWTH).toBe(10);
    expect(DAILY_GROWTH_CAP).toBe(70);
    expect(awardReviewConfirmationGrowth(65)).toEqual({
      awarded: 5,
      dailyGrowth: 70,
    });
  });

  it('never creates negative growth from an invalid prior daily total', () => {
    expect(awardReviewConfirmationGrowth(-3)).toEqual({
      awarded: 10,
      dailyGrowth: 10,
    });
  });
});
