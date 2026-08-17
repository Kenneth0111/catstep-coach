export const OWNED_COLLECTIONS = ['goals', 'plans', 'reviews', 'memories', 'reminders', 'ai_calls', 'ai_quotas', 'users'] as const;
export type OwnedCollection = (typeof OWNED_COLLECTIONS)[number];

export interface AccountDeleteRepository {
  deleteOwned(collection: OwnedCollection, openid: string): Promise<void>;
  audit(event: { event: 'account_deleted'; deletedAt: string }): Promise<void>;
}

export class AccountDeleteError extends Error {
  constructor(readonly code: 'UNAUTHENTICATED') { super(code); this.name = 'AccountDeleteError'; }
}

export async function deleteOwnedAccount(
  openid: string,
  repository: AccountDeleteRepository,
  now: () => Date,
): Promise<{ deleted: true }> {
  if (!openid.trim()) {
    console.error('account_delete_rejected', { stage: 'identity', code: 'UNAUTHENTICATED' });
    throw new AccountDeleteError('UNAUTHENTICATED');
  }
  try {
    for (const collection of OWNED_COLLECTIONS) await repository.deleteOwned(collection, openid);
    await repository.audit({ event: 'account_deleted', deletedAt: now().toISOString() });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN_ERROR';
    console.error('account_delete_failure', { stage: 'delete_or_audit', code });
    throw error;
  }
  return { deleted: true };
}
