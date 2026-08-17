const cloudbase = require('@cloudbase/node-sdk') as {
  SYMBOL_CURRENT_ENV: string;
  getCloudbaseContext(context: unknown): { WX_OPENID?: string };
  init(options: { env: string }): { database(): { collection(name: 'plans' | 'reminders'): any } };
};
export {};
const { scheduleOwnedReminders, ReminderServiceError } = require('./service') as typeof import('./service');
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const database = app.database();
const reminders = database.collection('reminders');
const plans = database.collection('plans');
function today() { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
exports.main = async (event: unknown, context: unknown) => {
  const openid = cloudbase.getCloudbaseContext(context).WX_OPENID;
  if (!openid?.trim()) return { ok: false, code: 'UNAUTHENTICATED' };
  try {
    const reminder = await scheduleOwnedReminders(openid, event, {
      async findOwnedPlan(owner, planId) {
        const result = await plans.where({ _openid: owner, _id: planId, status: 'confirmed' }).get();
        const plan = result.data[0];
        return plan ? {
          id: plan._id,
          date: plan.date,
          summary: plan.summary,
          tasks: plan.tasks.map((task: { title: string; status: 'pending' | 'in_progress' | 'completed' }) => ({
            title: task.title,
            status: task.status,
          })),
        } : null;
      },
      async findByRequestId(owner, requestId) { const result = await reminders.where({ _openid: owner, requestId }).limit(1).get(); return result.data[0] ?? null; },
      async findByPlanAndKind(owner, planId, kind) { const result = await reminders.where({ _openid: owner, planId, kind }).limit(1).get(); return result.data[0] ?? null; },
      async save(reminder) { await reminders.doc(reminder.id).set(reminder); return reminder; },
    }, today);
    return { ok: true, reminder: { id: reminder.id, status: reminder.status } };
  } catch (error) { return { ok: false, code: error instanceof ReminderServiceError ? error.code : 'INTERNAL_ERROR' }; }
};
