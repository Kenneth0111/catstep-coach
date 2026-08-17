import type { ScheduledReminder } from '../reminder-schedule/service';

export type MiniprogramState = 'developer' | 'trial' | 'formal';

export interface ReminderSenderConfig {
  planStartTemplateId: string;
  reviewTemplateId: string;
  miniprogramState: MiniprogramState;
}

export class ReminderSenderError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ReminderSenderError';
  }
}

type SendSubscriptionMessage = (input: {
  touser: string;
  templateId: string;
  page: string;
  data: ScheduledReminder['data'];
  miniprogramState: MiniprogramState;
  lang: 'zh_CN';
}) => Promise<unknown>;

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const value = error as { errCode?: unknown; code?: unknown };
    if (typeof value.errCode === 'number') return `WECHAT_${value.errCode}`;
    if (typeof value.code === 'string') return value.code;
  }
  return 'SEND_FAILED';
}

export function createSubscriptionMessageSender(
  send: SendSubscriptionMessage,
  config: ReminderSenderConfig,
): (reminder: ScheduledReminder) => Promise<void> {
  return async (reminder) => {
    const templateId = reminder.kind === 'plan_start'
      ? config.planStartTemplateId.trim()
      : config.reviewTemplateId.trim();
    if (!templateId) throw new ReminderSenderError('MISCONFIGURED');
    try {
      await send({
        touser: reminder._openid,
        templateId,
        page: 'pages/today/index',
        data: reminder.data,
        miniprogramState: config.miniprogramState,
        lang: 'zh_CN',
      });
    } catch (error) {
      throw new ReminderSenderError(errorCode(error));
    }
  };
}
