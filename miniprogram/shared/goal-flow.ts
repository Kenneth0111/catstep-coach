export type GoalType = 'study' | 'work';
export type GoalField = 'currentProgress' | 'deadline' | 'successCriteria';
export type GoalFlowStage =
  | 'draft'
  | 'clarifying'
  | 'summary'
  | 'choosingTime'
  | 'generatingPlan'
  | 'plan'
  | 'error';
export type PendingAction = 'nextStep' | 'confirmGoal' | 'generatePlan';
export type PublicErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_CONTEXT'
  | 'MISCONFIGURED'
  | 'QUOTA_EXCEEDED'
  | 'INTERNAL_ERROR';

export interface GoalAnswer {
  field: GoalField;
  question: string;
  answer: string;
}

export interface GoalQuestion {
  kind: 'question';
  field: GoalField;
  question: string;
}

export interface GoalSummary {
  goal: string;
  successCriteria: string;
  deadline: string | null;
  currentProgress: string;
  suggestedStage: string;
  excludedContent: string[];
}

export type GoalStep =
  | GoalQuestion
  | { kind: 'summary'; summary: GoalSummary };

export interface PlanTask {
  clientKey?: string;
  title: string;
  action: string;
  estimatedMinutes: number;
  doneCriteria: string;
  goalId: string;
  reason: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface PlanPreview {
  summary: string;
  tasks: PlanTask[];
}

export interface GoalFlowState {
  stage: GoalFlowStage;
  busy: boolean;
  pendingAction: PendingAction | null;
  errorCode: PublicErrorCode | null;
  type: GoalType | null;
  title: string;
  answers: GoalAnswer[];
  question: GoalQuestion | null;
  summary: GoalSummary | null;
  goalId: string | null;
  availableMinutes: 15 | 30 | 60 | null;
  plan: PlanPreview | null;
  source: 'ai' | 'fallback' | 'repaired' | null;
}

export class GoalFlowError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'INVALID_TRANSITION') {
    super(code);
    this.name = 'GoalFlowError';
  }
}

function invalidTransition(): never {
  throw new GoalFlowError('INVALID_TRANSITION');
}

export function createGoalFlowState(): GoalFlowState {
  return {
    stage: 'draft',
    busy: false,
    pendingAction: null,
    errorCode: null,
    type: null,
    title: '',
    answers: [],
    question: null,
    summary: null,
    goalId: null,
    availableMinutes: null,
    plan: null,
    source: null,
  };
}

export function startClarification(
  state: GoalFlowState,
  type: GoalType,
  title: string,
): GoalFlowState {
  if (state.stage !== 'draft' || state.busy) {
    return invalidTransition();
  }
  if ((type !== 'study' && type !== 'work') || !title.trim()) {
    throw new GoalFlowError('INVALID_INPUT');
  }
  return {
    ...createGoalFlowState(),
    stage: 'clarifying',
    busy: true,
    pendingAction: 'nextStep',
    type,
    title: title.trim(),
  };
}

export function receiveGoalStep(
  state: GoalFlowState,
  step: GoalStep,
): GoalFlowState {
  if (
    state.stage !== 'clarifying' ||
    !state.busy ||
    state.pendingAction !== 'nextStep'
  ) {
    return invalidTransition();
  }

  if (step.kind === 'question') {
    if (
      state.answers.length >= 3 ||
      state.answers.some((answer) => answer.field === step.field)
    ) {
      return invalidTransition();
    }
    return {
      ...state,
      busy: false,
      pendingAction: null,
      question: step,
    };
  }

  return {
    ...state,
    stage: 'summary',
    busy: false,
    pendingAction: null,
    question: null,
    summary: step.summary,
  };
}

export function submitGoalAnswer(
  state: GoalFlowState,
  answer: string,
): GoalFlowState {
  if (
    state.stage !== 'clarifying' ||
    state.busy ||
    !state.question ||
    state.answers.length >= 3
  ) {
    return invalidTransition();
  }
  if (!answer.trim()) {
    throw new GoalFlowError('INVALID_INPUT');
  }
  return {
    ...state,
    busy: true,
    pendingAction: 'nextStep',
    answers: [
      ...state.answers,
      {
        field: state.question.field,
        question: state.question.question,
        answer: answer.trim(),
      },
    ],
    question: null,
  };
}

export function beginGoalConfirmation(state: GoalFlowState): GoalFlowState {
  if (state.stage !== 'summary' || state.busy || !state.summary) {
    return invalidTransition();
  }
  return {
    ...state,
    busy: true,
    pendingAction: 'confirmGoal',
  };
}

