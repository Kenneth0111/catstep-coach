export type ReminderKind = 'plan_start' | 'review';

export const REMINDER_TEMPLATE_IDS: Record<ReminderKind, string> = {
  plan_start: 'GAZjr0V7EFmTsnUZMnffvKG5ENUbDJS3s_Rbg-EVg5I',
  review: 'A9e0dF30rAHPVtp1yiLTQnX6LXV8h_ghE45VKjq_aHA',
};

export type SubscriptionDecision = 'accept' | 'acceptWithAudio' | 'reject' | 'ban' | 'filter';

type RequestSubscribeMessage = (options: {
  tmplIds: string[];
  success(result: Record<string, unknown>): void;
  fail(error: unknown): void;
}) => void;

export function requestReminderAuthorization(
  templateIds: string[],
  request: RequestSubscribeMessage = (options) => {
    wx.requestSubscribeMessage(options as WechatMiniprogram.RequestSubscribeMessageOption);
  },
): Promise<Record<string, SubscriptionDecision>> {
  return new Promise((resolve, reject) => {
    request({
      tmplIds: templateIds,
      success: (result) => resolve(result as Record<string, SubscriptionDecision>),
      fail: reject,
    });
  });
}

interface ReminderSubscriptionDependencies {
  requestSubscription(templateIds: string[]): Promise<Record<string, SubscriptionDecision>>;
  schedule(input: { requestId: string; planId: string; kind: ReminderKind }): Promise<void>;
  createRequestId(kind: ReminderKind): string;
}

export async function subscribeToTodayReminders(
  planId: string,
  dependencies: ReminderSubscriptionDependencies,
): Promise<{ accepted: ReminderKind[]; scheduled: ReminderKind[] }> {
  const kinds: ReminderKind[] = ['plan_start', 'review'];
  const decisions = await dependencies.requestSubscription(
    kinds.map((kind) => REMINDER_TEMPLATE_IDS[kind]),
  );
  const accepted = kinds.filter((kind) => {
    const decision = decisions[REMINDER_TEMPLATE_IDS[kind]];
    return decision === 'accept' || decision === 'acceptWithAudio';
  });
  const scheduled: ReminderKind[] = [];
  for (const kind of accepted) {
    await dependencies.schedule({
      requestId: dependencies.createRequestId(kind),
      planId,
      kind,
    });
    scheduled.push(kind);
  }
  return { accepted, scheduled };
}
