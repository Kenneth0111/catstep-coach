import type { AIProvider } from './ai-provider';
import {
  DailyPlanValidationError,
  validateDailyPlanStructure,
  type DailyPlan,
  type DailyPlanConstraints,
} from './daily-plan';

export interface DailyPlanGenerationResult {
  plan: DailyPlan;
  source: 'ai' | 'fallback' | 'repaired';
}

export class DailyPlanGenerationError extends Error {
  constructor(readonly code: 'INVALID_CONTEXT') {
    super(code);
    this.name = 'DailyPlanGenerationError';
  }
}

function createFallbackResult(
  input: DailyPlanConstraints,
): DailyPlanGenerationResult {
  const candidate = {
    summary: 'AI 暂时不可用，先完成一个可控的小步骤。',
    tasks: [
      {
        title: '写下当前目标的下一步',
        action: '为当前目标写下一条可以立即开始的具体行动',
        estimatedMinutes: Math.min(10, input.availableMinutes),
        doneCriteria: '写下一条包含具体动作和完成标准的下一步',
        goalId: input.goalIds[0],
        reason: '规则降级让计划仍可继续',
        difficulty: 'easy',
      },
    ],
  };

  return {
    plan: validateDailyPlanStructure(candidate, input),
    source: 'fallback',
  };
}

export async function generateDailyPlan(
  input: DailyPlanConstraints,
  provider: AIProvider,
): Promise<DailyPlanGenerationResult> {
  if (
    !input.goalIds[0]?.trim() ||
    !Number.isInteger(input.availableMinutes) ||
    input.availableMinutes <= 0
  ) {
    throw new DailyPlanGenerationError('INVALID_CONTEXT');
  }

  const request = {
    workflow: 'generateDailyPlan',
    promptVersion: 'daily-plan-v1',
    input,
  };
  let candidate: unknown;
  try {
    candidate = await provider.generateStructured(request);
  } catch {
    try {
      candidate = await provider.generateStructured(request);
    } catch {
      return createFallbackResult(input);
    }
  }

  try {
    return {
      plan: validateDailyPlanStructure(candidate, input),
      source: 'ai',
    };
  } catch (error) {
    if (!(error instanceof DailyPlanValidationError)) {
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
      return createFallbackResult(input);
    }

    try {
      return {
        plan: validateDailyPlanStructure(repairedCandidate, input),
        source: 'repaired',
      };
    } catch (repairError) {
      if (repairError instanceof DailyPlanValidationError) {
        return createFallbackResult(input);
      }
      throw repairError;
    }
  }
}
