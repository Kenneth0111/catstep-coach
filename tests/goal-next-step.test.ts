import { describe, expect, it } from 'vitest';
import {
  GoalNextStepError,
  getNextGoalStep,
  type GoalAnswer,
} from '../cloudfunctions/shared/goal-next-step';
import type { StructuredGenerationRequest } from '../cloudfunctions/shared/ai-provider';

const baseInput = {
  type: 'study' as const,
  title: '掌握 TypeScript',
  answers: [],
};

const completedInput = {
  ...baseInput,
  answers: [
    {
      field: 'currentProgress' as const,
      question: '当前进度？',
      answer: '已掌握基础类型',
    },
    {
      field: 'deadline' as const,
      question: '截止日期？',
      answer: '2026-09-30',
    },
    {
      field: 'successCriteria' as const,
      question: '完成标准？',
      answer: '独立完成严格模式项目',
    },
  ],
};

describe('getNextGoalStep', () => {
  it('returns a valid AI clarification question', async () => {
    const question = {
      kind: 'question',
      field: 'currentProgress',
      question: '你现在已经掌握到什么程度？',
    };
    const provider = {
      generateStructured: async () => question,
    };

    await expect(getNextGoalStep(baseInput, provider)).resolves.toEqual({
      source: 'ai',
      step: question,
    });
  });

  it('returns a complete AI goal summary', async () => {
    const summary = {
      kind: 'summary',
      summary: {
        goal: '掌握 TypeScript',
        successCriteria: '独立完成一个严格模式项目',
        deadline: '2026-09-30',
        currentProgress: '已掌握基础类型',
        suggestedStage: '先练习泛型与类型收窄',
        excludedContent: ['暂不安排框架迁移'],
      },
    };
    const provider = {
      generateStructured: async () => summary,
    };

    await expect(getNextGoalStep(baseInput, provider)).resolves.toEqual({
      source: 'ai',
      step: summary,
    });
  });

  it('repairs a summary with sparse excluded content', async () => {
    const invalidSummary = {
      kind: 'summary',
      summary: {
        goal: '掌握 TypeScript',
        successCriteria: '独立完成一个严格模式项目',
        deadline: '2026-09-30',
        currentProgress: '已掌握基础类型',
        suggestedStage: '练习泛型与类型收窄',
        excludedContent: Array(1),
      },
    };
    const question = {
      kind: 'question',
      field: 'currentProgress',
      question: '你现在已经掌握到什么程度？',
    };
    const results = [invalidSummary, question];
    const provider = {
      generateStructured: async () => results.shift(),
    };

    await expect(getNextGoalStep(baseInput, provider)).resolves.toEqual({
      source: 'repaired',
      step: question,
    });
  });

  it.each([
    ['a top-level array', []],
    [
      'a question without text',
      { kind: 'question', field: 'currentProgress' },
    ],
    ['a summary without fields', { kind: 'summary', summary: {} }],
  ])('repairs %s', async (_label, invalidCandidate) => {
    const question = {
      kind: 'question',
      field: 'currentProgress',
      question: '你现在已经掌握到什么程度？',
    };
    const results = [invalidCandidate, question];
    const provider = {
      generateStructured: async () => results.shift(),
    };

    await expect(getNextGoalStep(baseInput, provider)).resolves.toEqual({
      source: 'repaired',
      step: question,
    });
  });

  it('does not hide an unexpected output validation error', async () => {
    const unexpectedCandidate = new Proxy(
      {},
      {
        get(target, property, receiver) {
          if (property === 'kind') {
            throw new Error('unexpected candidate access');
          }
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const provider = {
      generateStructured: async () => unexpectedCandidate,
    };

    await expect(getNextGoalStep(baseInput, provider)).rejects.toThrow(
      'unexpected candidate access',
    );
  });

  it('repairs a fourth question into a summary after three answers', async () => {
    const question = {
      kind: 'question',
      field: 'currentProgress',
      question: '还要补充什么？',
    };
    const summary = {
      kind: 'summary',
      summary: {
        goal: '掌握 TypeScript',
        successCriteria: '独立完成严格模式项目',
        deadline: '2026-09-30',
        currentProgress: '已掌握基础类型',
        suggestedStage: '练习泛型与类型收窄',
        excludedContent: [],
      },
    };
    const results = [question, summary];
    const provider = {
      generateStructured: async () => results.shift(),
    };

    await expect(getNextGoalStep(completedInput, provider)).resolves.toEqual({
      source: 'repaired',
      step: summary,
    });
  });

  it('passes the fourth question and limit code to the repair request', async () => {
    const question = {
      kind: 'question',
      field: 'currentProgress',
      question: '还要补充什么？',
    };
    const summary = {
      kind: 'summary',
      summary: {
        goal: '掌握 TypeScript',
        successCriteria: '独立完成严格模式项目',
        deadline: '2026-09-30',
        currentProgress: '已掌握基础类型',
        suggestedStage: '练习泛型与类型收窄',
        excludedContent: [],
      },
    };
    const requests: StructuredGenerationRequest[] = [];
    const provider = {
      generateStructured: async (request: StructuredGenerationRequest) => {
        requests.push(request);
        return requests.length === 1 ? question : summary;
      },
    };

    await getNextGoalStep(completedInput, provider);

    expect({ count: requests.length, repair: requests[1]?.repair }).toEqual({
      count: 2,
      repair: {
        candidate: question,
        validationCode: 'QUESTION_LIMIT',
      },
    });
  });

  it('uses a rule summary when a fourth question cannot be repaired', async () => {
    const provider = {
      generateStructured: async () => ({
        kind: 'question',
        field: 'currentProgress',
        question: '还要补充什么？',
      }),
    };

    await expect(getNextGoalStep(completedInput, provider)).resolves.toEqual({
      source: 'fallback',
      step: {
        kind: 'summary',
        summary: {
          goal: '掌握 TypeScript',
          successCriteria: '独立完成严格模式项目',
          deadline: '2026-09-30',
          currentProgress: '已掌握基础类型',
          suggestedStage: '从一个可验证的小步骤开始',
          excludedContent: [],
        },
      },
    });
  });

  it('uses one fallback when the repair request fails', async () => {
    const question = {
      kind: 'question',
      field: 'currentProgress',
      question: '还要补充什么？',
    };
    let attempts = 0;
    const provider = {
      generateStructured: async () => {
        attempts += 1;
        if (attempts === 1) {
          return question;
        }
        throw new Error('repair unavailable');
      },
    };

    await expect(
      getNextGoalStep(completedInput, provider).then((result) => ({
        attempts,
        result,
      })),
    ).resolves.toMatchObject({
      attempts: 2,
      result: { source: 'fallback', step: { kind: 'summary' } },
    });
  });

  it('builds the rule summary by answer field instead of answer order', async () => {
    const shuffledInput = {
      ...completedInput,
      answers: [
        completedInput.answers[1],
        completedInput.answers[2],
        completedInput.answers[0],
      ],
    };
    const provider = {
      generateStructured: async () => ({
        kind: 'question',
        field: 'currentProgress',
        question: '还要补充什么？',
      }),
    };

    await expect(getNextGoalStep(shuffledInput, provider)).resolves.toMatchObject({
      source: 'fallback',
      step: {
        kind: 'summary',
        summary: {
          currentProgress: '已掌握基础类型',
          deadline: '2026-09-30',
          successCriteria: '独立完成严格模式项目',
        },
      },
    });
  });

  it('retries once after a provider error', async () => {
    const question = {
      kind: 'question',
      field: 'currentProgress',
      question: '你现在已经掌握到什么程度？',
    };
    let attempts = 0;
    const provider = {
      generateStructured: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('temporary provider error');
        }
        return question;
      },
    };

    await expect(
      getNextGoalStep(baseInput, provider).then((result) => ({
        attempts,
        result,
      })),
    ).resolves.toEqual({
      attempts: 2,
      result: { source: 'ai', step: question },
    });
  });

  it('uses the first rule question after two provider errors', async () => {
    let attempts = 0;
    const provider = {
      generateStructured: async () => {
        attempts += 1;
        throw new Error('provider unavailable');
      },
    };

    await expect(
      getNextGoalStep(baseInput, provider).then((result) => ({
        attempts,
        result,
      })),
    ).resolves.toEqual({
      attempts: 2,
      result: {
        source: 'fallback',
        step: {
          kind: 'question',
          field: 'currentProgress',
          question: '你现在已经做到哪一步了？',
        },
      },
    });
  });

  it('uses a rule question for the next missing field', async () => {
    const provider = {
      generateStructured: async () => {
        throw new Error('provider unavailable');
      },
    };
    const input = {
      ...baseInput,
      answers: [completedInput.answers[0]],
    };

    await expect(getNextGoalStep(input, provider)).resolves.toEqual({
      source: 'fallback',
      step: {
        kind: 'question',
        field: 'deadline',
        question: '你希望什么时候完成这个目标？',
      },
    });
  });

  it('rejects an empty goal title before calling the provider', async () => {
    const provider = {
      generateStructured: async () => {
        throw new Error('provider must not be called');
      },
    };

    await expect(
      getNextGoalStep({ ...baseInput, title: '  ' }, provider),
    ).rejects.toThrow(new GoalNextStepError('INVALID_CONTEXT'));
  });

  it('rejects a null runtime context with the domain error', async () => {
    const provider = {
      generateStructured: async () => {
        throw new Error('provider must not be called');
      },
    };

    await expect(getNextGoalStep(null as never, provider)).rejects.toThrow(
      new GoalNextStepError('INVALID_CONTEXT'),
    );
  });

  it.each<{
    label: string;
    answers: GoalAnswer[];
  }>([
    {
      label: 'more than three answers',
      answers: [
        ...completedInput.answers,
        {
          field: 'currentProgress',
          question: '重复问题？',
          answer: '重复回答',
        },
      ],
    },
    {
      label: 'duplicate answer fields',
      answers: [completedInput.answers[0], completedInput.answers[0]],
    },
    {
      label: 'an empty answer',
      answers: [
        {
          field: 'currentProgress',
          question: '当前进度？',
          answer: '  ',
        },
      ],
    },
  ])('rejects $label before calling the provider', async ({ answers }) => {
    const provider = {
      generateStructured: async () => {
        throw new Error('provider must not be called');
      },
    };

    await expect(
      getNextGoalStep({ ...baseInput, answers }, provider),
    ).rejects.toThrow(new GoalNextStepError('INVALID_CONTEXT'));
  });
});
