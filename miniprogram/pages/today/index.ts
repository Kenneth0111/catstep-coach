import {
  CloudApiError,
  confirmTodayReview,
  getTodayPlan,
  requestTodayReview,
  resizeTodayTask,
  scheduleReminder,
  updatePlanTask,
} from '../../shared/cloud-api';
import {
  requestReminderAuthorization,
  subscribeToTodayReminders,
} from '../../shared/reminder-subscription';
import {
  beginTodayTaskUpdate,
  beginTodayReview,
  beginTodayReviewConfirmation,
  createTodayFlowState,
  isCurrentTodayTaskUpdate,
  receiveTodayPlan,
  receiveTodayReview,
  receiveTodayReviewConfirmation,
  retryTodayReview,
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
  QUOTA_EXCEEDED: '今天的 AI 次数已用完，明天再继续吧。',
  INTERNAL_ERROR: '今天的计划没有加载成功，再试一次就好。',
} as const;

const reviewErrorMessages = {
  UNAUTHENTICATED: '请先使用已关联云环境的小程序账号。',
  INVALID_CONTEXT: '无法为这份计划生成复盘，请确认它是今天已确认的计划。',
  MISCONFIGURED: '复盘服务还没有配置好，请稍后再试。',
  QUOTA_EXCEEDED: '今天的 AI 次数已用完，明天再继续吧。',
  INTERNAL_ERROR: '复盘暂时无法生成，再试一次就好。',
} as const;

const reviewConfirmationErrorMessages = {
  UNAUTHENTICATED: '请先使用已关联云环境的小程序账号。',
  INVALID_CONTEXT: '这份复盘和今天的计划不匹配，请重新生成后再确认。',
  MISCONFIGURED: '复盘保存服务还没有配置好，请稍后再试。',
  QUOTA_EXCEEDED: '今天的 AI 次数已用完，明天再继续吧。',
  INTERNAL_ERROR: '复盘确认没有保存成功，再试一次就好。',
} as const;

Page({
  data: {
    flow: createTodayFlowState(),
    errorMessage: '',
    taskUpdateErrorMessage: '',
    reviewErrorMessage: '',
    reminderStage: 'idle' as 'idle' | 'requesting' | 'scheduled' | 'error',
    reminderMessage: '',
    confirmMemory: false,
  },

  onLoad() {
    void this.loadTodayPlan(this.data.flow);
  },

  async onRetry() {
    const flow = retryTodayFlow(this.data.flow);
    this.setData({ flow, errorMessage: '' });
    await this.loadTodayPlan(flow);
  },

  async onSubscribeReminders() {
    const planId = this.data.flow.plan?.id;
    if (!planId || this.data.reminderStage === 'requesting') return;
    this.setData({ reminderStage: 'requesting', reminderMessage: '' });
    try {
      const result = await subscribeToTodayReminders(planId, {
        requestSubscription: (templateIds) => requestReminderAuthorization(templateIds),
        schedule: async (input) => { await scheduleReminder(input); },
        createRequestId: (kind) => `${this.createRequestId()}-${kind}`,
      });
      const count = result.scheduled.length;
      this.setData({
        reminderStage: count > 0 ? 'scheduled' : 'idle',
        reminderMessage: count > 0
          ? `已开启 ${count} 条今日提醒`
          : '本次未开启提醒，你仍可正常使用计划。',
      });
    } catch {
      this.setData({
        reminderStage: 'error',
        reminderMessage: '提醒暂时没有开启成功，请稍后再试。',
      });
    }
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

  async onResizeTask(event: WechatMiniprogram.CustomEvent<{ taskId: string }>) {
    await this.resizeTask(event.detail.taskId, 'resize');
  },

  async onMoveTaskToEnd(event: WechatMiniprogram.CustomEvent<{ taskId: string }>) {
    await this.resizeTask(event.detail.taskId, 'move_to_end');
  },

  async onGenerateReview() {
    const flow = beginTodayReview(this.data.flow);
    this.setData({ flow, reviewErrorMessage: '' });
    try {
      const result = await requestTodayReview({ planId: flow.plan?.id ?? '' });
      this.setData({ flow: receiveTodayReview(this.data.flow, result.review) });
    } catch (error) {
      const code = error instanceof CloudApiError ? error.code : 'INTERNAL_ERROR';
      this.setData({
        flow: { ...this.data.flow, reviewStage: 'error' },
        reviewErrorMessage: reviewErrorMessages[code],
      });
    }
  },

  async onRetryReview() {
    this.setData({ flow: retryTodayReview(this.data.flow), reviewErrorMessage: '' });
    await this.onGenerateReview();
  },

  onMemoryChoice(event: WechatMiniprogram.CustomEvent<{ value: string[] }>) {
    this.setData({ confirmMemory: event.detail.value.includes('confirm') });
  },

  async onConfirmReview() {
    const flow = beginTodayReviewConfirmation(this.data.flow);
    this.setData({ flow, reviewErrorMessage: '' });
    try {
      const review = flow.review;
      const confirmed = await confirmTodayReview({
        requestId: this.createRequestId(),
        planId: flow.plan?.id ?? '',
        review: review!,
        confirmMemory: this.data.confirmMemory,
      });
      this.setData({ flow: receiveTodayReviewConfirmation(this.data.flow, confirmed) });
    } catch (error) {
      const code = error instanceof CloudApiError ? error.code : 'INTERNAL_ERROR';
      this.setData({
        flow: { ...this.data.flow, reviewStage: 'error' },
        reviewErrorMessage: reviewConfirmationErrorMessages[code],
      });
    }
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

  async resizeTask(taskId: string, action: 'resize' | 'move_to_end') {
    const planId = this.data.flow.plan?.id;
    if (!planId || this.data.flow.taskUpdate !== null) {
      return;
    }
    try {
      const plan = await resizeTodayTask({ requestId: this.createRequestId(), planId, taskId, action });
      this.setData({ flow: receiveTodayPlan(createTodayFlowState(), plan) });
    } catch (error) {
      const code = error instanceof CloudApiError ? error.code : 'INTERNAL_ERROR';
      this.setData({ taskUpdateErrorMessage: errorMessages[code] });
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
