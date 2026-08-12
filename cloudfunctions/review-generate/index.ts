import type {
  OwnedTodayPlan,
  OwnedTodayPlanRepository,
} from './service';

interface StoredPlan extends Omit<OwnedTodayPlan, 'id'> {
  _id: string;
  _openid: string;
  status: 'confirmed';
}

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): {
    database(): {
      collection(name: 'plans'): {
        doc(id: string): { get(): Promise<{ data: StoredPlan[] }> };
      };
    };
  };
};

const { handleReviewGenerate } = require('./handler') as typeof import('./handler');
const { createTokenHubProvider } = require('../shared/tokenhub-provider') as typeof import('../shared/tokenhub-provider');
const { buildReviewMessages } = require('./prompt') as typeof import('./prompt');

const database = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV }).database();

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

function createRepository(): OwnedTodayPlanRepository {
  return {
    async findTodayById(openid, planId) {
      const result = await database.collection('plans').doc(planId).get();
      const plan = result.data[0];
      if (
        !plan ||
        plan._openid !== openid ||
        plan.status !== 'confirmed' ||
        plan.date !== shanghaiDate(new Date())
      ) {
        return null;
      }
      const { _id, _openid: _owner, status: _status, ...fields } = plan;
      return { id: _id, ...fields };
    },
  };
}

exports.main = (event: unknown, context: unknown) =>
  handleReviewGenerate(event, context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    createRepository,
    createProvider: () =>
      createTokenHubProvider({
        apiKey: process.env.TOKENHUB_API_KEY ?? '',
        model: process.env.TOKENHUB_MODEL ?? '',
        baseUrl: process.env.TOKENHUB_BASE_URL,
        buildMessages: buildReviewMessages,
      }),
  });
