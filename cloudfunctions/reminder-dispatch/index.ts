const { dispatchDueReminders } = require('../reminder-schedule/service') as typeof import('../reminder-schedule/service');
const { createSubscriptionMessageSender } = require('./sender') as typeof import('./sender');
const cloudbase = require('@cloudbase/node-sdk') as { SYMBOL_CURRENT_ENV: string; init(options: { env: string }): { database(): any } };
const wxCloud = require('wx-server-sdk') as {
  DYNAMIC_CURRENT_ENV: string;
  init(options: { env: string }): void;
  openapi: { subscribeMessage: { send(input: unknown): Promise<unknown> } };
};
export {};
const database = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV }).database();
const reminders = database.collection('reminders');
wxCloud.init({ env: wxCloud.DYNAMIC_CURRENT_ENV });

function miniprogramState(): 'developer' | 'trial' | 'formal' {
  const value = process.env.WECHAT_MINIPROGRAM_STATE;
  return value === 'trial' || value === 'formal' ? value : 'developer';
}

const sendReminder = createSubscriptionMessageSender(
  (input) => wxCloud.openapi.subscribeMessage.send(input),
  {
    planStartTemplateId: process.env.WECHAT_PLAN_START_TEMPLATE_ID ?? '',
    reviewTemplateId: process.env.WECHAT_REVIEW_TEMPLATE_ID ?? '',
    miniprogramState: miniprogramState(),
  },
);
exports.main = async () => {
  await dispatchDueReminders({
    async findDue() {
      const result = await reminders.where({ status: 'pending', sendAt: database.command.lte(new Date().toISOString()) }).limit(100).get();
      return result.data;
    },
    async markDispatched(id: string, status: 'sent' | 'failed', code?: string) {
      await reminders.doc(id).update({
        status,
        dispatchCode: code ?? 'OK',
        dispatchedAt: new Date().toISOString(),
      });
    },
  }, sendReminder);
  return { ok: true };
};
