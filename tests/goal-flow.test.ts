import { describe, expect, it } from 'vitest';
import {
  GoalFlowError,
  beginGoalConfirmation,
  createGoalFlowState,
  markGoalConfirmed,
  receiveGoalStep,
  receivePlan,
  retryGoalFlow,
  selectAvailableMinutes,
  setGoalFlowError,
  startClarification,
  submitGoalAnswer,
} from '../miniprogram/shared/goal-flow';

const summary = {
  goal: '学会 TypeScript',
  successCriteria: '独立完成一个小项目',
  deadline: null,
  currentProgress: '已学完基础类型',
  suggestedStage: '完成一个命令行工具',
  excludedContent: [],
};

const plan = {
  summary: '先完成一个小步骤。',
  tasks: [
    {
      title: '完成类型练习',
      action: '完成五道类型练习',
      estimatedMinutes: 15,
      doneCriteria: '五道练习通过',
      goalId: 'goal-1',
      reason: '巩固基础',
      difficulty: 'easy' as const,
    },
  ],
};

describe('goal onboarding flow', () => {
  it('moves from a draft through a retained clarification answer', () => {
    const draft = createGoalFlowState();
    const loading = startClarification(draft, 'study', '学会 TypeScript');
    const asking = receiveGoalStep(loading, {
      kind: 'question',
      field: 'currentProgress',
      question: '你已经学到哪里了？',
    });
    const answered = submitGoalAnswer(asking, '刚学完基础类型');

    expect(loading).toMatchObject({
      stage: 'clarifying',
      busy: true,
      pendingAction: 'nextStep',
      type: 'study',
      title: '学会 TypeScript',
    });
    expect(asking.busy).toBe(false);
    expect(answered).toMatchObject({
      stage: 'clarifying',
      busy: true,
      question: null,
      answers: [
        {
          field: 'currentProgress',
          question: '你已经学到哪里了？',
          answer: '刚学完基础类型',
        },
      ],
    });
  });

  it('rejects a fourth answer and a question after three answers', () => {
    let state = startClarification(
      createGoalFlowState(),
      'work',
      '完成项目复盘',
    );
    const fields = [
      'currentProgress',
      'deadline',
      'successCriteria',
    ] as const;
    fields.forEach((field, index) => {
      state = receiveGoalStep(state, {
        kind: 'question',
        field,
        question: `问题 ${index + 1}`,
      });
      state = submitGoalAnswer(state, `回答 ${index + 1}`);
    });

    expect(() =>
      receiveGoalStep(state, {
        kind: 'question',
        field: 'deadline',
        question: '第四个问题',
      }),
    ).toThrow(new GoalFlowError('INVALID_TRANSITION'));
  });

  it('prevents duplicate submissions while a request is active', () => {
    const loading = startClarification(
      createGoalFlowState(),
      'study',
      '学习测试',
    );

    expect(() =>
      startClarification(loading, 'study', '重复提交'),
    ).toThrow(new GoalFlowError('INVALID_TRANSITION'));
  });

  it('moves from summary confirmation to a generated plan', () => {
    const loading = startClarification(
      createGoalFlowState(),
      'study',
      '学会 TypeScript',
    );
    const reviewing = receiveGoalStep(loading, { kind: 'summary', summary });
    const confirming = beginGoalConfirmation(reviewing);
    const choosing = markGoalConfirmed(confirming, 'goal-1');
    const generating = selectAvailableMinutes(choosing, 15);
    const completed = receivePlan(generating, plan, 'fallback');

    expect(reviewing).toMatchObject({ stage: 'summary', summary });
    expect(confirming).toMatchObject({
      stage: 'summary',
      busy: true,
      pendingAction: 'confirmGoal',
    });
    expect(choosing).toMatchObject({
      stage: 'choosingTime',
      goalId: 'goal-1',
    });
    expect(generating).toMatchObject({
      stage: 'generatingPlan',
      availableMinutes: 15,
      pendingAction: 'generatePlan',
    });
    expect(completed).toMatchObject({
      stage: 'plan',
      source: 'fallback',
      plan,
    });
  });

  it.each([0, 20, 45, 90])('rejects unsupported duration %s', (minutes) => {
    const reviewing = receiveGoalStep(
      startClarification(createGoalFlowState(), 'study', '学习'),
      { kind: 'summary', summary },
    );
    const choosing = markGoalConfirmed(
      beginGoalConfirmation(reviewing),
      'goal-1',
    );

    expect(() => selectAvailableMinutes(choosing, minutes)).toThrow(
      new GoalFlowError('INVALID_INPUT'),
    );
  });

  it('retains a pending action across a retryable public error', () => {
    const loading = startClarification(
      createGoalFlowState(),
      'study',
      '学习测试',
    );
    const failed = setGoalFlowError(loading, 'INTERNAL_ERROR');
    const retrying = retryGoalFlow(failed);

    expect(failed).toMatchObject({
      stage: 'error',
      busy: false,
      pendingAction: 'nextStep',
      errorCode: 'INTERNAL_ERROR',
    });
    expect(retrying).toMatchObject({
      stage: 'clarifying',
      busy: true,
      pendingAction: 'nextStep',
      errorCode: null,
    });
  });
});
