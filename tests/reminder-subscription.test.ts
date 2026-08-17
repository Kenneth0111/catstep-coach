import { describe, expect, it, vi } from 'vitest';
import {
  REMINDER_TEMPLATE_IDS,
  requestReminderAuthorization,
  subscribeToTodayReminders,
} from '../miniprogram/shared/reminder-subscription';

describe('Today reminder subscription', () => {
  it('invokes the WeChat subscription prompt with the supplied template IDs', async () => {
    const request = vi.fn((options: {
      tmplIds: string[];
      success(result: Record<string, 'accept'>): void;
    }) => options.success({ [REMINDER_TEMPLATE_IDS.plan_start]: 'accept' }));

    await expect(requestReminderAuthorization(
      [REMINDER_TEMPLATE_IDS.plan_start],
      request,
    )).resolves.toEqual({ [REMINDER_TEMPLATE_IDS.plan_start]: 'accept' });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      tmplIds: [REMINDER_TEMPLATE_IDS.plan_start],
    }));
  });

  it('requests both templates and schedules only the kinds the user accepted', async () => {
    const requestSubscription = vi.fn(async () => ({
      [REMINDER_TEMPLATE_IDS.plan_start]: 'accept' as const,
      [REMINDER_TEMPLATE_IDS.review]: 'reject' as const,
    }));
    const schedule = vi.fn(async () => undefined);

    const result = await subscribeToTodayReminders('plan-1', {
      requestSubscription,
      schedule,
      createRequestId: (kind) => `request-${kind}`,
    });

    expect(requestSubscription).toHaveBeenCalledWith([
      REMINDER_TEMPLATE_IDS.plan_start,
      REMINDER_TEMPLATE_IDS.review,
    ]);
    expect(schedule).toHaveBeenCalledWith({
      requestId: 'request-plan_start',
      planId: 'plan-1',
      kind: 'plan_start',
    });
    expect(result).toEqual({ accepted: ['plan_start'], scheduled: ['plan_start'] });
  });

  it('treats acceptWithAudio as an accepted one-time subscription', async () => {
    const schedule = vi.fn(async () => undefined);

    const result = await subscribeToTodayReminders('plan-1', {
      requestSubscription: async () => ({
        [REMINDER_TEMPLATE_IDS.plan_start]: 'reject',
        [REMINDER_TEMPLATE_IDS.review]: 'acceptWithAudio',
      }),
      schedule,
      createRequestId: (kind) => `request-${kind}`,
    });

    expect(result.accepted).toEqual(['review']);
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
