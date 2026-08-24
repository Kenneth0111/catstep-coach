import type { OwnedGoalRepository } from './service';

interface StoredGoal {
  _id: string;
  title: string;
  successCriteria: string;
  currentProgress: string;
  stage: string;
}

interface StoredPlan {
  tasks: Array<{ goalId: string }>;
}

interface GoalCollection {
  where(query: Record<string, unknown>): {
    get(): Promise<{ data: StoredGoal[] }>;
  };
}

interface PlanCollection {
  where(query: {
    _openid: string;
    date: string;
    status: 'confirmed';
  }): {
    limit(count: number): {
      get(): Promise<{ data: StoredPlan[] }>;
    };
  };
}

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): {
    database(): {
      command: { in(values: readonly string[]): unknown };
      runTransaction<T>(update: (transaction: any) => Promise<T>): Promise<T | { result: T }>;
      collection(name: 'goals'): GoalCollection;
      collection(name: 'plans'): PlanCollection;
    };
  };
};

const { handlePlanGenerate } = require('./handler') as typeof import('./handler');
const { buildDailyPlanMessages } = require('./prompt') as typeof import('./prompt');
const { getDailyPlanProviderOverrides } = require('./provider-config') as typeof import('./provider-config');
const { createTokenHubProvider } = require('../shared/tokenhub-provider') as typeof import('../shared/tokenhub-provider');
const { createCloudbaseQuotaClaimer } = require('../shared/cloudbase-ai-quota') as typeof import('../shared/cloudbase-ai-quota');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const database = app.database();
const claimQuota = createCloudbaseQuotaClaimer(database, () => new Date());
const goals = database.collection('goals');
const plans = database.collection('plans');

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
    async getTodayCapacity(openid, date) {
      const result = await plans
        .where({ _openid: openid, date, status: 'confirmed' })
        .limit(1)
        .get();
      const plan = result.data[0];
      if (!plan) {
        return null;
      }
      return {
        goalIds: [...new Set(plan.tasks.map((task) => task.goalId))],
        taskCount: plan.tasks.length,
      };
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
      return createTokenHubProvider({
        ...configuration,
        ...getDailyPlanProviderOverrides(configuration.baseUrl),
        buildMessages: buildDailyPlanMessages,
      });
    },
    claimQuota,
  });
