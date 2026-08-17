import { describe, expect, it, vi } from 'vitest';
import { AiQuotaError, claimDailyAiQuota, type AiQuotaRepository } from '../cloudfunctions/shared/ai-quota';
import { createCloudbaseQuotaClaimer } from '../cloudfunctions/shared/cloudbase-ai-quota';

describe('daily AI quota', () => {
  it('allows six claims and rejects the seventh for the same user and Shanghai day', async () => {
    let count = 0;
    const repository: AiQuotaRepository = { async claim() { count += 1; return count; } };
    for (let index = 0; index < 6; index += 1) await expect(claimDailyAiQuota('user-1', repository)).resolves.toBeUndefined();
    await expect(claimDailyAiQuota('user-1', repository)).rejects.toEqual(new AiQuotaError('QUOTA_EXCEEDED'));
  });

  it('uses one Shanghai-day document transaction and rejects an exhausted stored count', async () => {
    const set = vi.fn(async () => undefined);
    const claim = createCloudbaseQuotaClaimer({
      async runTransaction(update) {
        const transaction = {
          collection: () => ({
            doc: () => ({ get: async () => ({ data: { count: 6 } }), set }),
          }),
        };
        return { result: await update(transaction) };
      },
    }, () => new Date('2026-08-13T01:00:00.000Z'));
    await expect(claim('user-1')).rejects.toEqual(new AiQuotaError('QUOTA_EXCEEDED'));
    expect(set).not.toHaveBeenCalled();
  });
});
