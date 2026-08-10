import type {
  ConfirmedDailyPlan,
  DailyPlanRepository,
  PersistedDailyPlan,
} from './service';

interface StoredPlan extends PersistedDailyPlan {
  _id: string;
}

interface StoredGoalId {
  _id: string;
}

interface TransactionPlanDocument {
  get(): Promise<{ data: StoredPlan | null }>;
  set(plan: PersistedDailyPlan): Promise<unknown>;
}

interface PlanTransaction {
  collection(name: 'plans'): {
    doc(id: string): TransactionPlanDocument;
  };
}

export interface PlanRepositoryDatabase {
  command: { in(values: readonly string[]): unknown };
  plans: {
    doc(id: string): {
      get(): Promise<{ data: StoredPlan[] }>;
    };
  };
  goals: {
    where(query: {
      _openid: string;
      status: 'active';
      _id: unknown;
    }): {
      get(): Promise<{ data: StoredGoalId[] }>;
    };
  };
  runTransaction<T>(
    updateFunction: (transaction: PlanTransaction) => Promise<T>,
  ): Promise<{ result: T }>;
}

function toConfirmedPlan(plan: StoredPlan): ConfirmedDailyPlan {
  const { _id, ...fields } = plan;
  return { id: _id, ...fields };
}

export function createDailyPlanRepository(
  database: PlanRepositoryDatabase,
): DailyPlanRepository {
  async function readPlan(
    documentId: string,
  ): Promise<ConfirmedDailyPlan | null> {
    const result = await database.plans.doc(documentId).get();
    const plan = result.data[0];
    return plan ? toConfirmedPlan(plan) : null;
  }

  return {
    async findActiveGoalIds(openid, goalIds) {
      const result = await database.goals
        .where({
          _openid: openid,
          status: 'active',
          _id: database.command.in(goalIds),
        })
        .get();
      return result.data.map((goal) => goal._id);
    },
    async saveIfAbsent(documentId, plan) {
      try {
        const transactionResult = await database.runTransaction(
          async (transaction) => {
            const document = transaction.collection('plans').doc(documentId);
            const current = await document.get();
            if (current.data) {
              return toConfirmedPlan(current.data);
            }
            await document.set(plan);
            return { id: documentId, ...plan };
          },
        );
        return transactionResult.result;
      } catch (error) {
        const existing = await readPlan(documentId);
        if (existing) {
          return existing;
        }
        throw error;
      }
    },
  };
}