export function markGoalConfirmed(
  state: GoalFlowState,
  goalId: string,
): GoalFlowState {
  if (
    state.stage !== 'summary' ||
    !state.busy ||
    state.pendingAction !== 'confirmGoal'
  ) {
    return invalidTransition();
  }
  if (!goalId.trim()) {
    throw new GoalFlowError('INVALID_INPUT');
  }
  return {
    ...state,
    stage: 'choosingTime',
    busy: false,
    pendingAction: null,
    goalId,
  };
}

export function selectAvailableMinutes(
  state: GoalFlowState,
  minutes: number,
): GoalFlowState {
  if (state.stage !== 'choosingTime' || state.busy || !state.goalId) {
    return invalidTransition();
  }
  if (minutes !== 15 && minutes !== 30 && minutes !== 60) {
    throw new GoalFlowError('INVALID_INPUT');
  }
  return {
    ...state,
    stage: 'generatingPlan',
    busy: true,
    pendingAction: 'generatePlan',
    availableMinutes: minutes,
  };
}

export function receivePlan(
  state: GoalFlowState,
  plan: PlanPreview,
  source: 'ai' | 'fallback' | 'repaired',
): GoalFlowState {
  if (
    state.stage !== 'generatingPlan' ||
    !state.busy ||
    state.pendingAction !== 'generatePlan'
  ) {
    return invalidTransition();
  }
  return {
    ...state,
    stage: 'plan',
    busy: false,
    pendingAction: null,
    plan: {
      ...plan,
      tasks: plan.tasks.map((task, index) => ({
        ...task,
        clientKey: `plan-task-${index}`,
      })),
    },
    source,
  };
}

export function updatePlanTask(
  state: GoalFlowState,
  index: number,
  update: Pick<
    PlanTask,
    'title' | 'action' | 'estimatedMinutes' | 'doneCriteria'
  >,
): GoalFlowState {
  if (
    state.stage !== 'plan' ||
    state.busy ||
    !state.plan ||
    !Number.isInteger(index) ||
    !state.plan.tasks[index]
  ) {
    return invalidTransition();
  }
  if (
    !update.title.trim() ||
    !update.action.trim() ||
    !Number.isInteger(update.estimatedMinutes) ||
    update.estimatedMinutes <= 0 ||
    !update.doneCriteria.trim()
  ) {
    throw new GoalFlowError('INVALID_INPUT');
  }

  const tasks = state.plan.tasks.map((task, taskIndex) =>
    taskIndex === index
      ? {
          ...task,
          title: update.title.trim(),
          action: update.action.trim(),
          estimatedMinutes: update.estimatedMinutes,
          doneCriteria: update.doneCriteria.trim(),
        }
      : task,
  );
  const totalMinutes = tasks.reduce(
    (total, task) => total + task.estimatedMinutes,
    0,
  );
  if (!state.availableMinutes || totalMinutes > state.availableMinutes) {
    throw new GoalFlowError('INVALID_INPUT');
  }

  return { ...state, plan: { ...state.plan, tasks } };
}

export function removePlanTask(
  state: GoalFlowState,
  index: number,
): GoalFlowState {
  if (
    state.stage !== 'plan' ||
    state.busy ||
    !state.plan ||
    state.plan.tasks.length <= 1 ||
    !Number.isInteger(index) ||
    !state.plan.tasks[index]
  ) {
    return invalidTransition();
  }
  return {
    ...state,
    plan: {
      ...state.plan,
      tasks: state.plan.tasks.filter((_task, taskIndex) => taskIndex !== index),
    },
  };
}

export function restorePlanTaskInput(
  state: GoalFlowState,
  index: number,
): GoalFlowState {
  if (
    state.stage !== 'plan' ||
    state.busy ||
    !state.plan ||
    !Number.isInteger(index) ||
    !state.plan.tasks[index]
  ) {
    return invalidTransition();
  }
  return {
    ...state,
    plan: {
      ...state.plan,
      tasks: state.plan.tasks.map((task, taskIndex) =>
        taskIndex === index
          ? { ...task, clientKey: `${task.clientKey ?? index}-restored` }
          : task,
      ),
    },
  };
}

export function setGoalFlowError(
  state: GoalFlowState,
  errorCode: PublicErrorCode,
): GoalFlowState {
  if (!state.busy || !state.pendingAction) {
    return invalidTransition();
  }
  return {
    ...state,
    stage: 'error',
    busy: false,
    errorCode,
  };
}

export function retryGoalFlow(state: GoalFlowState): GoalFlowState {
  if (state.stage !== 'error' || !state.pendingAction) {
    return invalidTransition();
  }
  const stageByAction = {
    nextStep: 'clarifying',
    confirmGoal: 'summary',
    generatePlan: 'generatingPlan',
  } as const;
  return {
    ...state,
    stage: stageByAction[state.pendingAction],
    busy: true,
    errorCode: null,
  };
}
