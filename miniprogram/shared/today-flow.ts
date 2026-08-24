import type { PublicErrorCode } from './goal-flow';
import {
  createGoalViews,
  selectCurrentTask,
  summarizePlan,
  type PlanSummary,
  type TodayTask,
  type TodayGoalView,
} from './today-plan';

export interface TodayPlanTask extends TodayTask {
  action: string;
  doneCriteria: string;
  goalId: string;
  reason: string;
  difficulty: 'easy' | 'medium' | 'hard';
  difficultyFeedback?: 'easy' | 'just_right' | 'hard';
}

export interface TodayPlan {
  id: string;
  date: string;
  availableMinutes: number;
  summary: string;
  tasks: TodayPlanTask[];
}

export interface TodayGoalGroup {
  goalId: string;
  goalTitle: string;
  tasks: TodayPlanTask[];
}

export interface TodayDashboardPlan extends TodayPlan {
  groups: TodayGoalGroup[];
}

export interface TodayReview {
  completionSummary: string;
  encouragement: string;
  nextSuggestion: string;
  memoryCandidate: string | null;
}

export interface TodayFlowState {
  stage: 'loading' | 'empty' | 'ready' | 'error';
  plan: TodayDashboardPlan | null;
  goalViews: TodayGoalView<TodayPlanTask>[];
  expandedGoalId: string | null;
  currentTask: TodayPlanTask | null;
  nextTasks: TodayPlanTask[];
  completedTasks: TodayPlanTask[];
  summary: PlanSummary;
  errorCode: PublicErrorCode | null;
  taskUpdate: TodayTaskUpdate | null;
  taskUpdateErrorCode: PublicErrorCode | null;
  taskUpdatesByGoalId: Record<string, TodayTaskUpdate>;
  taskUpdateErrorsByGoalId: Record<string, PublicErrorCode>;
  reviewStage: 'idle' | 'loading' | 'ready' | 'confirming' | 'confirmed' | 'error';
  review: TodayReview | null;
  growthAwarded: number | null;
}

export interface TodayTaskUpdate {
  requestId: string;
  planId: string;
  taskId: string;
  goalId?: string;
  action: 'start' | 'complete' | 'resize' | 'move_to_end';
  difficulty?: 'easy' | 'just_right' | 'hard';
}

type PreferredExpansion = string | null | undefined;

function toDashboardPlan(plan: TodayPlan | TodayDashboardPlan): TodayDashboardPlan {
  if ('groups' in plan && Array.isArray(plan.groups)) {
    return plan;
  }

  const goalIds: string[] = [];
  for (const task of plan.tasks) {
    if (!goalIds.includes(task.goalId)) {
      goalIds.push(task.goalId);
    }
  }

  return {
    ...plan,
    groups: goalIds.map((goalId) => ({
      goalId,
      goalTitle: '今日目标',
      tasks: plan.tasks.filter((task) => task.goalId === goalId),
    })),
  };
}

function selectDefaultExpandedGoalId(
  goalViews: readonly TodayGoalView<TodayPlanTask>[],
): string | null {
  return (
    goalViews.find((view) => view.currentTask)?.goalId ??
    goalViews.find((view) => view.status !== 'completed')?.goalId ??
    goalViews[0]?.goalId ??
    null
  );
}

function readyState(
  plan: TodayPlan | TodayDashboardPlan,
  preferredExpandedGoalId?: PreferredExpansion,
): TodayFlowState {
  const dashboardPlan = toDashboardPlan(plan);
  const goalViews = createGoalViews(dashboardPlan.groups);
  const expandedGoalId =
    preferredExpandedGoalId === null
      ? null
      : preferredExpandedGoalId &&
        goalViews.some((view) => view.goalId === preferredExpandedGoalId)
      ? preferredExpandedGoalId
      : selectDefaultExpandedGoalId(goalViews);
  const currentTask = selectCurrentTask(plan.tasks) as TodayPlanTask | null;
  return {
    stage: 'ready',
    plan: dashboardPlan,
    goalViews,
    expandedGoalId,
    currentTask,
    nextTasks: plan.tasks.filter(
      (task) => task.id !== currentTask?.id && task.status !== 'completed',
    ),
    completedTasks: plan.tasks.filter((task) => task.status === 'completed'),
    summary: summarizePlan(plan.tasks),
    errorCode: null,
    taskUpdate: null,
    taskUpdateErrorCode: null,
    taskUpdatesByGoalId: {},
    taskUpdateErrorsByGoalId: {},
    reviewStage: 'idle',
    review: null,
    growthAwarded: null,
  };
}

