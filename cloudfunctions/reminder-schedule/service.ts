export type ReminderKind = 'plan_start' | 'review';
export type ReminderStatus = 'pending' | 'sent' | 'failed';
export type ReminderTemplateData = Record<string, { value: string }>;

export interface ReminderPlan {
  id: string;
  date: string;
  summary: string;
  tasks: Array<{ title: string; status: 'pending' | 'in_progress' | 'completed' }>;
}

export interface ScheduledReminder {
  id: string;
  _openid: string;
  owner: string;
  planId: string;
  requestId: string;
  kind: ReminderKind;
  sendAt: string;
  status: ReminderStatus;
  data: ReminderTemplateData;
}

export interface ReminderRepository {
  findOwnedPlan(openid: string, planId: string): Promise<ReminderPlan | null>;
  findByRequestId(openid: string, requestId: string): Promise<ScheduledReminder | null>;
  findByPlanAndKind(openid: string, planId: string, kind: ReminderKind): Promise<ScheduledReminder | null>;
  save(reminder: ScheduledReminder): Promise<ScheduledReminder>;
}

export interface ReminderDispatchRepository {
  findDue(): Promise<ScheduledReminder[]>;
  markDispatched(id: string, status: 'sent' | 'failed', code?: string): Promise<void>;
}

export class ReminderServiceError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'ReminderServiceError';
  }
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isInput(value: unknown): value is {
  requestId: string; planId: string; kind: ReminderKind;
} {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    isText((value as Record<string, unknown>).requestId) &&
    isText((value as Record<string, unknown>).planId) &&
    ((value as Record<string, unknown>).kind === 'plan_start' || (value as Record<string, unknown>).kind === 'review');
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

function truncate(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join('');
}

function shanghaiTime(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.hour}:${fields.minute}`;
}

function scheduleFor(kind: ReminderKind, date: string, now: Date): Date {
  if (kind === 'plan_start') return new Date(now.getTime() + FIFTEEN_MINUTES);
  const reviewAt = new Date(`${date}T13:00:00.000Z`);
  return reviewAt.getTime() > now.getTime()
    ? reviewAt
    : new Date(now.getTime() + FIFTEEN_MINUTES);
}

function templateData(plan: ReminderPlan, kind: ReminderKind, sendAt: Date): ReminderTemplateData {
  if (kind === 'review') {
    return {
      thing9: { value: '今日学习复盘' },
      time10: { value: shanghaiTime(sendAt) },
      thing3: { value: '回顾完成情况，记录下一步' },
      thing8: { value: '待复盘' },
    };
  }
  const currentTask = plan.tasks.find((task) => task.status !== 'completed');
  return {
    thing3: { value: truncate(currentTask?.title ?? plan.summary, 20) },
    date2: { value: plan.date },
    time11: { value: shanghaiTime(sendAt) },
    thing9: { value: '打开进步喵，先完成15分钟' },
  };
}

export async function scheduleOwnedReminders(
  openid: string,
  input: unknown,
  repository: ReminderRepository,
  today: () => string,
  now: () => Date = () => new Date(),
): Promise<ScheduledReminder> {
  if (!openid.trim() || !isInput(input)) {
    throw new ReminderServiceError('INVALID_CONTEXT');
  }
  const existing = await repository.findByRequestId(openid, input.requestId.trim());
  if (existing) return existing;
  const plan = await repository.findOwnedPlan(openid, input.planId.trim());
  if (!plan || plan.date !== today()) throw new ReminderServiceError('INVALID_CONTEXT');
  if (await repository.findByPlanAndKind(openid, plan.id, input.kind)) {
    throw new ReminderServiceError('INVALID_CONTEXT');
  }
  const sendAt = scheduleFor(input.kind, plan.date, now());
  return repository.save({
    id: input.requestId.trim(), _openid: openid, owner: openid, planId: plan.id,
    requestId: input.requestId.trim(), kind: input.kind, sendAt: sendAt.toISOString(),
    status: 'pending', data: templateData(plan, input.kind, sendAt),
  });
}

function codeOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code : 'UNKNOWN_ERROR';
}

export async function dispatchDueReminders(
  repository: ReminderDispatchRepository,
  send: (reminder: ScheduledReminder) => Promise<void>,
): Promise<void> {
  for (const reminder of await repository.findDue()) {
    if (reminder.status !== 'pending') continue;
    try {
      await send(reminder);
      await repository.markDispatched(reminder.id, 'sent');
    } catch (error) {
      const code = codeOf(error);
      console.warn('reminder_dispatch_failure', { stage: 'send', code });
      await repository.markDispatched(reminder.id, 'failed', code);
    }
  }
}
