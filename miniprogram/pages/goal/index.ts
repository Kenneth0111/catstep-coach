import {
  CloudApiError,
  confirmGoal,
  requestDailyPlan,
  requestGoalNextStep,
} from '../../shared/cloud-api';
import {
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
  type GoalFlowState,
  type GoalType,
  type PublicErrorCode,
} from '../../shared/goal-flow';

const errorMessages: Record<PublicErrorCode, string> = {
  UNAUTHENTICATED: '请先使用已关联云环境的小程序账号。',
  INVALID_CONTEXT: '这一步的信息不完整，请检查后再试。',
  MISCONFIGURED: 'AI 服务还没有配置好，请稍后再试。',
  INTERNAL_ERROR: '刚才没有走稳，再试一次就好。',
};

function createRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

Page({
  data: {
    flow: createGoalFlowState(),
    draftType: 'study' as GoalType,
    draftTitle: '',
    answerText: '',
    requestId: '',
    errorMessage: '',
  },

  onSelectType(event: WechatMiniprogram.TouchEvent) {
    const type = String(event.currentTarget.dataset.type) as GoalType;
    this.setData({ draftType: type });
  },

  onTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ draftTitle: event.detail.value });
  },

  onAnswerInput(event: WechatMiniprogram.Input) {
    this.setData({ answerText: event.detail.value });
  },

  async onStartClarification() {
    try {
      const flow = startClarification(
        this.data.flow,
        this.data.draftType,
        this.data.draftTitle,
      );
      this.setData({ flow, errorMessage: '' });
      await this.fetchNextStep(flow);
    } catch {
      wx.showToast({ title: '请先写下一个具体目标', icon: 'none' });
    }
  },

  async onSubmitAnswer() {
    try {
      const flow = submitGoalAnswer(this.data.flow, this.data.answerText);
      this.setData({ flow, answerText: '', errorMessage: '' });
      await this.fetchNextStep(flow);
    } catch {
      wx.showToast({ title: '写下一点真实情况就好', icon: 'none' });
    }
  },

  async onConfirmGoal() {
    const requestId = this.data.requestId || createRequestId();
    try {
      const flow = beginGoalConfirmation(this.data.flow);
      this.setData({ flow, requestId, errorMessage: '' });
      await this.confirmCurrentGoal(flow, requestId);
    } catch {
      wx.showToast({ title: '目标摘要还没有准备好', icon: 'none' });
    }
  },

  async onSelectMinutes(event: WechatMiniprogram.TouchEvent) {
    try {
      const minutes = Number(event.currentTarget.dataset.minutes);
      const flow = selectAvailableMinutes(this.data.flow, minutes);
      this.setData({ flow, errorMessage: '' });
      await this.generatePlan(flow);
    } catch {
      wx.showToast({ title: '请选择可用时间', icon: 'none' });
    }
  },

  async onRetry() {
    const flow = retryGoalFlow(this.data.flow);
    this.setData({ flow, errorMessage: '' });
    if (flow.pendingAction === 'nextStep') {
      await this.fetchNextStep(flow);
    } else if (flow.pendingAction === 'confirmGoal') {
      await this.confirmCurrentGoal(flow, this.data.requestId);
    } else {
      await this.generatePlan(flow);
    }
  },

  async fetchNextStep(flow: GoalFlowState) {
    try {
      const result = await requestGoalNextStep({
        type: flow.type as GoalType,
        title: flow.title,
        answers: flow.answers,
      });
      this.setData({ flow: receiveGoalStep(flow, result.step) });
    } catch (error) {
      this.showRequestError(flow, error);
    }
  },

  async confirmCurrentGoal(flow: GoalFlowState, requestId: string) {
    try {
      const goal = await confirmGoal({
        requestId,
        type: flow.type as GoalType,
        summary: flow.summary!,
      });
      this.setData({ flow: markGoalConfirmed(flow, goal.id) });
    } catch (error) {
      this.showRequestError(flow, error);
    }
  },

  async generatePlan(flow: GoalFlowState) {
    try {
      const result = await requestDailyPlan({
        availableMinutes: flow.availableMinutes as number,
        goalIds: [flow.goalId as string],
      });
      this.setData({ flow: receivePlan(flow, result.plan, result.source) });
    } catch (error) {
      this.showRequestError(flow, error);
    }
  },

  showRequestError(flow: GoalFlowState, error: unknown) {
    const code =
      error instanceof CloudApiError ? error.code : ('INTERNAL_ERROR' as const);
    this.setData({
      flow: setGoalFlowError(flow, code),
      errorMessage: errorMessages[code],
    });
  },
});
