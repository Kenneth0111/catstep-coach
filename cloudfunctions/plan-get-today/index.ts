import type { ConfirmedDailyPlan } from '../plan-confirm/service';
import type { TodayPlanRepository } from './service';

interface StoredPlan extends Omit<ConfirmedDailyPlan, 'id'> {
  _id: string;
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
      collection(name: 'plans'): PlanCollection;
    };
  };
};

const { handlePlanGetToday } = require('./handler') as typeof import('./handler');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const plans = app.database().collection('plans');

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
  };
}

exports.main = (_event: unknown, context: unknown) =>
  handlePlanGetToday(context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    createRepository,
    now: () => new Date(),
  });
