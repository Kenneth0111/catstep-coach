import { describe, expect, it, vi } from 'vitest';
import {
  PlanConfirmationError,
  confirmDailyPlan,
  createPlanDocumentId,
  type ConfirmedDailyPlan,
  type DailyPlanRepository,
  type PersistedDailyPlan,
  type PersistedDailyPlanTask,
} from '../cloudfunctions/plan-confirm/service';

const now = () => new Date('2026-08-10T16:30:00.000Z');
const date = '2026-08-11';

function task(goalId: string, index: number) {
  return {
    title: `完成练习 ${index}`,
    action: `完成第 ${index} 个小步骤`,
    estimatedMinutes: 10,
    doneCriteria: `完成第 ${index} 个检查点`,
    goalId,
    reason: '保持学习节奏',
    difficulty: 'medium' as const,
  };
}

function confirmation(requestId: string, goalId: string, count = 1) {
  const tasks = Array.from({ length: count }, (_, index) => task(goalId, index + 1));
  return {
    requestId,
    availableMinutes: count * 10,
    plan: { summary: '先完成几个明确的小步骤。', tasks },
  };
}

function multiGoalConfirmation(requestId: string, goalIds: string[]) {
  return {
    requestId,
    availableMinutes: goalIds.length * 10,
    plan: {
      summary: '先完成几个明确的小步骤。',
      tasks: goalIds.map((goalId, index) => task(goalId, index + 1)),
    },
  };
}

function createConfirmedPlan(options?: {
  requestId?: string;
  tasks?: PersistedDailyPlanTask[];
  processedRequestIds?: string[];
}): ConfirmedDailyPlan {
  const id = createPlanDocumentId('user-1', date);
  const plan: PersistedDailyPlan = {
    _openid: 'user-1',
    owner: 'user-1',
    date,
    availableMinutes: 10,
    summary: '先完成一个明确的小步骤。',
    tasks: options?.tasks ?? [{ ...task('goal-1', 1), id: `${id}-1`, priority: 1, status: 'pending' }],
    status: 'confirmed',
    requestId: options?.requestId ?? 'request-0',
    version: 1,
    createdAt: '2026-08-10T14:00:00.000Z',
    ...(options?.processedRequestIds === undefined ? {} : { processedRequestIds: options.processedRequestIds }),
  };
  return { id, ...plan };
}

function createRepository(options?: {
  existing?: ConfirmedDailyPlan | null;
  ownedGoalIds?: string[];
}) {
  const saved: Array<{ documentId: string; plan: PersistedDailyPlan }> = [];
  let current = options?.existing ?? null;
  const repository: DailyPlanRepository = {
    findActiveGoalIds: vi.fn(async (_openid, goalIds) => options?.ownedGoalIds ?? goalIds),
    createOrAppend: vi.fn(async (documentId, incoming, merge) => {
      if (!current) {
        saved.push({ documentId, plan: incoming });
        current = { id: documentId, ...incoming };
        return current as ConfirmedDailyPlan;
      }
      const merged = merge(current);
      if (merged !== current) current = { id: documentId, ...merged };
      return current as ConfirmedDailyPlan;
    }),
  };
  return { repository, saved };
}

