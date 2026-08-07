import type {
  ConfirmedGoal,
  GoalRepository,
  PersistedGoal,
} from './service';

interface StoredGoal extends PersistedGoal {
  _id: string;
}

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { OPENID?: string };
  init(options: { env: string }): {
    database(): {
      collection(name: string): {
        where(query: { _openid: string; requestId: string }): {
          limit(count: number): {
            get(): Promise<{ data: StoredGoal[] }>;
          };
        };
        add(goal: PersistedGoal): Promise<{ id: string }>;
      };
    };
  };
};

const { handleGoalConfirm } = require('./handler') as typeof import('./handler');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const goals = app.database().collection('goals');

function toConfirmedGoal(goal: StoredGoal): ConfirmedGoal {
  const { _id, ...fields } = goal;
  return { id: _id, ...fields };
}

function createRepository(): GoalRepository {
  return {
    async findByRequestId(openid, requestId) {
      const result = await goals
        .where({ _openid: openid, requestId })
        .limit(1)
        .get();
      return result.data[0] ? toConfirmedGoal(result.data[0]) : null;
    },
    async save(goal) {
      const result = await goals.add(goal);
      return { id: result.id, ...goal };
    },
  };
}

exports.main = (event: unknown, context: unknown) =>
  handleGoalConfirm(event, context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).OPENID,
    createRepository,
    now: () => new Date(),
  });
