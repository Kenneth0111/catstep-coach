import { describe, expect, it } from 'vitest';
import {
  dailyPlanEvaluationCases,
  evaluateDailyPlanCandidate,
} from '../cloudfunctions/shared/ai-evaluation';
import { validateDailyPlanStructure } from '../cloudfunctions/shared/daily-plan';

describe('daily-plan AI evaluation set', () => {
  it('contains at least 30 de-identified cases that satisfy the server contract', () => {
    expect(dailyPlanEvaluationCases.length).toBeGreaterThanOrEqual(30);
    expect(new Set(dailyPlanEvaluationCases.map((evaluationCase) => evaluationCase.scenario))).toEqual(
      new Set(['student', 'job_search', 'work_project', 'low_energy', 'time_conflict', 'large_goal']),
    );

    for (const evaluationCase of dailyPlanEvaluationCases) {
      expect(evaluationCase.id).toMatch(/^daily-plan-\d{2}$/);
      expect(evaluationCase.context.goals).toHaveLength(1);
      expect(() => validateDailyPlanStructure(
        evaluationCase.candidate,
        evaluationCase.context,
      )).not.toThrow();
    }
  });

  it('evaluates a model candidate against the selected case without retaining its text', () => {
    const evaluationCase = dailyPlanEvaluationCases[0];

    expect(evaluateDailyPlanCandidate(evaluationCase, evaluationCase.candidate)).toEqual({
      caseId: 'daily-plan-01',
      structurallyValid: true,
    });
    expect(evaluateDailyPlanCandidate(evaluationCase, {
      ...evaluationCase.candidate,
      tasks: [],
    })).toEqual({
      caseId: 'daily-plan-01',
      structurallyValid: false,
      validationCode: 'TASK_COUNT',
    });
  });
});