export function createTodayFlowState(): TodayFlowState {
  return {
    stage: 'loading',
    plan: null,
    goalViews: [],
    expandedGoalId: null,
    currentTask: null,
    nextTasks: [],
    completedTasks: [],
    summary: { completedCount: 0, totalCount: 0, remainingCount: 0, remainingMinutes: 0 },
    errorCode: null,
    taskUpdate: null,
    taskUpdateErrorCode: null,
    taskUpdatesByGoalId: {},
    taskUpdateErrorsByGoalId: {},
    reviewStage: 'idle',
    review: null,
    growthAwarded: null,
  };
}

export function beginTodayReview(state: TodayFlowState): TodayFlowState {
  if (state.stage !== 'ready' || !state.plan || state.reviewStage !== 'idle') {
    throw new Error('INVALID_TRANSITION');
  }
  return { ...state, reviewStage: 'loading' };
}

export function receiveTodayReview(
  state: TodayFlowState,
  review: TodayReview,
): TodayFlowState {
  if (state.reviewStage !== 'loading') {
    throw new Error('INVALID_TRANSITION');
  }
  return { ...state, reviewStage: 'ready', review };
}

export function beginTodayReviewConfirmation(
  state: TodayFlowState,
): TodayFlowState {
  if (state.reviewStage !== 'ready' || !state.review) {
    throw new Error('INVALID_TRANSITION');
  }
  return { ...state, reviewStage: 'confirming' };
}

export function receiveTodayReviewConfirmation(
  state: TodayFlowState,
  review: { id: string; growthAwarded: number },
): TodayFlowState {
  if (state.reviewStage !== 'confirming') {
    throw new Error('INVALID_TRANSITION');
  }
  return { ...state, reviewStage: 'confirmed', growthAwarded: review.growthAwarded };
}

export function retryTodayReview(state: TodayFlowState): TodayFlowState {
  if (state.reviewStage !== 'error') {
    throw new Error('INVALID_TRANSITION');
  }
  return { ...state, reviewStage: 'idle' };
}

export function receiveTodayPlan(
  state: TodayFlowState,
  plan: TodayPlan | TodayDashboardPlan | null,
): TodayFlowState {
  if (state.stage !== 'loading') {
    throw new Error('INVALID_TRANSITION');
  }
  if (!plan) {
    return { ...createTodayFlowState(), stage: 'empty' };
  }
  return readyState(plan);
}

export function toggleTodayGoal(
  state: TodayFlowState,
  goalId: string,
): TodayFlowState {
  if (state.stage !== 'ready') {
    throw new Error('INVALID_TRANSITION');
  }
  if (!state.goalViews.some((view) => view.goalId === goalId)) {
    return state;
  }
  return {
    ...state,
    expandedGoalId: state.expandedGoalId === goalId ? null : goalId,
  };
}

export function mergeTodayDashboardPlan(
  current: TodayDashboardPlan,
  updated: TodayPlan,
): TodayDashboardPlan {
  const titleByGoalId = new Map(
    current.groups.map((group) => [group.goalId, group.goalTitle]),
  );
  const orderedGoalIds = current.groups
    .map((group) => group.goalId)
    .filter((goalId) => updated.tasks.some((task) => task.goalId === goalId));

  for (const task of updated.tasks) {
    if (!orderedGoalIds.includes(task.goalId)) {
      orderedGoalIds.push(task.goalId);
    }
  }

  return {
    ...updated,
    groups: orderedGoalIds.map((goalId) => ({
      goalId,
      goalTitle: titleByGoalId.get(goalId) ?? '今日目标',
      tasks: updated.tasks.filter((task) => task.goalId === goalId),
    })),
  };
}

function mergeTodayDashboardPlanGoal(
  current: TodayDashboardPlan,
  updated: TodayPlan,
  goalId: string,
): TodayDashboardPlan {
  const titleByGoalId = new Map(
    current.groups.map((group) => [group.goalId, group.goalTitle]),
  );
  const updatedTasks = updated.tasks.filter((task) => task.goalId === goalId);
  if (updatedTasks.length === 0) {
    return current;
  }

  const groups = current.groups.map((group) =>
    group.goalId === goalId
      ? { ...group, tasks: updatedTasks }
      : group,
  );
  if (!groups.some((group) => group.goalId === goalId)) {
    groups.push({
      goalId,
      goalTitle: titleByGoalId.get(goalId) ?? '今日目标',
      tasks: updatedTasks,
    });
  }

  return {
    ...current,
    ...updated,
    tasks: groups.flatMap((group) => group.tasks),
    groups,
  };
}

function findTaskGoalId(
  state: TodayFlowState,
  taskId: string,
): string | null {
  return state.plan?.tasks.find((task) => task.id === taskId)?.goalId ?? null;
}

function firstTaskUpdate(
  updatesByGoalId: Record<string, TodayTaskUpdate>,
): TodayTaskUpdate | null {
  return Object.values(updatesByGoalId)[0] ?? null;
}

function firstTaskUpdateError(
  errorsByGoalId: Record<string, PublicErrorCode>,
): PublicErrorCode | null {
  return Object.values(errorsByGoalId)[0] ?? null;
}

