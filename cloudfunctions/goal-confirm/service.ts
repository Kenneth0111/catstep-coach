import { createHash } from 'node:crypto';
import type { GoalSummary } from '../shared/goal-next-step';

export interface GoalConfirmationInput {
  requestId: string;
  type: 'study' | 'work';
  summary: GoalSummary;
}

export interface PersistedGoal {
  _openid: string;
  owner: string;
  type: 'study' | 'work';
  title: string;
  successCriteria: string;
  deadline: string | null;
  currentProgress: string;
  stage: string;
  excludedContent: string[];
  status: 'active';
  requestId: string;
  createdAt: string;
}

export interface ConfirmedGoal extends PersistedGoal {
  id: string;
}

export interface GoalRepository {
  findByRequestId(
    openid: string,
    requestId: string,
  ): Promise<ConfirmedGoal | null>;
  save(documentId: string, goal: PersistedGoal): Promise<ConfirmedGoal>;
}

export class GoalConfirmationError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'GoalConfirmationError';
  }
}

export function createGoalDocumentId(
  openid: string,
  requestId: string,
): string {
  return createHash('sha256')
    .update(openid)
    .update('\0')
    .update(requestId)
    .digest('hex')
    .slice(0, 32);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isDenseTextArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!isText(value[index])) {
      return false;
    }
  }
  return true;
}

function isGoalSummary(value: unknown): value is GoalSummary {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isText(value.goal) &&
    isText(value.successCriteria) &&
    (value.deadline === null || isText(value.deadline)) &&
    isText(value.currentProgress) &&
    isText(value.suggestedStage) &&
    isDenseTextArray(value.excludedContent)
  );
}

function isConfirmationInput(value: unknown): value is GoalConfirmationInput {
  return (
    isRecord(value) &&
    isText(value.requestId) &&
    (value.type === 'study' || value.type === 'work') &&
    isGoalSummary(value.summary)
  );
}

export async function confirmGoal(
  openid: string,
  input: unknown,
  repository: GoalRepository,
  now: () => Date,
): Promise<ConfirmedGoal> {
  if (!isText(openid) || !isConfirmationInput(input)) {
    throw new GoalConfirmationError('INVALID_CONTEXT');
  }

  const existing = await repository.findByRequestId(openid, input.requestId);
  if (existing) {
    return existing;
  }

  const goal = {
    _openid: openid,
    owner: openid,
    type: input.type,
    title: input.summary.goal,
    successCriteria: input.summary.successCriteria,
    deadline: input.summary.deadline,
    currentProgress: input.summary.currentProgress,
    stage: input.summary.suggestedStage,
    excludedContent: [...input.summary.excludedContent],
    status: 'active',
    requestId: input.requestId,
    createdAt: now().toISOString(),
  } satisfies PersistedGoal;
  return repository.save(createGoalDocumentId(openid, input.requestId), goal);
}
