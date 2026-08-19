export const DAILY_AI_QUOTA = 50;

export interface AiQuotaRepository {
  claim(): Promise<number>;
}

export class AiQuotaError extends Error {
  constructor(readonly code: 'QUOTA_EXCEEDED') {
    super(code);
    this.name = 'AiQuotaError';
  }
}

export function isAiQuotaError(error: unknown): error is AiQuotaError {
  return error instanceof AiQuotaError ||
    (typeof error === 'object' && error !== null && 'code' in error && error.code === 'QUOTA_EXCEEDED');
}

export async function claimDailyAiQuota(
  openid: string,
  repository: AiQuotaRepository,
): Promise<void> {
  if (!openid.trim()) {
    throw new AiQuotaError('QUOTA_EXCEEDED');
  }
  if (await repository.claim() > DAILY_AI_QUOTA) {
    throw new AiQuotaError('QUOTA_EXCEEDED');
  }
}
