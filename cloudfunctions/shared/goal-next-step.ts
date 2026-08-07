import type { AIProvider } from './ai-provider';

export type GoalType = 'study' | 'work';
export type GoalClarificationField =
  | 'currentProgress'
  | 'deadline'
  | 'successCriteria';

export interface GoalAnswer {
  field: GoalClarificationField;
  question: string;
  answer: string;
}

export interface GoalClarificationInput {
  type: GoalType;
  title: string;
  answers: readonly GoalAnswer[];
}

export interface GoalQuestion {
  kind: 'question';
  field: GoalClarificationField;
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

export interface GoalSummaryStep {
  kind: 'summary';
  summary: GoalSummary;
}

export type GoalClarificationStep = GoalQuestion | GoalSummaryStep;

export interface GoalNextStepResult {
  source: 'ai' | 'fallback' | 'repaired';
  step: GoalClarificationStep;
}

export class GoalNextStepError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'GoalNextStepError';
  }
}

type GoalStepValidationCode = 'INVALID_STEP' | 'QUESTION_LIMIT';

class GoalStepValidationError extends Error {
  constructor(readonly code: GoalStepValidationCode) {
    super(code);
    this.name = 'GoalStepValidationError';
  }
}

const fallbackQuestions: readonly GoalQuestion[] = [
  {
    kind: 'question',
    field: 'currentProgress',
    question: '你现在已经做到哪一步了？',
  },
  {
    kind: 'question',
    field: 'deadline',
    question: '你希望什么时候完成这个目标？',
  },
  {
    kind: 'question',
    field: 'successCriteria',
    question: '你能投入多少时间，怎样算完成？',
  },
] as const;

function createFallbackStep(
  input: GoalClarificationInput,
): GoalClarificationStep {
  if (input.answers.length < 3) {
    const answeredFields = new Set(input.answers.map((answer) => answer.field));
    return fallbackQuestions.find(
      (question) => !answeredFields.has(question.field),
    ) as GoalQuestion;
  }

  const answerByField = new Map(
    input.answers.map((answer) => [answer.field, answer.answer]),
  );

  return {
    kind: 'summary',
    summary: {
      goal: input.title,
      successCriteria: answerByField.get('successCriteria') as string,
      deadline: answerByField.get('deadline') as string,
      currentProgress: answerByField.get('currentProgress') as string,
      suggestedStage: '从一个可验证的小步骤开始',
      excludedContent: [],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isGoalField(value: unknown): value is GoalClarificationField {
  return (
    value === 'currentProgress' ||
    value === 'deadline' ||
    value === 'successCriteria'
  );
}

function isDenseTextArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!isNonEmptyText(value[index])) {
      return false;
    }
  }
  return true;
}

function hasValidContext(input: unknown): input is GoalClarificationInput {
  if (
    !isRecord(input) ||
    (input.type !== 'study' && input.type !== 'work') ||
    !isNonEmptyText(input.title) ||
    !Array.isArray(input.answers) ||
    input.answers.length > 3
  ) {
    return false;
  }

  const fields = new Set<GoalClarificationField>();
  for (let index = 0; index < input.answers.length; index += 1) {
    const answer = input.answers[index];
    if (
      !isRecord(answer) ||
      !isGoalField(answer.field) ||
      fields.has(answer.field) ||
      !isNonEmptyText(answer.question) ||
      !isNonEmptyText(answer.answer)
    ) {
      return false;
    }
    fields.add(answer.field);
  }

  return true;
}

function validateGoalStep(
  candidate: unknown,
  input: GoalClarificationInput,
): GoalClarificationStep {
  if (!isRecord(candidate)) {
    throw new GoalStepValidationError('INVALID_STEP');
  }

  if (candidate.kind === 'question') {
    if (input.answers.length >= 3) {
      throw new GoalStepValidationError('QUESTION_LIMIT');
    }
    if (
      !isGoalField(candidate.field) ||
      input.answers.some((answer) => answer.field === candidate.field) ||
      !isNonEmptyText(candidate.question)
    ) {
      throw new GoalStepValidationError('INVALID_STEP');
    }
    return candidate as unknown as GoalQuestion;
  }

  if (candidate.kind === 'summary' && isRecord(candidate.summary)) {
    const summary = candidate.summary;
    const deadlineIsValid =
      summary.deadline === null || isNonEmptyText(summary.deadline);
    if (
      isNonEmptyText(summary.goal) &&
      isNonEmptyText(summary.successCriteria) &&
      deadlineIsValid &&
      isNonEmptyText(summary.currentProgress) &&
      isNonEmptyText(summary.suggestedStage) &&
      isDenseTextArray(summary.excludedContent)
    ) {
      return candidate as unknown as GoalSummaryStep;
    }
  }

  throw new GoalStepValidationError('INVALID_STEP');
}

export async function getNextGoalStep(
  input: GoalClarificationInput,
  provider: AIProvider,
): Promise<GoalNextStepResult> {
  if (!hasValidContext(input)) {
    throw new GoalNextStepError('INVALID_CONTEXT');
  }

  const request = {
    workflow: 'clarifyGoal',
    promptVersion: 'goal-clarification-v1',
    input,
  };
  let candidate: unknown;
  try {
    candidate = await provider.generateStructured(request);
  } catch {
    try {
      candidate = await provider.generateStructured(request);
    } catch {
      return { source: 'fallback', step: createFallbackStep(input) };
    }
  }

  try {
    return {
      source: 'ai',
      step: validateGoalStep(candidate, input),
    };
  } catch (error) {
    if (!(error instanceof GoalStepValidationError)) {
      throw error;
    }

    let repairedCandidate: unknown;
    try {
      repairedCandidate = await provider.generateStructured({
        ...request,
        repair: {
          candidate,
          validationCode: error.code,
        },
      });
    } catch {
      return { source: 'fallback', step: createFallbackStep(input) };
    }

    try {
      return {
        source: 'repaired',
        step: validateGoalStep(repairedCandidate, input),
      };
    } catch (repairError) {
      if (repairError instanceof GoalStepValidationError) {
        return { source: 'fallback', step: createFallbackStep(input) };
      }
      throw repairError;
    }
  }
}
