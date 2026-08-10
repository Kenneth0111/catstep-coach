import type { StoredPlan } from './service';
import type { PlanTaskUpdateRepository } from './service';

interface StoredPlanDocument extends Omit<StoredPlan, 'id'> {
  _id: string;
}

interface PlanDocument {
  get(): Promise<{ data: StoredPlanDocument | null }>;
  set(plan: Omit<StoredPlan, 'id'>): Promise<unknown>;
}

interface Transaction {
  collection(name: 'plans'): { doc(id: string): PlanDocument };
}

interface Database {
  runTransaction<T>(
    updateFunction: (transaction: Transaction) => Promise<T>,
  ): Promise<{ result: T }>;
}

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): { database(): Database };
};

const { handlePlanUpdateTask } = require('./handler') as typeof import('./handler');
const database = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV }).database();

function toStoredPlan(plan: StoredPlanDocument): StoredPlan {
  const { _id, ...fields } = plan;
  return { id: _id, ...fields };
}

function createRepository(): PlanTaskUpdateRepository {
  return {
    async updateOwnedPlan(openid, planId, update) {
      const result = await database.runTransaction(async (transaction) => {
        const document = transaction.collection('plans').doc(planId);
        const current = await document.get();
        if (!current.data || current.data._openid !== openid) {
          return null;
        }
        const updated = update(toStoredPlan(current.data));
        const { id: _id, ...fields } = updated;
        await document.set(fields);
        return updated;
      });
      return result.result;
    },
  };
}

exports.main = (event: unknown, context: unknown) =>
  handlePlanUpdateTask(event, context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    createRepository,
    now: () => new Date(),
  });
