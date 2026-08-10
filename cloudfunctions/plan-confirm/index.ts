import {
  createDailyPlanRepository,
  type PlanRepositoryDatabase,
} from './repository';

interface Database {
  command: PlanRepositoryDatabase['command'];
  collection(name: 'plans'): PlanRepositoryDatabase['plans'];
  collection(name: 'goals'): PlanRepositoryDatabase['goals'];
  runTransaction: PlanRepositoryDatabase['runTransaction'];
}

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): { database(): Database };
};

const { handlePlanConfirm } = require('./handler') as typeof import('./handler');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const database = app.database();

function createRepository() {
  return createDailyPlanRepository({
    command: database.command,
    plans: database.collection('plans'),
    goals: database.collection('goals'),
    runTransaction: (updateFunction) =>
      database.runTransaction(updateFunction),
  });
}

exports.main = (event: unknown, context: unknown) =>
  handlePlanConfirm(event, context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    createRepository,
    now: () => new Date(),
  });
