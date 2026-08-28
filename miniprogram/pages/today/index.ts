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
  toggleTodayGoal,
  type TodayTaskUpdate,
  type TodayFlowState,
} from '../../shared/today-flow';
import { playSoundEffect } from '../../shared/sound-effects';

const errorMessages = {
  UNAUTHENTICATED: '请先使用已关联云环境的小程序账号。',
  INVALID_CONTEXT: '今日计划信息不完整，请重新确认。',
  MISCONFIGURED: '服务还没有配置好，请稍后再试。',
  LIMIT_REACHED: '今天的目标或任务已经安排满了。',
  QUOTA_EXCEEDED: '今天的 AI 次数已用完，明天再继续吧。',
  INTERNAL_ERROR: '今天的计划没有加载成功，再试一次就好。',
} as const;

const reviewErrorMessages = {
  UNAUTHENTICATED: '请先使用已关联云环境的小程序账号。',
  INVALID_CONTEXT: '无法为这份计划生成复盘，请确认它是今天已确认的计划。',
  MISCONFIGURED: '复盘服务还没有配置好，请稍后再试。',
  LIMIT_REACHED: '今天的目标或任务已经安排满了。',
  QUOTA_EXCEEDED: '今天的 AI 次数已用完，明天再继续吧。',
  INTERNAL_ERROR: '复盘暂时无法生成，再试一次就好。',
} as const;

const reviewConfirmationErrorMessages = {
  UNAUTHENTICATED: '请先使用已关联云环境的小程序账号。',
  INVALID_CONTEXT: '这份复盘和今天的计划不匹配，请重新生成后再确认。',
  MISCONFIGURED: '复盘保存服务还没有配置好，请稍后再试。',
  LIMIT_REACHED: '今天的目标或任务已经安排满了。',
  QUOTA_EXCEEDED: '今天的 AI 次数已用完，明天再继续吧。',
  INTERNAL_ERROR: '复盘确认没有保存成功，再试一次就好。',
} as const;

const weekdays = [
  '星期日',
  '星期一',
  '星期二',
  '星期三',
  '星期四',
  '星期五',
  '星期六',
] as const;

