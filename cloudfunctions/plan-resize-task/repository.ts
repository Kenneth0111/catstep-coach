import type { PlanResizeRepository, StoredResizablePlan } from './service';

interface StoredPlanDocument extends Omit<StoredResizablePlan, 'id'> {
  _id: string;
}

interface PlanDocument {
  get(): Promise<{ data: StoredPlanDocument | null }>;
  set(plan: Omit<StoredResizablePlan, 'id'>): Promise<unknown>;
}

interface Transaction {
  collection(name: 'plans'): { doc(id: string): PlanDocument };
}

export interface PlanResizeDatabase {
  plans: { doc(id: string): { get(): Promise<{ data: StoredPlanDocument[] }> } };
  runTransaction<T>(updateFunction: (transaction: Transaction) => Promise<T>): Promise<{ result: T }>;
}

function toPlan(document: StoredPlanDocument): StoredResizablePlan {
  const { _id, ...fields } = document;
  return { id: _id, ...fields };
}

export function createPlanResizeRepository(
  database: PlanResizeDatabase,
  today: () => string,
): PlanResizeRepository {
  return {
    async updateOwnedPlan(openid, planId, update) {
      const result = await database.runTransaction(async (transaction) => {
        const document = transaction.collection('plans').doc(planId);
        const current = await document.get();
        if (
          !current.data ||
          current.data._openid !== openid ||
          current.data.date !== today()
        ) {
          return null;
        }
        const updated = update(toPlan(current.data));
        const { id: _id, ...fields } = updated;
        await document.set(fields);
        return updated;
      });
      if (result.result) {
        return result.result;
      }
      const fallback = await database.plans.doc(planId).get();
      const plan = fallback.data[0];
      return plan && plan._openid === openid && plan.date === today()
        ? toPlan(plan)
        : null;
    },
  };
}
