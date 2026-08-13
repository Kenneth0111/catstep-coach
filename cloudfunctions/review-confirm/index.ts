import {
  createReviewConfirmationRepository,
  type ReviewConfirmationDatabase,
} from './repository';

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): {
    database(): {
      collection(name: 'plans' | 'reviews' | 'memories' | 'users'): unknown;
      runTransaction: ReviewConfirmationDatabase['runTransaction'];
    };
  };
};

const { handleReviewConfirm } = require('./handler') as typeof import('./handler');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const rawDatabase = app.database();
const database: ReviewConfirmationDatabase = {
  plans: rawDatabase.collection('plans') as ReviewConfirmationDatabase['plans'],
  reviews: rawDatabase.collection('reviews') as ReviewConfirmationDatabase['reviews'],
  memories: rawDatabase.collection('memories') as ReviewConfirmationDatabase['memories'],
  users: rawDatabase.collection('users') as ReviewConfirmationDatabase['users'],
  runTransaction: (updateFunction) => rawDatabase.runTransaction(updateFunction),
};

function shanghaiDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

exports.main = (event: unknown, context: unknown) =>
  handleReviewConfirm(event, context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    createRepository: () =>
      createReviewConfirmationRepository(database, () => shanghaiDate(new Date())),
    now: () => new Date(),
  });
