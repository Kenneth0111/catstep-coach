import { describe, expect, it, vi } from 'vitest';
import { AiQuotaError, claimDailyAiQuota, type AiQuotaRepository } from '../cloudfunctions/shared/ai-quota';
import { createCloudbaseQuotaClaimer } from '../cloudfunctions/shared/cloudbase-ai-quota';

describe('daily AI quota', () => {
  it('allows fifty claims and rejects the fifty-first for the same user and Shanghai day', async () => {
    let count = 0;
    const repository: AiQuotaRepository = { async claim() { count += 1; return count; } };
    for (let index = 0; index < 50; index += 1) await expect(claimDailyAiQuota('user-1', repository)).resolves.toBeUndefined();
    await expect(claimDailyAiQuota('user-1', repository)).rejects.toEqual(new AiQuotaError('QUOTA_EXCEEDED'));
  });

  it('reads a changed runtime quota from CloudBase for the next claim', async () => {
    let configuredQuota = 1;
    let count = 0;
    const claim = createCloudbaseQuotaClaimer({
      async runTransaction(update) {
        const transaction = {
          collection: (name: string) => ({
            doc: () => ({
              get: async () => ({ data: name === 'runtime_settings'
                ? { dailyAiQuota: configuredQuota }
                : { count } }),
              set: async (value: { count: number }) => { count = value.count; },
            }),
          }),
        };
        return { result: await update(transaction) };
      },
    }, () => new Date('2026-08-13T01:00:00.000Z'));

    await expect(claim('user-1')).resolves.toBeUndefined();
    await expect(claim('user-1')).rejects.toEqual(new AiQuotaError('QUOTA_EXCEEDED'));
    configuredQuota = 2;
    await expect(claim('user-1')).resolves.toBeUndefined();
  });

  it('uses the default quota when the stored runtime configuration is invalid', async () => {
    const set = vi.fn(async () => undefined);
    const claim = createCloudbaseQuotaClaimer({
      async runTransaction(update) {
        const transaction = {
          collection: (name: string) => ({
            doc: () => ({ get: async () => ({ data: name === 'runtime_settings'
              ? { dailyAiQuota: 0 }
              : { count: 50 } }), set }),
          }),
        };
        return { result: await update(transaction) };
      },
    }, () => new Date('2026-08-13T01:00:00.000Z'));
    await expect(claim('user-1')).rejects.toEqual(new AiQuotaError('QUOTA_EXCEEDED'));
    expect(set).not.toHaveBeenCalled();
  });
});