describe('confirmDailyPlan', () => {
  it('saves a validated first plan with processed request identity', async () => {
    const { repository, saved } = createRepository();
    const result = await confirmDailyPlan('user-1', confirmation('request-1', 'goal-1', 2), repository, now);
    const documentId = createPlanDocumentId('user-1', date);
    expect(result.id).toBe(documentId);
    expect(saved).toEqual([{
      documentId,
      plan: {
        _openid: 'user-1',
        owner: 'user-1',
        date,
        availableMinutes: 20,
        summary: '先完成几个明确的小步骤。',
        tasks: [
          { ...task('goal-1', 1), id: `${documentId}-1`, priority: 1, status: 'pending' },
          { ...task('goal-1', 2), id: `${documentId}-2`, priority: 2, status: 'pending' },
        ],
        status: 'confirmed',
        requestId: 'request-1',
        version: 1,
        createdAt: now().toISOString(),
        processedRequestIds: ['request-1'],
      },
    }]);
  });

  it('appends a second goal without changing existing task progress', async () => {
    const id = createPlanDocumentId('user-1', date);
    const existing = createConfirmedPlan({
      tasks: [
        { ...task('goal-1', 1), id: `${id}-1`, priority: 1, status: 'in_progress', startRequestId: 'start-1', startedAt: '2026-08-23T01:00:00.000Z', resizeRequestId: 'resize-1', resizedAt: '2026-08-23T01:05:00.000Z' },
        { ...task('goal-1', 2), id: `${id}-2`, priority: 2, status: 'completed', startRequestId: 'start-2', startedAt: '2026-08-23T01:10:00.000Z', completeRequestId: 'complete-2', completedAt: '2026-08-23T01:20:00.000Z', difficultyFeedback: 'just_right' },
      ],
      processedRequestIds: ['request-0'],
    });
    const { repository } = createRepository({ existing });
    const result = await confirmDailyPlan('user-1', confirmation('request-2', 'goal-2'), repository, now);
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks[0]).toMatchObject({ goalId: 'goal-1', status: 'in_progress', startRequestId: 'start-1', startedAt: '2026-08-23T01:00:00.000Z', resizeRequestId: 'resize-1', resizedAt: '2026-08-23T01:05:00.000Z' });
    expect(result.tasks[1]).toMatchObject({ goalId: 'goal-1', status: 'completed', startRequestId: 'start-2', startedAt: '2026-08-23T01:10:00.000Z', completeRequestId: 'complete-2', completedAt: '2026-08-23T01:20:00.000Z', difficultyFeedback: 'just_right' });
    expect(result.tasks[2]).toMatchObject({ goalId: 'goal-2', id: `${id}-3`, priority: 3, status: 'pending' });
    expect(result).toMatchObject({ availableMinutes: 20, processedRequestIds: ['request-0', 'request-2'] });
  });

  it('does not duplicate a replayed request', async () => {
    const existing = createConfirmedPlan({ processedRequestIds: ['request-0', 'request-2'] });
    const { repository } = createRepository({ existing });
    await expect(confirmDailyPlan('user-1', confirmation('request-2', 'goal-2'), repository, now)).resolves.toEqual(existing);
  });

  it('does not append an already present goal', async () => {
    const existing = createConfirmedPlan({ processedRequestIds: ['request-0'] });
    const { repository } = createRepository({ existing });
    const result = await confirmDailyPlan('user-1', confirmation('request-2', 'goal-1'), repository, now);
    expect(result.tasks).toHaveLength(1);
    expect(result.processedRequestIds).toEqual(['request-0']);
  });

  it('rejects a confirmation that mixes existing and new goals', async () => {
    const existing = createConfirmedPlan({ processedRequestIds: ['request-0'] });
    const { repository } = createRepository({ existing });

    await expect(confirmDailyPlan('user-1', multiGoalConfirmation('request-2', ['goal-1', 'goal-2']), repository, now)).rejects.toEqual(new PlanConfirmationError('INVALID_CONTEXT'));
  });

  it('rejects a first plan with more than three distinct goals', async () => {
    const { repository, saved } = createRepository();

    await expect(confirmDailyPlan('user-1', multiGoalConfirmation('request-1', ['goal-1', 'goal-2', 'goal-3', 'goal-4']), repository, now)).rejects.toEqual(new PlanConfirmationError('LIMIT_REACHED'));
    expect(saved).toEqual([]);
  });

  it('rejects a fourth distinct goal with LIMIT_REACHED', async () => {
    const id = createPlanDocumentId('user-1', date);
    const existing = createConfirmedPlan({
      tasks: ['goal-1', 'goal-2', 'goal-3'].map((goalId, index) => ({ ...task(goalId, 1), id: `${id}-${index + 1}`, priority: index + 1, status: 'pending' })),
      processedRequestIds: ['request-0'],
    });
    const { repository } = createRepository({ existing });
    await expect(confirmDailyPlan('user-1', confirmation('request-4', 'goal-4'), repository, now)).rejects.toEqual(new PlanConfirmationError('LIMIT_REACHED'));
  });

  it('rejects an eleventh merged task with LIMIT_REACHED', async () => {
    const id = createPlanDocumentId('user-1', date);
    const existing = createConfirmedPlan({
      tasks: Array.from({ length: 10 }, (_, index) => ({ ...task('goal-1', index + 1), id: `${id}-${index + 1}`, priority: index + 1, status: 'pending' })),
      processedRequestIds: ['request-0'],
    });
    const { repository } = createRepository({ existing });
    await expect(confirmDailyPlan('user-1', confirmation('request-2', 'goal-2'), repository, now)).rejects.toEqual(new PlanConfirmationError('LIMIT_REACHED'));
  });

  it('appends to a legacy plan without processedRequestIds', async () => {
    const existing = createConfirmedPlan();
    const { repository } = createRepository({ existing });
    const result = await confirmDailyPlan('user-1', confirmation('request-2', 'goal-2'), repository, now);
    expect(result).toMatchObject({ processedRequestIds: ['request-0', 'request-2'] });
    expect(result.tasks).toHaveLength(2);
  });

  it('rejects a foreign or inactive goal before saving', async () => {
    const { repository, saved } = createRepository({ ownedGoalIds: [] });
    await expect(confirmDailyPlan('user-1', confirmation('request-1', 'goal-1'), repository, now)).rejects.toEqual(new PlanConfirmationError('INVALID_CONTEXT'));
    expect(saved).toEqual([]);
  });

  it('does not persist unrecognized client fields', async () => {
    const { repository, saved } = createRepository();
    const input = {
      ...confirmation('request-1', 'goal-1'),
      clientEventField: 'must-not-be-stored',
      plan: {
        summary: '先完成一个明确的小步骤。',
        tasks: [{ ...task('goal-1', 1), clientOnly: 'must-not-be-stored' }],
        clientPlanField: 'must-not-be-stored',
      },
    };

    await confirmDailyPlan('user-1', input, repository, now);
    expect(saved[0]?.plan).not.toHaveProperty('clientEventField');
    expect(saved[0]?.plan).not.toHaveProperty('clientPlanField');
    expect(saved[0]?.plan.tasks[0]).not.toHaveProperty('clientOnly');
  });

  it.each([
    null,
    {},
    { ...confirmation('request-1', 'goal-1'), requestId: ' ' },
    { ...confirmation('request-1', 'goal-1'), requestId: 'x'.repeat(129) },
    { ...confirmation('request-1', 'goal-1'), availableMinutes: 0 },
    { ...confirmation('request-1', 'goal-1'), availableMinutes: 10.5 },
    { ...confirmation('request-1', 'goal-1'), plan: { ...confirmation('request-1', 'goal-1').plan, summary: '' } },
    { ...confirmation('request-1', 'goal-1'), availableMinutes: 5 },
  ])('rejects invalid confirmation input: %j', async (candidate) => {
    const { repository } = createRepository();
    await expect(confirmDailyPlan('user-1', candidate, repository, now)).rejects.toEqual(new PlanConfirmationError('INVALID_CONTEXT'));
  });

  it('derives stable plan IDs per owner and date', () => {
    expect(createPlanDocumentId('user-1', '2026-08-11')).toBe(createPlanDocumentId('user-1', '2026-08-11'));
    expect(createPlanDocumentId('user-1', '2026-08-11')).not.toBe(createPlanDocumentId('user-2', '2026-08-11'));
    expect(createPlanDocumentId('user-1', '2026-08-11')).not.toBe(createPlanDocumentId('user-1', '2026-08-12'));
  });
});
