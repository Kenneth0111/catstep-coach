import { createPlanResizeRepository, type PlanResizeDatabase } from './repository';

const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): { database(): unknown };
};
const { handlePlanResizeTask } = require('./handler') as typeof import('./handler');
const { createTokenHubProvider } = require('../shared/tokenhub-provider') as typeof import('../shared/tokenhub-provider');
const { buildResizeTaskMessages } = require('./prompt') as typeof import('./prompt');
const { createCloudbaseQuotaClaimer } = require('../shared/cloudbase-ai-quota') as typeof import('../shared/cloudbase-ai-quota');

const database = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV }).database() as PlanResizeDatabase;
const claimQuota = createCloudbaseQuotaClaimer(database, () => new Date());

function shanghaiDate(now: Date): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

exports.main = (event: unknown, context: unknown) =>
  handlePlanResizeTask(event, context, {
    getOpenid: (cloudContext) => cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    createRepository: () => createPlanResizeRepository(database, () => shanghaiDate(new Date())),
    createProvider: () => createTokenHubProvider({
      apiKey: process.env.TOKENHUB_API_KEY ?? '',
      model: process.env.TOKENHUB_MODEL ?? '',
      baseUrl: process.env.TOKENHUB_BASE_URL,
      buildMessages: buildResizeTaskMessages,
    }),
    now: () => new Date(),
    claimQuota,
  });
