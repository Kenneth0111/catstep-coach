import { describe, expect, it } from 'vitest';
import { buildDailyPlanMessages } from '../cloudfunctions/plan-generate/prompt';

const request = {
  workflow: 'generateDailyPlan',
  promptVersion: 'daily-plan-v1',
  input: {
    availableMinutes: 45,
    goalIds: ['goal-study', 'goal-work'],
  },
};

describe('daily plan prompt', () => {
  it('describes the validated daily plan contract', () => {
    const messages = buildDailyPlanMessages(request);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain('1–5');
    expect(messages[0]?.content).toContain('estimatedMinutes');
    expect(messages[0]?.content).toContain('goalId');
    expect(messages[0]?.content).toContain('availableMinutes');
    expect(messages[1]?.content).toContain('daily-plan-v1');
    expect(messages[1]?.content).toContain('goal-study');
  });

  it('includes the malformed candidate and validation code for repair', () => {
    const messages = buildDailyPlanMessages({
      ...request,
      repair: {
        candidate: { summary: '缺少任务' },
        validationCode: 'TASK_COUNT',
      },
    });

    expect(messages[1]?.content).toContain('TASK_COUNT');
    expect(messages[1]?.content).toContain('缺少任务');
  });
});
