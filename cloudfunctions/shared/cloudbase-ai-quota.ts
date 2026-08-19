import { createHash } from 'node:crypto';
import { AiQuotaError, DAILY_AI_QUOTA } from './ai-quota';

export interface CloudbaseQuotaDatabase {
  runTransaction<T>(update: (transaction: any) => Promise<T>): Promise<T | { result: T }>;
}

function shanghaiDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function readRuntimeQuota(value: unknown): number {
  if (
    typeof value === 'object' &&
    value !== null &&
    'dailyAiQuota' in value &&
    Number.isSafeInteger(value.dailyAiQuota) &&
    (value.dailyAiQuota as number) > 0
  ) {
    return value.dailyAiQuota as number;
  }
  return DAILY_AI_QUOTA;
}

export function createCloudbaseQuotaClaimer(database: CloudbaseQuotaDatabase, now: () => Date) {
  return async (openid: string): Promise<void> => {
    const date = shanghaiDate(now());
    const id = createHash('sha256').update(`${openid}:${date}`).digest('hex').slice(0, 32);
    const transactionResult = await database.runTransaction(async (transaction) => {
      const runtimeSettings = await transaction
        .collection('runtime_settings')
        .doc('ai_quota')
        .get();
      const quota = readRuntimeQuota(runtimeSettings.data);
      const document = transaction.collection('ai_quotas').doc(id);
      const count = (await document.get()).data?.count ?? 0;
      if (count >= quota) return false;
      await document.set({ _openid: openid, date, count: count + 1 });
      return true;
    });
    const allowed = typeof transactionResult === 'object' && transactionResult !== null && 'result' in transactionResult ? transactionResult.result : transactionResult;
    if (!allowed) throw new AiQuotaError('QUOTA_EXCEEDED');
  };
}
