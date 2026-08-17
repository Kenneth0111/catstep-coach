import { describe, expect, it, vi } from 'vitest';
import {
  ReminderSenderError,
  createSubscriptionMessageSender,
} from '../cloudfunctions/reminder-dispatch/sender';
import type { ScheduledReminder } from '../cloudfunctions/reminder-schedule/service';

const reviewReminder: ScheduledReminder = {
  id: 'reminder-1',
  _openid: 'user-1',
  owner: 'user-1',
  planId: 'plan-1',
  requestId: 'request-1',
  kind: 'review',
  sendAt: '2026-08-13T13:00:00.000Z',
  status: 'pending',
  data: {
    thing9: { value: '今日学习复盘' },
    time10: { value: '21:00' },
    thing3: { value: '回顾完成情况，记录下一步' },
    thing8: { value: '待复盘' },
  },
};

describe('subscription message sender', () => {
  it('sends the due reminder with the matching template and safe page target', async () => {
    const send = vi.fn(async () => ({ errCode: 0 }));
    const sender = createSubscriptionMessageSender(send, {
      planStartTemplateId: 'plan-template',
      reviewTemplateId: 'review-template',
      miniprogramState: 'developer',
    });

    await sender(reviewReminder);

    expect(send).toHaveBeenCalledWith({
      touser: 'user-1',
      templateId: 'review-template',
      page: 'pages/today/index',
      data: reviewReminder.data,
      miniprogramState: 'developer',
      lang: 'zh_CN',
    });
  });

  it('rejects missing template configuration before calling WeChat', async () => {
    const send = vi.fn(async () => ({ errCode: 0 }));
    const sender = createSubscriptionMessageSender(send, {
      planStartTemplateId: '',
      reviewTemplateId: '',
      miniprogramState: 'developer',
    });

    await expect(sender(reviewReminder)).rejects.toEqual(
      new ReminderSenderError('MISCONFIGURED'),
    );
    expect(send).not.toHaveBeenCalled();
  });
});
