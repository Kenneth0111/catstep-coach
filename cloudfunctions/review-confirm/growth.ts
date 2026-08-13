export const REVIEW_CONFIRMATION_GROWTH = 10;
export const DAILY_GROWTH_CAP = 70;

export function awardReviewConfirmationGrowth(currentDailyGrowth: number): {
  awarded: number;
  dailyGrowth: number;
} {
  const normalizedDailyGrowth = Math.max(0, currentDailyGrowth);
  const awarded = Math.max(
    0,
    Math.min(REVIEW_CONFIRMATION_GROWTH, DAILY_GROWTH_CAP - normalizedDailyGrowth),
  );
  return {
    awarded,
    dailyGrowth: normalizedDailyGrowth + awarded,
  };
}
