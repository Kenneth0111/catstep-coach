import type { OwnedGoalRepository } from './service';

interface StoredGoalId {
  _id: string;
}

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): {
    database(): {
      command: { in(values: readonly string[]): unknown };
      collection(name: string): {
        where(query: Record<string, unknown>): {
          get(): Promise<{ data: StoredGoalId[] }>;
        };
      };
    };
  };
};

const { handlePlanGenerate } = require('./handler') as typeof import('./handler');
const { buildDailyPlanMessages } = require('./prompt') as typeof import('./prompt');
const { createTokenHubProvider } = require('../shared/tokenhub-provider') as typeof import('../shared/tokenhub-provider');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const database = app.database();
const goals = database.collection('goals');

function createRepository(): OwnedGoalRepository {
  return {
    async findActiveByIds(openid, goalIds) {
      const result = await goals
        .where({
          _openid: openid,
          status: 'active',
          _id: database.command.in(goalIds),
        })
        .get();
      return result.data.map((goal) => ({ id: goal._id }));
    },
  };
}

exports.main = (event: unknown, context: unknown) =>
  handlePlanGenerate(event, context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    env: process.env,
    createRepository,
    createProvider: (configuration) =>
      createTokenHubProvider({
        ...configuration,
        buildMessages: buildDailyPlanMessages,
      }),
  });
