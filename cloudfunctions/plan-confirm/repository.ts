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

function isConfirmedPlan(value: unknown): value is ConfirmedDailyPlan {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const plan = value as Record<string, unknown>;
  return (
    typeof plan.id === 'string' &&
    typeof plan.date === 'string' &&
    typeof plan._openid === 'string' &&
    typeof plan.owner === 'string' &&
    typeof plan.availableMinutes === 'number' &&
    typeof plan.summary === 'string' &&
    Array.isArray(plan.tasks) &&
    plan.status === 'confirmed' &&
    typeof plan.requestId === 'string' &&
    plan.version === 1 &&
    typeof plan.createdAt === 'string' &&
    (plan.processedRequestIds === undefined ||
      (Array.isArray(plan.processedRequestIds) &&
        plan.processedRequestIds.every((requestId) => typeof requestId === 'string')))
  );
}

function toConfirmedPlan(plan: StoredPlan): ConfirmedDailyPlan {
  const { _id, ...fields } = plan;
  return { id: _id, ...fields };
}

function hasProcessedRequestId(
  plan: ConfirmedDailyPlan,
  requestId: string,
): boolean {
  return (
    plan.requestId === requestId ||
    plan.processedRequestIds?.includes(requestId) === true
  );
}

interface TransactionPlanDocument {
  get(): Promise<{ data: StoredPlan | null }>;
  set(plan: PersistedDailyPlan): Promise<unknown>;
  update(plan: PersistedDailyPlan): Promise<unknown>;
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
    async createOrAppend(documentId, incoming, merge) {
      try {
        const transactionResult = await database.runTransaction(
          async (transaction) => {
            const document = transaction.collection('plans').doc(documentId);
            const current = await document.get();
            if (!current.data) {
              await document.set(incoming);
              return { id: documentId, ...incoming };
            }

            const { _id, ...currentPlan } = current.data;
            const merged = merge(currentPlan);
            if (merged !== currentPlan) {
              await document.update(merged);
            }
            return { id: documentId, ...merged };
          },
        );
        if (!isConfirmedPlan(transactionResult?.result)) {
          throw new Error('invalid transaction result');
        }
        return transactionResult.result;
      } catch (error) {
        const existing = await readPlan(documentId);
        if (existing && hasProcessedRequestId(existing, incoming.requestId)) {
          return existing;
        }
        throw error;
      }
    },
  };
}
