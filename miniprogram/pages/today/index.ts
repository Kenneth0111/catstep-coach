import {
  CloudApiError,
  getTodayPlan,
  updatePlanTask,
} from '../../shared/cloud-api';
import {
  beginTodayTaskUpdate,
  createTodayFlowState,
  isCurrentTodayTaskUpdate,
  receiveTodayPlan,
  receiveTodayTaskUpdate,
  retryTodayTaskUpdate,
  retryTodayFlow,
  setTodayFlowError,
  setTodayTaskUpdateError,
  type TodayTaskUpdate,
  type TodayFlowState,
} from '../../shared/today-flow';

const errorMessages = {
  UNAUTHENTICATED: '请先使用已关联云环境的小程序账号。',
  INVALID_CONTEXT: '今日计划信息不完整，请重新确认。',
  MISCONFIGURED: '服务还没有配置好，请稍后再试。',
  INTERNAL_ERROR: '今天的计划没有加载成功，再试一次就好。',
} as const;

Page({
  data: {
    flow: createTodayFlowState(),
    errorMessage: '',
    taskUpdateErrorMessage: '',
  },

  onLoad() {
    void this.loadTodayPlan(this.data.flow);
  },

  async onRetry() {
    const flow = retryTodayFlow(this.data.flow);
    this.setData({ flow, errorMessage: '' });
    await this.loadTodayPlan(flow);
  },

  async onStartTask(event: WechatMiniprogram.CustomEvent<{ taskId: string }>) {
    await this.submitTaskUpdate({
      requestId: this.createRequestId(),
      planId: this.data.flow.plan?.id ?? '',
      taskId: event.detail.taskId,
      action: 'start',
    });
  },

  async onCompleteTask(
    event: WechatMiniprogram.CustomEvent<{
      taskId: string;
      difficulty: 'easy' | 'just_right' | 'hard';
    }>,
  ) {
    await this.submitTaskUpdate({
      requestId: this.createRequestId(),
      planId: this.data.flow.plan?.id ?? '',
      taskId: event.detail.taskId,
      action: 'complete',
      difficulty: event.detail.difficulty,
    });
  },

  async onRetryTaskUpdate() {
    const flow = retryTodayTaskUpdate(this.data.flow);
    this.setData({ flow, taskUpdateErrorMessage: '' });
    await this.sendTaskUpdate(flow);
  },

  createRequestId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  },

  async submitTaskUpdate(taskUpdate: TodayTaskUpdate) {
    if (this.data.flow.taskUpdate !== null) {
      return;
    }
    const flow = beginTodayTaskUpdate(this.data.flow, taskUpdate);
    this.setData({ flow, taskUpdateErrorMessage: '' });
    await this.sendTaskUpdate(flow);
  },

  async sendTaskUpdate(flow: TodayFlowState) {
    if (!flow.taskUpdate) {
      return;
    }
    const requestId = flow.taskUpdate.requestId;
    try {
      const plan = await updatePlanTask(flow.taskUpdate);
      const currentFlow = this.data.flow;
      if (!isCurrentTodayTaskUpdate(currentFlow, requestId)) {
        return;
      }
      this.setData({
        flow: receiveTodayTaskUpdate(currentFlow, requestId, plan),
        taskUpdateErrorMessage: '',
      });
    } catch (error) {
      const code =
        error instanceof CloudApiError
          ? error.code
          : ('INTERNAL_ERROR' as const);
      const currentFlow = this.data.flow;
      if (!isCurrentTodayTaskUpdate(currentFlow, requestId)) {
        return;
      }
      this.setData({
        flow: setTodayTaskUpdateError(currentFlow, code, requestId),
        taskUpdateErrorMessage: errorMessages[code],
      });
    }
  },

  async loadTodayPlan(flow: TodayFlowState) {
    try {
      const plan = await getTodayPlan();
      this.setData({ flow: receiveTodayPlan(flow, plan) });
    } catch (error) {
      const code =
        error instanceof CloudApiError
          ? error.code
          : ('INTERNAL_ERROR' as const);
      this.setData({
        flow: setTodayFlowError(flow, code),
        errorMessage: errorMessages[code],
      });
    }
  },
});