function formatTodayLabel(date = new Date()) {
  return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekdays[date.getDay()]}`;
}

Page({
  data: {
    todayLabel: formatTodayLabel(),
    flow: createTodayFlowState(),
    errorMessage: '',
    taskUpdateErrorMessage: '',
    taskUpdateErrorMessageByGoalId: {} as Record<string, string>,
    reviewErrorMessage: '',
    reminderStage: 'idle' as 'idle' | 'requesting' | 'scheduled' | 'error',
    reminderMessage: '',
    confirmMemory: false,
  },
  todayLoadRequestId: '',
  deferredTodayRefreshRequested: false,

  onShow() {
    const tabBar = this.getTabBar();
    if (tabBar) {
      tabBar.setData({ activePath: '/pages/today/index' });
    }
    if (this.hasPendingTaskUpdates(this.data.flow)) {
      this.deferredTodayRefreshRequested = true;
      return;
    }
    this.startTodayLoad(createTodayFlowState(), true);
  },

  hasPendingTaskUpdates(flow: TodayFlowState) {
    return Object.keys(flow.taskUpdatesByGoalId).some(
      (goalId) => !flow.taskUpdateErrorsByGoalId[goalId],
    );
  },

  startTodayLoad(flow: TodayFlowState, clearTaskMessages: boolean) {
    const requestId = this.createRequestId();
    this.todayLoadRequestId = requestId;
    this.setData({
      flow,
      errorMessage: '',
      taskUpdateErrorMessage: '',
      taskUpdateErrorMessageByGoalId: clearTaskMessages
        ? {}
        : this.data.taskUpdateErrorMessageByGoalId,
    });
    void this.loadTodayPlan(flow, requestId);
  },

  async onRetry() {
    playSoundEffect('action');
    const flow = retryTodayFlow(this.data.flow);
    await this.startTodayLoad(flow, true);
  },

  async onSubscribeReminders() {
    const planId = this.data.flow.plan?.id;
    if (!planId || this.data.reminderStage === 'requesting') return;
    playSoundEffect('action');
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

  onToggleGoal(event: WechatMiniprogram.TouchEvent) {
    playSoundEffect('tap');
    this.setData({
      flow: toggleTodayGoal(
        this.data.flow,
        String(event.currentTarget.dataset.goalId),
      ),
    });
  },

  onAddGoal() {
    if (
      this.data.flow.goalViews.length >= 3 ||
      (this.data.flow.plan?.tasks.length ?? 0) >= 10
    ) {
      return;
    }
    playSoundEffect('action');
    void wx.navigateTo({ url: '/pages/goal/index' });
  },

  async onGenerateReview() {
    playSoundEffect('action');
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
    playSoundEffect('action');
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
      playSoundEffect('success');
    } catch (error) {
      const code = error instanceof CloudApiError ? error.code : 'INTERNAL_ERROR';
      this.setData({
        flow: { ...this.data.flow, reviewStage: 'error' },
        reviewErrorMessage: reviewConfirmationErrorMessages[code],
      });
    }
  },

  async onRetryTaskUpdate(event?: WechatMiniprogram.TouchEvent) {
    const goalId = event?.currentTarget?.dataset?.goalId
      ? String(event.currentTarget.dataset.goalId)
      : undefined;
    const flow = retryTodayTaskUpdate(this.data.flow, goalId);
    const taskUpdate = goalId
      ? flow.taskUpdatesByGoalId[goalId]
      : flow.taskUpdate;
    this.setData({
      flow,
      taskUpdateErrorMessage: '',
      taskUpdateErrorMessageByGoalId: this.withTaskUpdateMessage(goalId, ''),
    });
    if (!taskUpdate) {
      return;
    }
    playSoundEffect('action');
    if (taskUpdate.action === 'resize' || taskUpdate.action === 'move_to_end') {
      await this.sendResizeTask(flow, taskUpdate.requestId);
    } else {
      await this.sendTaskUpdate(flow, taskUpdate.requestId);
    }
  },

  createRequestId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  },

  async submitTaskUpdate(taskUpdate: TodayTaskUpdate) {
    let flow: TodayFlowState;
    try {
      flow = beginTodayTaskUpdate(this.data.flow, taskUpdate);
    } catch {
      return;
    }
    const started = this.findTaskUpdate(flow, taskUpdate.requestId);
    this.setData({
      flow,
      taskUpdateErrorMessage: '',
      taskUpdateErrorMessageByGoalId: this.withTaskUpdateMessage(
        started?.goalId,
        '',
      ),
    });
    await this.sendTaskUpdate(flow, taskUpdate.requestId);
  },

  findTaskUpdate(flow: TodayFlowState, requestId: string) {
    return (
      Object.values(flow.taskUpdatesByGoalId).find(
        (taskUpdate) => taskUpdate.requestId === requestId,
      ) ?? null
    );
  },

  withTaskUpdateMessage(goalId: string | undefined, message: string) {
    if (!goalId) {
      return this.data.taskUpdateErrorMessageByGoalId;
    }
    return {
      ...this.data.taskUpdateErrorMessageByGoalId,
      [goalId]: message,
    };
  },

  async sendTaskUpdate(flow: TodayFlowState, requestId: string) {
    const taskUpdate = this.findTaskUpdate(flow, requestId);
    if (
      !taskUpdate ||
      (taskUpdate.action !== 'start' && taskUpdate.action !== 'complete')
    ) {
      return;
    }
    try {
      const plan = await updatePlanTask({
        requestId: taskUpdate.requestId,
        planId: taskUpdate.planId,
        taskId: taskUpdate.taskId,
        action: taskUpdate.action,
        difficulty: taskUpdate.difficulty,
      });
      const currentFlow = this.data.flow;
      if (!isCurrentTodayTaskUpdate(currentFlow, requestId)) {
        return;
      }
      const nextFlow = receiveTodayTaskUpdate(currentFlow, requestId, plan);
      this.setData({
        flow: nextFlow,
        taskUpdateErrorMessage: '',
        taskUpdateErrorMessageByGoalId: this.withTaskUpdateMessage(
          taskUpdate.goalId,
          '',
        ),
      });
      playSoundEffect('success');
      this.refreshAfterDeferredTaskUpdates(nextFlow);
    } catch (error) {
      const code =
        error instanceof CloudApiError
          ? error.code
          : ('INTERNAL_ERROR' as const);
      const currentFlow = this.data.flow;
      if (!isCurrentTodayTaskUpdate(currentFlow, requestId)) {
        return;
      }
      const failedFlow = setTodayTaskUpdateError(currentFlow, code, requestId);
      this.setData({
        flow: failedFlow,
        taskUpdateErrorMessage: errorMessages[code],
        taskUpdateErrorMessageByGoalId: this.withTaskUpdateMessage(
          taskUpdate.goalId,
          errorMessages[code],
        ),
      });
      this.refreshAfterDeferredTaskUpdates(failedFlow);
    }
  },

  async resizeTask(taskId: string, action: 'resize' | 'move_to_end') {
    const planId = this.data.flow.plan?.id;
    if (!planId) {
      return;
    }
    const requestId = this.createRequestId();
    let flow: TodayFlowState;
    try {
      flow = beginTodayTaskUpdate(this.data.flow, {
        requestId,
        planId,
        taskId,
        action,
      });
    } catch {
      return;
    }
    const taskUpdate = this.findTaskUpdate(flow, requestId);
    this.setData({
      flow,
      taskUpdateErrorMessage: '',
      taskUpdateErrorMessageByGoalId: this.withTaskUpdateMessage(
        taskUpdate?.goalId,
        '',
      ),
    });
    await this.sendResizeTask(flow, requestId);
  },

  async sendResizeTask(flow: TodayFlowState, requestId: string) {
    const taskUpdate = this.findTaskUpdate(flow, requestId);
    if (
      !taskUpdate ||
      (taskUpdate.action !== 'resize' && taskUpdate.action !== 'move_to_end')
    ) {
      return;
    }
    try {
      const plan = await resizeTodayTask({
        requestId: taskUpdate.requestId,
        planId: taskUpdate.planId,
        taskId: taskUpdate.taskId,
        action: taskUpdate.action,
      });
      const currentFlow = this.data.flow;
      if (!isCurrentTodayTaskUpdate(currentFlow, requestId)) {
        return;
      }
      const nextFlow = receiveTodayTaskUpdate(currentFlow, requestId, plan);
      this.setData({
        flow: nextFlow,
        taskUpdateErrorMessage: '',
        taskUpdateErrorMessageByGoalId: this.withTaskUpdateMessage(
          taskUpdate.goalId,
          '',
        ),
      });
      this.refreshAfterDeferredTaskUpdates(nextFlow);
    } catch (error) {
      const code = error instanceof CloudApiError ? error.code : 'INTERNAL_ERROR';
      const currentFlow = this.data.flow;
      if (!isCurrentTodayTaskUpdate(currentFlow, requestId)) {
        return;
      }
      const failedFlow = setTodayTaskUpdateError(currentFlow, code, requestId);
      this.setData({
        flow: failedFlow,
        taskUpdateErrorMessage: errorMessages[code],
        taskUpdateErrorMessageByGoalId: this.withTaskUpdateMessage(
          taskUpdate.goalId,
          errorMessages[code],
        ),
      });
      this.refreshAfterDeferredTaskUpdates(failedFlow);
    }
  },

  async loadTodayPlan(flow: TodayFlowState, requestId: string) {
    try {
      const plan = await getTodayPlan();
      if (this.todayLoadRequestId !== requestId) {
        return;
      }
      this.setData({ flow: receiveTodayPlan(flow, plan) });
    } catch (error) {
      if (this.todayLoadRequestId !== requestId) {
        return;
      }
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

  refreshAfterDeferredTaskUpdates(flow: TodayFlowState) {
    if (
      !this.deferredTodayRefreshRequested ||
      this.hasPendingTaskUpdates(flow)
    ) {
      return;
    }
    this.deferredTodayRefreshRequested = false;
    this.startTodayLoad(createTodayFlowState(), true);
  },
});
