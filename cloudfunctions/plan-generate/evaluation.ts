import {
  dailyPlanEvaluationCases,
  evaluateDailyPlanCandidate,
  type DailyPlanCandidateEvaluation,
} from '../shared/ai-evaluation';
import { createTokenHubProvider } from '../shared/tokenhub-provider';
import { buildDailyPlanMessages } from './prompt';
import { getDailyPlanProviderOverrides } from './provider-config';

export interface DailyPlanEvaluationRunResult {
  model: string;
  total: number;
  structurallyValid: number;
  cases: Array<
    DailyPlanCandidateEvaluation | {
      caseId: string;
      structurallyValid: false;
      validationCode: 'PROVIDER_FAILED';
    }
  >;
}

export class DailyPlanEvaluationRunnerError extends Error {
  constructor(readonly code: 'MISCONFIGURED') {
    super(code);
    this.name = 'DailyPlanEvaluationRunnerError';
  }
}

export async function runDailyPlanEvaluation(
  env: Readonly<Record<string, string | undefined>>,
  fetchRequest: typeof fetch = globalThis.fetch,
): Promise<DailyPlanEvaluationRunResult> {
  const apiKey = env.TOKENHUB_API_KEY?.trim();
  const model = env.TOKENHUB_MODEL?.trim();
  if (!apiKey || !model) {
    throw new DailyPlanEvaluationRunnerError('MISCONFIGURED');
  }

  const requestedCaseId = env.DAILY_PLAN_EVALUATION_CASE_ID?.trim();
  const evaluationCases = requestedCaseId
    ? dailyPlanEvaluationCases.filter((evaluationCase) => evaluationCase.id === requestedCaseId)
    : dailyPlanEvaluationCases;
  if (evaluationCases.length === 0) {
    throw new DailyPlanEvaluationRunnerError('MISCONFIGURED');
  }

  const baseUrl = env.TOKENHUB_BASE_URL?.trim() || undefined;
  const provider = createTokenHubProvider({
    apiKey,
    model,
    baseUrl,
    ...getDailyPlanProviderOverrides(baseUrl),
    fetch: fetchRequest,
    buildMessages: buildDailyPlanMessages,
  });
  const cases: DailyPlanEvaluationRunResult['cases'] = [];

  for (const evaluationCase of evaluationCases) {
    try {
      const candidate = await provider.generateStructured({
        workflow: 'generateDailyPlan',
        promptVersion: 'daily-plan-v1',
        input: evaluationCase.context,
      });
      cases.push(evaluateDailyPlanCandidate(evaluationCase, candidate));
    } catch {
      cases.push({
        caseId: evaluationCase.id,
        structurallyValid: false,
        validationCode: 'PROVIDER_FAILED',
      });
    }
  }

  return {
    model,
    total: cases.length,
    structurallyValid: cases.filter((result) => result.structurallyValid).length,
    cases,
  };
}

async function main() {
  try {
    console.log(JSON.stringify(await runDailyPlanEvaluation(process.env)));
  } catch (error) {
    const code = error instanceof DailyPlanEvaluationRunnerError
      ? error.code
      : 'MISCONFIGURED';
    console.error(JSON.stringify({ ok: false, code }));
    process.exitCode = 1;
  }
}

const nodeRequire = require as unknown as NodeJS.Require;
if (nodeRequire.main === module) {
  void main();
}
