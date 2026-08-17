const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): { database(): any };
};

const { handleGoalNextStep } = require('./handler') as typeof import('./handler');
const { buildGoalClarificationMessages } = require('./prompt') as typeof import('./prompt');
const { createTokenHubProvider } = require('../shared/tokenhub-provider') as typeof import('../shared/tokenhub-provider');
const { createCloudbaseQuotaClaimer } = require('../shared/cloudbase-ai-quota') as typeof import('../shared/cloudbase-ai-quota');
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const database = app.database();
const claimQuota = createCloudbaseQuotaClaimer(database, () => new Date());

exports.main = (event: unknown, context: unknown) =>
  handleGoalNextStep(event, context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).WX_OPENID,
    env: process.env,
    createProvider: (configuration) =>
      createTokenHubProvider({
        ...configuration,
        buildMessages: buildGoalClarificationMessages,
      }),
    claimQuota,
  });
