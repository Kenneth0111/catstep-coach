import type { ConfirmedDailyPlan } from '../plan-confirm/service';
import type { TodayPlanRepository } from './service';

interface StoredPlan extends Omit<ConfirmedDailyPlan, 'id'> {
  _id: string;
}

interface StoredGoal {
  _id: unknown;
  _openid?: unknown;
  title?: unknown;
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

interface GoalCollection {
  where(query: {
    _openid: string;
    _id: unknown;
  }): {
    get(): Promise<{ data: StoredGoal[] }>;
  };
}

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): {
    database(): {
      command: { in(values: readonly string[]): unknown };
      collection(name: 'plans'): PlanCollection;
      collection(name: 'goals'): GoalCollection;
    };
  };
};

const { handlePlanGetToday } = require('./handler') as typeof import('./handler');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const database = app.database();
const plans = database.collection('plans');
const goals = database.collection('goals');

function createRepository(): TodayPlanRepository {
  return {
    async findConfirmedByDate(openid, date) {
      const result = await plans
        .where({ _openid: openid, date, status: 'confirmed' })
        .limit(1)
        .get();
      const plan = result.data[0];
      if (!plan) {
        return null;
      }
      const { _id, ...fields } = plan;
      return { id: _id, ...fields };
    },
    async findOwnedGoalTitles(openid, goalIds) {
      if (goalIds.length === 0) {
        return {};
      }
      const result = await goals
        .where({
          _openid: openid,
          _id: database.command.in(goalIds),
        })
        .get();
      const titles: Record<string, string> = {};
      for (const goal of result.data) {
        if (
          goal._openid === openid &&
          typeof goal._id === 'string' &&
          typeof goal.title === 'string'
        ) {
          titles[goal._id] = goal.title;
        }
      }
      return titles;
    },
  };
}

exports.main = (_event: unknown, context: unknown) =>
  handlePlanGetToday(context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    createRepository,
    now: () => new Date(),
  });
