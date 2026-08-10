import type { PlanTaskUpdateRepository, StoredPlan } from './service';

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

export interface PlanTaskUpdateDatabase {
  plans: {
    doc(id: string): {
      get(): Promise<{ data: StoredPlanDocument[] }>;
    };
  };
  runTransaction<T>(
    updateFunction: (transaction: Transaction) => Promise<T>,
  ): Promise<{ result: T }>;
}

function toStoredPlan(plan: StoredPlanDocument): StoredPlan {
  const { _id, ...fields } = plan;
  return { id: _id, ...fields };
}

export function createPlanTaskUpdateRepository(
  database: PlanTaskUpdateDatabase,
): PlanTaskUpdateRepository {
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
      if (result?.result) {
        return result.result;
      }
      const fallback = await database.plans.doc(planId).get();
      const stored = fallback.data[0];
      return stored && stored._openid === openid
        ? toStoredPlan(stored)
        : null;
    },
  };
}