function findTaskUpdateByRequestId(
  updatesByGoalId: Record<string, TodayTaskUpdate>,
  requestId: string,
): TodayTaskUpdate | null {
  return (
    Object.values(updatesByGoalId).find(
      (update) => update.requestId === requestId,
    ) ?? null
  );
}

export function setTodayFlowError(
  state: TodayFlowState,
  errorCode: PublicErrorCode,
): TodayFlowState {
  if (state.stage !== 'loading') {
    throw new Error('INVALID_TRANSITION');
  }
  return { ...state, stage: 'error', errorCode };
}

export function retryTodayFlow(state: TodayFlowState): TodayFlowState {
  if (state.stage !== 'error') {
    throw new Error('INVALID_TRANSITION');
  }
  return createTodayFlowState();
}

export function beginTodayTaskUpdate(
  state: TodayFlowState,
  taskUpdate: TodayTaskUpdate,
): TodayFlowState {
  const goalId = taskUpdate.goalId ?? findTaskGoalId(state, taskUpdate.taskId);
  if (
    state.stage !== 'ready' ||
    !state.plan ||
    !goalId ||
    state.taskUpdatesByGoalId[goalId]
  ) {
    throw new Error('INVALID_TRANSITION');
  }
  const update = { ...taskUpdate, goalId };
  const taskUpdatesByGoalId = {
    ...state.taskUpdatesByGoalId,
    [goalId]: update,
  };
  const { [goalId]: _clearedError, ...taskUpdateErrorsByGoalId } =
    state.taskUpdateErrorsByGoalId;

  return {
    ...state,
    taskUpdate: firstTaskUpdate(taskUpdatesByGoalId),
    taskUpdateErrorCode: firstTaskUpdateError(taskUpdateErrorsByGoalId),
    taskUpdatesByGoalId,
    taskUpdateErrorsByGoalId,
  };
}

export function receiveTodayTaskUpdate(
  state: TodayFlowState,
  requestId: string,
  plan: TodayPlan,
): TodayFlowState {
  const taskUpdate = findTaskUpdateByRequestId(
    state.taskUpdatesByGoalId,
    requestId,
  );
  if (state.stage !== 'ready' || !state.plan || !taskUpdate?.goalId) {
    return state;
  }
  const { [taskUpdate.goalId]: _finished, ...taskUpdatesByGoalId } =
    state.taskUpdatesByGoalId;
  const { [taskUpdate.goalId]: _clearedError, ...taskUpdateErrorsByGoalId } =
    state.taskUpdateErrorsByGoalId;
  const next = readyState(
    mergeTodayDashboardPlanGoal(state.plan, plan, taskUpdate.goalId),
    state.expandedGoalId,
  );
  return {
    ...next,
    taskUpdatesByGoalId,
    taskUpdateErrorsByGoalId,
    taskUpdate: firstTaskUpdate(taskUpdatesByGoalId),
    taskUpdateErrorCode: firstTaskUpdateError(taskUpdateErrorsByGoalId),
  };
}

export function setTodayTaskUpdateError(
  state: TodayFlowState,
  errorCode: PublicErrorCode,
  requestId = state.taskUpdate?.requestId,
): TodayFlowState {
  if (!requestId) {
    return state;
  }
  const taskUpdate = findTaskUpdateByRequestId(
    state.taskUpdatesByGoalId,
    requestId,
  );
  if (state.stage !== 'ready' || !taskUpdate?.goalId) {
    return state;
  }
  const taskUpdateErrorsByGoalId = {
    ...state.taskUpdateErrorsByGoalId,
    [taskUpdate.goalId]: errorCode,
  };
  return {
    ...state,
    taskUpdateErrorCode: firstTaskUpdateError(taskUpdateErrorsByGoalId),
    taskUpdateErrorsByGoalId,
  };
}

export function isCurrentTodayTaskUpdate(
  state: TodayFlowState,
  requestId: string,
): boolean {
  return (
    state.stage === 'ready' &&
    findTaskUpdateByRequestId(state.taskUpdatesByGoalId, requestId) !== null
  );
}

export function retryTodayTaskUpdate(
  state: TodayFlowState,
  goalId = Object.keys(state.taskUpdateErrorsByGoalId)[0],
): TodayFlowState {
  if (
    state.stage !== 'ready' ||
    !goalId ||
    !state.taskUpdatesByGoalId[goalId] ||
    !state.taskUpdateErrorsByGoalId[goalId]
  ) {
    throw new Error('INVALID_TRANSITION');
  }
  const { [goalId]: _clearedError, ...taskUpdateErrorsByGoalId } =
    state.taskUpdateErrorsByGoalId;
  return {
    ...state,
    taskUpdateErrorCode: firstTaskUpdateError(taskUpdateErrorsByGoalId),
    taskUpdateErrorsByGoalId,
  };
}
