import { describe, expect, it } from 'vitest';
import {
  getOrCreateProfile,
  type ProfileRepository,
} from '../cloudfunctions/profile-get-or-create/service';

describe('getOrCreateProfile', () => {
  it('returns an existing profile without creating another one', async () => {
    const existing = {
      openid: 'user-1',
      growth: 0,
      createdAt: '2026-08-06T00:00:00.000Z',
    };
    let saved = false;
    const repository: ProfileRepository = {
      findByOpenid: async () => existing,
      save: async (profile) => {
        saved = true;
        return profile;
      },
    };

    await expect(
      getOrCreateProfile(
        'user-1',
        repository,
        () => new Date('2026-08-06T00:00:00Z'),
      ),
    ).resolves.toEqual(existing);
    expect(saved).toBe(false);
  });

  it('creates a zero-growth profile for a new openid', async () => {
    const repository: ProfileRepository = {
      findByOpenid: async () => null,
      save: async (profile) => profile,
    };

    await expect(
      getOrCreateProfile(
        'user-2',
        repository,
        () => new Date('2026-08-06T00:00:00Z'),
      ),
    ).resolves.toEqual({
      openid: 'user-2',
      growth: 0,
      createdAt: '2026-08-06T00:00:00.000Z',
    });
  });

  it('rejects an empty authenticated identity', async () => {
    const repository: ProfileRepository = {
      findByOpenid: async () => null,
      save: async (profile) => profile,
    };

    await expect(
      getOrCreateProfile('', repository, () => new Date()),
    ).rejects.toThrow('openid is required');
  });
});
