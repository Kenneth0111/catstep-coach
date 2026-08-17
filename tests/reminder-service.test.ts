import { describe, expect, it, vi } from 'vitest';
import {
  ReminderServiceError,
  dispatchDueReminders,
  scheduleOwnedReminders,
  type ReminderRepository,
  type ReminderDispatchRepository,
  type ScheduledReminder,
} from '../cloudfunctions/reminder-schedule/service';

function createRepository(): ReminderRepository & ReminderDispatchRepository & {
  saved: ScheduledReminder[];
  dispatched: string[];
} {
  const saved: ScheduledReminder[] = [];
  const dispatched: string[] = [];
  return {
    saved,
    dispatched,
    async findOwnedPlan(openid, planId) {
      return openid === 'user-1' && planId === 'plan-1'
        ? {
            id: planId,
            date: '2026-08-13',
            summary: '先走一小步',
            tasks: [{ title: '完成五道练习', status: 'pending' as const }],
          }
        : null;
    },
    async findByRequestId(_openid, requestId) {
      return saved.find((reminder) => reminder.requestId === requestId) ?? null;
    },
    async findByPlanAndKind(_openid, planId, kind) {
      return saved.find((reminder) => reminder.planId === planId && reminder.kind === kind) ?? null;
    },
    async save(reminder) {
      saved.push(reminder);
      return reminder;
    },
    async findDue() {
      return [{
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
      }];
    },
    async markDispatched(id, status, code) {
      dispatched.push(`${id}:${status}:${code ?? ''}`);
    },
  };
}

describe('reminder scheduling', () => {
  it('creates at most one reminder per supported kind and replays the same request', async () => {
    const repository = createRepository();

    const first = await scheduleOwnedReminders('user-1', {
      requestId: 'request-1', planId: 'plan-1', kind: 'plan_start',
    }, repository, () => '2026-08-13', () => new Date('2026-08-13T01:00:00.000Z'));
    const replay = await scheduleOwnedReminders('user-1', {
      requestId: 'request-1', planId: 'plan-1', kind: 'plan_start',
    }, repository, () => '2026-08-13', () => new Date('2026-08-13T01:00:00.000Z'));

    expect(first).toEqual(replay);
    expect(repository.saved).toHaveLength(1);
    expect(first.sendAt).toBe('2026-08-13T01:15:00.000Z');
    expect(first.data).toEqual({
      thing3: { value: '完成五道练习' },
      date2: { value: '2026-08-13' },
      time11: { value: '09:15' },
      thing9: { value: '打开进步喵，先完成15分钟' },
    });
  });

  it('schedules the evening review at 21:00 Shanghai with the configured template fields', async () => {
    const repository = createRepository();

    const reminder = await scheduleOwnedReminders('user-1', {
      requestId: 'request-2', planId: 'plan-1', kind: 'review',
    }, repository, () => '2026-08-13', () => new Date('2026-08-13T01:00:00.000Z'));

    expect(reminder.sendAt).toBe('2026-08-13T13:00:00.000Z');
    expect(reminder.data).toEqual({
      thing9: { value: '今日学习复盘' },
      time10: { value: '21:00' },
      thing3: { value: '回顾完成情况，记录下一步' },
      thing8: { value: '待复盘' },
    });
  });

  it('rejects a reminder that is not for the caller today', async () => {
    await expect(scheduleOwnedReminders('user-1', {
      requestId: 'request-1', planId: 'foreign-plan', kind: 'review',
    }, createRepository(), () => '2026-08-13')).rejects.toEqual(
      new ReminderServiceError('INVALID_CONTEXT'),
    );
  });

  it('rejects a second reminder of the same kind for one plan', async () => {
    const repository = createRepository();
    await scheduleOwnedReminders('user-1', { requestId: 'request-1', planId: 'plan-1', kind: 'review' }, repository, () => '2026-08-13');
    await expect(scheduleOwnedReminders('user-1', { requestId: 'request-2', planId: 'plan-1', kind: 'review' }, repository, () => '2026-08-13')).rejects.toEqual(new ReminderServiceError('INVALID_CONTEXT'));
  });

  it('marks delivery failures without logging the dispatcher detail', async () => {
    const repository = createRepository();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      await dispatchDueReminders(repository, async () => {
        throw Object.assign(new Error('template-secret-detail'), { code: 'SEND_FAILED' });
      });
      expect(repository.dispatched).toEqual(['reminder-1:failed:SEND_FAILED']);
      expect(warn).toHaveBeenCalledWith('reminder_dispatch_failure', {
        stage: 'send', code: 'SEND_FAILED',
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain('template-secret-detail');
    } finally {
      warn.mockRestore();
    }
  });
});
