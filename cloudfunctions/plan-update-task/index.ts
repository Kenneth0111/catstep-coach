import {
  createPlanTaskUpdateRepository,
  type PlanTaskUpdateDatabase,
} from './repository';

interface Database {
  collection(name: 'plans'): PlanTaskUpdateDatabase['plans'];
  runTransaction: PlanTaskUpdateDatabase['runTransaction'];
}

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): { database(): Database };
};

const { handlePlanUpdateTask } = require('./handler') as typeof import('./handler');
const database = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV }).database();

exports.main = (event: unknown, context: unknown) =>
  handlePlanUpdateTask(event, context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    createRepository: () =>
      createPlanTaskUpdateRepository({
        plans: database.collection('plans'),
        runTransaction: (update) => database.runTransaction(update),
      }),
    now: () => new Date(),
  });
