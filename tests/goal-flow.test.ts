import { describe, expect, it } from 'vitest';
import {
  GoalFlowError,
  beginGoalConfirmation,
  createGoalFlowState,
  removePlanTask,
  markGoalConfirmed,
  receiveGoalStep,
  receivePlan,
  restorePlanTaskInput,
  retryGoalFlow,
  selectAvailableMinutes,
  setGoalFlowError,
  startClarification,
  submitGoalAnswer,
  updatePlanTask,
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

  it('edits a generated plan task within the selected time budget', () => {
    const completed = receivePlan(
      selectAvailableMinutes(
        markGoalConfirmed(
          beginGoalConfirmation(
            receiveGoalStep(
              startClarification(createGoalFlowState(), 'study', '学习'),
              { kind: 'summary', summary },
            ),
          ),
          'goal-1',
        ),
        30,
      ),
      plan,
      'ai',
    );

    const edited = updatePlanTask(completed, 0, {
      title: '完成三道重点练习',
      action: '只完成最薄弱的三道题',
      estimatedMinutes: 20,
      doneCriteria: '三道题全部通过',
    });

    expect(edited.plan?.tasks[0]).toMatchObject({
      title: '完成三道重点练习',
      estimatedMinutes: 20,
      goalId: 'goal-1',
      reason: '巩固基础',
    });
  });

  it('rejects edits that exceed the selected time budget', () => {
    const completed = receivePlan(
      selectAvailableMinutes(
        markGoalConfirmed(
          beginGoalConfirmation(
            receiveGoalStep(
              startClarification(createGoalFlowState(), 'study', '学习'),
              { kind: 'summary', summary },
            ),
          ),
          'goal-1',
        ),
        15,
      ),
      plan,
      'ai',
    );

    expect(() =>
      updatePlanTask(completed, 0, {
        title: '超时任务',
        action: '执行很久',
        estimatedMinutes: 20,
        doneCriteria: '完成',
      }),
    ).toThrow(new GoalFlowError('INVALID_INPUT'));
  });

  it('restores the persisted task value with a fresh stable render key after an invalid edit', () => {
    const completed = receivePlan(
      selectAvailableMinutes(
        markGoalConfirmed(
          beginGoalConfirmation(
            receiveGoalStep(
              startClarification(createGoalFlowState(), 'study', '学习'),
              { kind: 'summary', summary },
            ),
          ),
          'goal-1',
        ),
        30,
      ),
      plan,
      'ai',
    );

    const originalTask = completed.plan?.tasks[0];
    const restored = restorePlanTaskInput(completed, 0);

    expect(restored.plan?.tasks[0]).toMatchObject({
      title: originalTask?.title,
      action: originalTask?.action,
      estimatedMinutes: originalTask?.estimatedMinutes,
      doneCriteria: originalTask?.doneCriteria,
    });
    expect(restored.plan?.tasks[0].clientKey).not.toBe(originalTask?.clientKey);
  });

  it('removes a plan task but keeps at least one task', () => {
    const twoTaskPlan = {
      ...plan,
      tasks: [
        ...plan.tasks,
        { ...plan.tasks[0], title: '第二项', action: '完成第二项' },
      ],
    };
    const completed = receivePlan(
      selectAvailableMinutes(
        markGoalConfirmed(
          beginGoalConfirmation(
            receiveGoalStep(
              startClarification(createGoalFlowState(), 'study', '学习'),
              { kind: 'summary', summary },
            ),
          ),
          'goal-1',
        ),
        30,
      ),
      twoTaskPlan,
      'ai',
    );

    expect(completed.plan?.tasks.map((task) => task.clientKey)).toEqual([
      'plan-task-0',
      'plan-task-1',
    ]);
    expect(removePlanTask(completed, 1).plan?.tasks).toHaveLength(1);
    expect(() => removePlanTask(removePlanTask(completed, 1), 0)).toThrow(
      new GoalFlowError('INVALID_TRANSITION'),
    );
  });
});
