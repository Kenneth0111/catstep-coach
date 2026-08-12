import type { AIProvider } from '../shared/ai-provider';
import {
  generateDailyPlan,
  type DailyPlanGenerationResult,
} from '../shared/generate-daily-plan';

export interface PlanGenerationInput {
  availableMinutes: number;
  goalIds: string[];
}

export interface OwnedGoal {
  id: string;
  title: string;
  successCriteria: string;
  currentProgress: string;
  stage: string;
}

export interface OwnedGoalRepository {
  findActiveByIds(
    openid: string,
    goalIds: readonly string[],
  ): Promise<OwnedGoal[]>;
}

export class PlanGenerationServiceError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'PlanGenerationServiceError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlanInput(value: unknown): value is PlanGenerationInput {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.availableMinutes) ||
    (value.availableMinutes as number) <= 0 ||
    !Array.isArray(value.goalIds) ||
    value.goalIds.length < 1 ||
    value.goalIds.length > 5
  ) {
    return false;
  }

  const ids = new Set<string>();
  for (let index = 0; index < value.goalIds.length; index += 1) {
    const goalId = value.goalIds[index];
    if (typeof goalId !== 'string' || !goalId.trim() || ids.has(goalId)) {
      return false;
    }
    ids.add(goalId);
  }
  return true;
}

export async function generateOwnedDailyPlan(
  openid: string,
  input: unknown,
  repository: OwnedGoalRepository,
  createProvider: () => AIProvider,
): Promise<DailyPlanGenerationResult> {
  if (!openid.trim() || !isPlanInput(input)) {
    throw new PlanGenerationServiceError('INVALID_CONTEXT');
  }

  const ownedGoals = await repository.findActiveByIds(openid, input.goalIds);
  const ownedGoalsById = new Map(ownedGoals.map((goal) => [goal.id, goal]));
  if (input.goalIds.some((goalId) => !ownedGoalsById.has(goalId))) {
    throw new PlanGenerationServiceError('INVALID_CONTEXT');
  }

  const goals = input.goalIds.map((goalId) => {
    const goal = ownedGoalsById.get(goalId);
    if (!goal) {
      throw new PlanGenerationServiceError('INVALID_CONTEXT');
    }
    return goal;
  });

  return generateDailyPlan({ ...input, goals }, createProvider());
}
