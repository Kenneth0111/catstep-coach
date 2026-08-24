export interface GrowthAwardRecord {
  date: string;
  growthAwarded: number;
}

export interface GrowthSummaryRepository {
  findGrowth(openid: string): Promise<number | null>;
  findRecentAwards(openid: string, limit: number): Promise<GrowthAwardRecord[]>;
}

export interface GrowthSummary {
  growth: number;
  recentAwards: GrowthAwardRecord[];
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year > 0 && date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export async function getGrowthSummary(
  openid: string,
  repository: GrowthSummaryRepository,
): Promise<GrowthSummary> {
  if (!openid.trim()) throw new Error('invalid context');
  const [storedGrowth, storedAwards] = await Promise.all([
    repository.findGrowth(openid),
    repository.findRecentAwards(openid, 3),
  ]);
  const growth = Number.isInteger(storedGrowth) && (storedGrowth ?? 0) > 0
    ? storedGrowth as number
    : 0;
  const recentAwards = storedAwards
    .filter((award) => isValidDate(award.date) &&
      Number.isInteger(award.growthAwarded) && award.growthAwarded >= 0)
    .slice(0, 3)
    .map(({ date, growthAwarded }) => ({ date, growthAwarded }));
  return { growth, recentAwards };
}
