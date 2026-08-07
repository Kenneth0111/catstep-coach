import { describe, expect, it } from 'vitest';
import {
  GoalConfirmationError,
  confirmGoal,
  type ConfirmedGoal,
  type GoalRepository,
  type PersistedGoal,
} from '../cloudfunctions/goal-confirm/service';

const validSummary = {
  goal: '学会 TypeScript',
  successCriteria: '独立完成一个小项目',
  deadline: '2026-09-01',
  currentProgress: '已学完基础类型',
  suggestedStage: '完成第一个命令行工具',
  excludedContent: ['暂不学习装饰器'],
};

function createRepository(existing: ConfirmedGoal | null = null) {
  const saved: PersistedGoal[] = [];
  const repository: GoalRepository = {
    async findByRequestId(openid, requestId) {
      return existing?.owner === openid && existing.requestId === requestId
        ? existing
        : null;
    },
    async save(goal) {
      saved.push(goal);
      return { id: 'goal-1', ...goal };
    },
  };
  return { repository, saved };
}

describe('confirmGoal', () => {
  it('saves trusted ownership and server fields for a new request', async () => {
    const { repository, saved } = createRepository();

    const goal = await confirmGoal(
      'user-1',
      { requestId: 'request-1', type: 'study', summary: validSummary },
      repository,
      () => new Date('2026-08-07T08:00:00.000Z'),
    );

    expect(goal.id).toBe('goal-1');
    expect(saved).toEqual([
      {
        _openid: 'user-1',
        owner: 'user-1',
        type: 'study',
        title: '学会 TypeScript',
        successCriteria: '独立完成一个小项目',
        deadline: '2026-09-01',
        currentProgress: '已学完基础类型',
        stage: '完成第一个命令行工具',
        excludedContent: ['暂不学习装饰器'],
        status: 'active',
        requestId: 'request-1',
        createdAt: '2026-08-07T08:00:00.000Z',
      },
    ]);
  });

  it('returns an existing goal for the same openid and requestId', async () => {
    const existing: ConfirmedGoal = {
      id: 'goal-existing',
      _openid: 'user-1',
      owner: 'user-1',
      type: 'study',
      title: validSummary.goal,
      successCriteria: validSummary.successCriteria,
      deadline: validSummary.deadline,
      currentProgress: validSummary.currentProgress,
      stage: validSummary.suggestedStage,
      excludedContent: validSummary.excludedContent,
      status: 'active',
      requestId: 'request-1',
      createdAt: '2026-08-07T08:00:00.000Z',
    };
    const { repository, saved } = createRepository(existing);

    await expect(
      confirmGoal(
        'user-1',
        { requestId: 'request-1', type: 'study', summary: validSummary },
        repository,
        () => new Date(),
      ),
    ).resolves.toEqual(existing);
    expect(saved).toEqual([]);
  });

  it('does not deduplicate the same requestId across different openids', async () => {
    const existing: ConfirmedGoal = {
      id: 'other-goal',
      _openid: 'user-2',
      owner: 'user-2',
      type: 'study',
      title: validSummary.goal,
      successCriteria: validSummary.successCriteria,
      deadline: validSummary.deadline,
      currentProgress: validSummary.currentProgress,
      stage: validSummary.suggestedStage,
      excludedContent: [],
      status: 'active',
      requestId: 'shared-request',
      createdAt: '2026-08-07T08:00:00.000Z',
    };
    const { repository, saved } = createRepository(existing);

    await confirmGoal(
      'user-1',
      { requestId: 'shared-request', type: 'work', summary: validSummary },
      repository,
      () => new Date('2026-08-07T09:00:00.000Z'),
    );

    expect(saved).toHaveLength(1);
    expect(saved[0]?.owner).toBe('user-1');
  });

  it.each([
    null,
    {},
    { requestId: ' ', type: 'study', summary: validSummary },
    { requestId: 'request', type: 'personal', summary: validSummary },
    {
      requestId: 'request',
      type: 'study',
      summary: { ...validSummary, successCriteria: '' },
    },
    {
      requestId: 'request',
      type: 'study',
      summary: { ...validSummary, excludedContent: new Array(1) },
    },
  ])('rejects invalid confirmation input: %j', async (input) => {
    const { repository } = createRepository();

    await expect(
      confirmGoal('user-1', input, repository, () => new Date()),
    ).rejects.toEqual(new GoalConfirmationError('INVALID_CONTEXT'));
  });
});
