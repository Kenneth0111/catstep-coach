const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): {
    database(): {
      collection(name: 'users'): {
        where(query: { _openid: string }): {
          limit(count: number): { get(): Promise<{ data: Array<{ growth?: number }> }> };
        };
      };
      collection(name: 'reviews'): {
        where(query: { _openid: string }): {
          orderBy(field: 'createdAt', direction: 'desc'): {
            limit(count: number): {
              get(): Promise<{ data: Array<{ date?: string; growthAwarded?: number }> }>;
            };
          };
        };
      };
    };
  };
};

const { handleGrowthSummary } = require('./handler') as typeof import('./handler');
import type { GrowthSummaryRepository } from './service';

const database = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV }).database();

function createRepository(): GrowthSummaryRepository {
  return {
    async findGrowth(openid) {
      const result = await database.collection('users')
        .where({ _openid: openid })
        .limit(1)
        .get();
      return result.data[0]?.growth ?? null;
    },
    async findRecentAwards(openid) {
      const result = await database.collection('reviews')
        .where({ _openid: openid })
        .orderBy('createdAt', 'desc')
        .limit(3)
        .get();
      return result.data.map((review) => ({
        date: typeof review.date === 'string' ? review.date : '',
        growthAwarded: typeof review.growthAwarded === 'number'
          ? review.growthAwarded
          : -1,
      }));
    },
  };
}

exports.main = (event: unknown, context: unknown) => handleGrowthSummary(
  event,
  context,
  {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    createRepository,
  },
);
