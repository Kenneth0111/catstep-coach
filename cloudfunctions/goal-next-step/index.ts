const cloudbase = require('@cloudbase/node-sdk') as {
  getCloudbaseContext(context: unknown): { OPENID?: string };
};

const { handleGoalNextStep } = require('./handler') as typeof import('./handler');
const { buildGoalClarificationMessages } = require('./prompt') as typeof import('./prompt');
const { createTokenHubProvider } = require('../shared/tokenhub-provider') as typeof import('../shared/tokenhub-provider');

exports.main = (event: unknown, context: unknown) =>
  handleGoalNextStep(event, context, {
    getOpenid: (cloudContext) =>
      cloudbase.getCloudbaseContext(cloudContext).OPENID,
    env: process.env,
    createProvider: (configuration) =>
      createTokenHubProvider({
        ...configuration,
        buildMessages: buildGoalClarificationMessages,
      }),
  });
