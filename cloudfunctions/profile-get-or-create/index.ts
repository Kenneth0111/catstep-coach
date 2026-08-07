const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { OPENID?: string };
  init(options: { env: string }): {
    database(): {
      collection(name: string): {
        where(query: { _openid: string }): {
          limit(count: number): {
            get(): Promise<{ data: StoredProfile[] }>;
          };
        };
        add(data: StoredProfile): Promise<unknown>;
      };
    };
  };
};

const { getOrCreateProfile } = require('./service') as typeof import('./service');
import type { ProfileRepository, UserProfile } from './service';

interface StoredProfile {
  _openid: string;
  growth: number;
  createdAt: string;
}

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const users = app.database().collection('users');

const repository: ProfileRepository = {
  async findByOpenid(openid) {
    const result = await users.where({ _openid: openid }).limit(1).get();
    const stored = result.data[0];

    return stored
      ? {
          openid: stored._openid,
          growth: stored.growth,
          createdAt: stored.createdAt,
        }
      : null;
  },

  async save(profile) {
    await users.add({
      _openid: profile.openid,
      growth: profile.growth,
      createdAt: profile.createdAt,
    });
    return profile;
  },
};

exports.main = async (_event: unknown, context: unknown) => {
  const { OPENID } = cloudbase.getCloudbaseContext(context);
  if (!OPENID) {
    return { ok: false as const, code: 'UNAUTHENTICATED' as const };
  }

  const profile: UserProfile = await getOrCreateProfile(
    OPENID,
    repository,
    () => new Date(),
  );

  return { ok: true as const, profile };
};
