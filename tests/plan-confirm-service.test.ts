import { describe, expect, it, vi } from 'vitest';
import {
  PlanConfirmationError,
  confirmDailyPlan,
  createPlanDocumentId,
  type ConfirmedDailyPlan,
  type DailyPlanRepository,
  type PersistedDailyPlan,
} from '../cloudfunctions/plan-confirm/service';

const validPlan = {
  summary: '先完成两个明确的小步骤。',
  tasks: [
    {
      title: '完成类型练习',
      action: '完成五道 TypeScript 类型练习',
      estimatedMinutes: 20,
      doneCriteria: '五道练习全部通过',
      goalId: 'goal-1',
      reason: '巩固基础类型',
      difficulty: 'medium' as const,
    },
    {
      title: '记录薄弱点',
      action: '写下两条仍不熟悉的类型规则',
      estimatedMinutes: 10,
      doneCriteria: '记录两条具体规则',
      goalId: 'goal-1',
      reason: '为下一次练习保留线索',
      difficulty: 'easy' as const,
    },
  ],
};

const input = {
  requestId: 'request-1',
  availableMinutes: 30,
  plan: validPlan,
};

function createRepository(options?: {
  existing?: ConfirmedDailyPlan | null;
  ownedGoalIds?: string[];
}) {
  const saved: Array<{ documentId: string; plan: PersistedDailyPlan }> = [];
  const repository: DailyPlanRepository = {
    findActiveGoalIds: vi.fn(async () => options?.ownedGoalIds ?? ['goal-1']),
    saveIfAbsent: vi.fn(async (documentId, plan) => {
      if (options?.existing) {
        return options.existing;
      }
      saved.push({ documentId, plan });
      return { id: documentId, ...plan };
    }),
  };
  return { repository, saved };
}

describe('confirmDailyPlan', () => {
  it('saves a validated plan with trusted daily and task fields', async () => {
    const { repository, saved } = createRepository();
    const now = new Date('2026-08-10T16:30:00.000Z');

    const result = await confirmDailyPlan(
      'user-1',
      input,
      repository,
      () => now,
    );

    const documentId = createPlanDocumentId('user-1', '2026-08-11');
    expect(result.id).toBe(documentId);
    expect(repository.findActiveGoalIds).toHaveBeenCalledWith(
      'user-1',
      ['goal-1'],
    );
    expect(saved).toEqual([
      {
        documentId,
        plan: {
          _openid: 'user-1',
          owner: 'user-1',
          date: '2026-08-11',
          availableMinutes: 30,
          summary: validPlan.summary,
          tasks: [
            {
              ...validPlan.tasks[0],
              id: `${documentId}-1`,
              priority: 1,
              status: 'pending',
            },
            {
              ...validPlan.tasks[1],
              id: `${documentId}-2`,
              priority: 2,
              status: 'pending',
            },
          ],
          status: 'confirmed',
          requestId: 'request-1',
          version: 1,
          createdAt: now.toISOString(),
        },
      },
    ]);
  });

  it('verifies ownership before returning the atomically stored daily plan', async () => {
    const existing = {
      id: 'plan-existing',
      _openid: 'user-1',
      owner: 'user-1',
      date: '2026-08-11',
      availableMinutes: 30,
      summary: validPlan.summary,
      tasks: [],
      status: 'confirmed',
      requestId: 'earlier-request',
      version: 1,
      createdAt: '2026-08-10T14:00:00.000Z',
    } satisfies ConfirmedDailyPlan;
    const { repository, saved } = createRepository({ existing });

    await expect(
      confirmDailyPlan(
        'user-1',
        input,
        repository,
        () => new Date('2026-08-10T16:30:00.000Z'),
      ),
    ).resolves.toEqual(existing);
    expect(repository.findActiveGoalIds).toHaveBeenCalledWith(
      'user-1',
      ['goal-1'],
    );
    expect(repository.saveIfAbsent).toHaveBeenCalledTimes(1);
    expect(saved).toEqual([]);
  });

  it('does not persist unrecognized client task fields', async () => {
    const { repository, saved } = createRepository();
    const taskWithExtraField = {
      ...validPlan.tasks[0],
      clientOnly: 'must-not-be-stored',
    };

    await confirmDailyPlan(
      'user-1',
      {
        ...input,
        clientEventField: 'must-not-be-stored',
        availableMinutes: 20,
        plan: {
          summary: validPlan.summary,
          tasks: [taskWithExtraField],
          clientPlanField: 'must-not-be-stored',
        },
      },
      repository,
      () => new Date('2026-08-10T16:30:00.000Z'),
    );

    expect(saved[0]?.plan.tasks[0]).not.toHaveProperty('clientOnly');
  });

  it('rejects a foreign or inactive goal before saving', async () => {
    const { repository, saved } = createRepository({ ownedGoalIds: [] });

    await expect(
      confirmDailyPlan('user-1', input, repository, () => new Date()),
    ).rejects.toEqual(new PlanConfirmationError('INVALID_CONTEXT'));
    expect(saved).toEqual([]);
  });

  it.each([
    null,
    {},
    { ...input, requestId: ' ' },
    { ...input, requestId: 'x'.repeat(129) },
    { ...input, availableMinutes: 0 },
    { ...input, availableMinutes: 30.5 },
    { ...input, plan: { ...validPlan, summary: '' } },
    {
      ...input,
      availableMinutes: 20,
      plan: validPlan,
    },
  ])('rejects invalid confirmation input: %j', async (candidate) => {
    const { repository } = createRepository();

    await expect(
      confirmDailyPlan('user-1', candidate, repository, () => new Date()),
    ).rejects.toEqual(new PlanConfirmationError('INVALID_CONTEXT'));
  });

  it('derives stable plan IDs per owner and date', () => {
    expect(createPlanDocumentId('user-1', '2026-08-11')).toBe(
      createPlanDocumentId('user-1', '2026-08-11'),
    );
    expect(createPlanDocumentId('user-1', '2026-08-11')).not.toBe(
      createPlanDocumentId('user-2', '2026-08-11'),
    );
    expect(createPlanDocumentId('user-1', '2026-08-11')).not.toBe(
      createPlanDocumentId('user-1', '2026-08-12'),
    );
  });
});
