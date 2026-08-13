import type { OwnedGoalRepository } from './service';

interface StoredGoal {
  _id: string;
  title: string;
  successCriteria: string;
  currentProgress: string;
  stage: string;
}

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): {
    database(): {
      command: { in(values: readonly string[]): unknown };
      collection(name: string): {
        where(query: Record<string, unknown>): {
          get(): Promise<{ data: StoredGoal[] }>;
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

function isDeepSeekBaseUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) {
    return false;
  }

  try {
    return new URL(baseUrl).hostname === 'api.deepseek.com';
  } catch {
    return false;
  }
}

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
      return result.data.map((goal) => ({
        id: goal._id,
        title: goal.title,
        successCriteria: goal.successCriteria,
        currentProgress: goal.currentProgress,
        stage: goal.stage,
      }));
    },
  };
}

exports.main = (event: unknown, context: unknown) =>
  handlePlanGenerate(event, context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    env: process.env,
    createRepository,
    createProvider: (configuration) => {
      const usesDeepSeek = isDeepSeekBaseUrl(configuration.baseUrl);
      return createTokenHubProvider({
        ...configuration,
        ...(usesDeepSeek
          ? {
              timeoutMs: 8_000,
              requestOptions: { thinking: { type: 'disabled' } },
            }
          : {}),
        buildMessages: buildDailyPlanMessages,
      });
    },
  });
