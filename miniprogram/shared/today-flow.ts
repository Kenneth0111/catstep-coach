import type { PublicErrorCode } from './goal-flow';
import {
  selectCurrentTask,
  summarizePlan,
  type PlanSummary,
  type TodayTask,
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

export interface TodayReview {
  completionSummary: string;
  encouragement: string;
  nextSuggestion: string;
  memoryCandidate: string | null;
}

export interface TodayFlowState {
  stage: 'loading' | 'empty' | 'ready' | 'error';
  plan: TodayPlan | null;
  currentTask: TodayPlanTask | null;
  nextTasks: TodayPlanTask[];
  summary: PlanSummary;
  errorCode: PublicErrorCode | null;
  taskUpdate: TodayTaskUpdate | null;
  taskUpdateErrorCode: PublicErrorCode | null;
  reviewStage: 'idle' | 'loading' | 'ready' | 'confirming' | 'confirmed' | 'error';
  review: TodayReview | null;
  growthAwarded: number | null;
}

export interface TodayTaskUpdate {
  requestId: string;
  planId: string;
  taskId: string;
  action: 'start' | 'complete';
  difficulty?: 'easy' | 'just_right' | 'hard';
}

function readyState(plan: TodayPlan): TodayFlowState {
  const currentTask = selectCurrentTask(plan.tasks) as TodayPlanTask | null;
  return {
    stage: 'ready',
    plan,
    currentTask,
    nextTasks: plan.tasks.filter(
      (task) => task.id !== currentTask?.id && task.status !== 'completed',
    ),
    summary: summarizePlan(plan.tasks),
    errorCode: null,
    taskUpdate: null,
    taskUpdateErrorCode: null,
    reviewStage: 'idle',
    review: null,
    growthAwarded: null,
  };
}

export function createTodayFlowState(): TodayFlowState {
  return {
    stage: 'loading',
    plan: null,
    currentTask: null,
    nextTasks: [],
    summary: { remainingCount: 0, remainingMinutes: 0 },
    errorCode: null,
    taskUpdate: null,
    taskUpdateErrorCode: null,
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
  plan: TodayPlan | null,
): TodayFlowState {
  if (state.stage !== 'loading') {
    throw new Error('INVALID_TRANSITION');
  }
  if (!plan) {
    return { ...createTodayFlowState(), stage: 'empty' };
  }
  return readyState(plan);
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
  if (
    state.stage !== 'ready' ||
    !state.plan ||
    state.taskUpdate !== null
  ) {
    throw new Error('INVALID_TRANSITION');
  }
  return { ...state, taskUpdate, taskUpdateErrorCode: null };
}

export function receiveTodayTaskUpdate(
  state: TodayFlowState,
  requestId: string,
  plan: TodayPlan,
): TodayFlowState {
  if (!isCurrentTodayTaskUpdate(state, requestId)) {
    return state;
  }
  return readyState(plan);
}

export function setTodayTaskUpdateError(
  state: TodayFlowState,
  errorCode: PublicErrorCode,
  requestId = state.taskUpdate?.requestId,
): TodayFlowState {
  if (!requestId || !isCurrentTodayTaskUpdate(state, requestId)) {
    return state;
  }
  return { ...state, taskUpdateErrorCode: errorCode };
}

export function isCurrentTodayTaskUpdate(
  state: TodayFlowState,
  requestId: string,
): boolean {
  return state.stage === 'ready' && state.taskUpdate?.requestId === requestId;
}

export function retryTodayTaskUpdate(state: TodayFlowState): TodayFlowState {
  if (state.stage !== 'ready' || !state.taskUpdate || !state.taskUpdateErrorCode) {
    throw new Error('INVALID_TRANSITION');
  }
  return { ...state, taskUpdateErrorCode: null };
}
