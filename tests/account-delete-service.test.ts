import { describe, expect, it, vi } from 'vitest';
import {
  AccountDeleteError,
  deleteOwnedAccount,
  type AccountDeleteRepository,
} from '../cloudfunctions/account-delete/service';

describe('account deletion', () => {
  it('deletes only collections owned by the authenticated user and returns no deletion details', async () => {
    const deleted: string[] = [];
    const repository: AccountDeleteRepository = {
      async deleteOwned(collection, openid) { deleted.push(`${collection}:${openid}`); },
      async audit(event) { expect(event).toMatchObject({ event: 'account_deleted' }); },
    };

    await expect(deleteOwnedAccount('user-1', repository, () => new Date('2026-08-13T00:00:00.000Z')))
      .resolves.toEqual({ deleted: true });
    expect(deleted).toEqual([
      'goals:user-1', 'plans:user-1', 'reviews:user-1', 'memories:user-1',
      'reminders:user-1', 'ai_calls:user-1', 'ai_quotas:user-1', 'users:user-1',
    ]);
  });

  it('rejects missing identity and logs only a stable failure code', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(deleteOwnedAccount('', { async deleteOwned() {}, async audit() {} }, () => new Date()))
        .rejects.toEqual(new AccountDeleteError('UNAUTHENTICATED'));
      expect(error).toHaveBeenCalledWith('account_delete_rejected', { stage: 'identity', code: 'UNAUTHENTICATED' });
    } finally { error.mockRestore(); }
  });
});
