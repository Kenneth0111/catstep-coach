import { describe, expect, it, vi } from 'vitest';
import {
  TOKENHUB_REQUEST_TIMEOUT_MS,
  createTokenHubProvider,
} from '../cloudfunctions/shared/tokenhub-provider';
import { buildGoalClarificationMessages } from '../cloudfunctions/goal-next-step/prompt';

const request = {
  workflow: 'clarifyGoal',
  promptVersion: 'goal-clarification-v1',
  input: {
    type: 'study',
    title: '学会 TypeScript',
    answers: [],
  },
};

describe('TokenHub AI provider', () => {
  it('keeps three possible workflow attempts within fifteen seconds', () => {
    expect(TOKENHUB_REQUEST_TIMEOUT_MS).toBe(5_000);
    expect(TOKENHUB_REQUEST_TIMEOUT_MS * 3).toBeLessThanOrEqual(15_000);
  });

  it('posts an OpenAI-compatible request and parses JSON content', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  kind: 'question',
                  field: 'currentProgress',
                  question: '你已经学到哪里了？',
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = createTokenHubProvider({
      apiKey: 'test-secret',
      model: 'hy3',
      fetch: fetchMock,
      buildMessages: buildGoalClarificationMessages,
    });

    await expect(provider.generateStructured(request)).resolves.toEqual({
      kind: 'question',
      field: 'currentProgress',
      question: '你已经学到哪里了？',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://tokenhub.tencentmaas.com/v1/chat/completions');
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-secret',
        'Content-Type': 'application/json',
      },
    });
    const body = JSON.parse(String(options?.body)) as {
      model: string;
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('hy3');
    expect(body.stream).toBe(false);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[1]?.content).toContain('goal-clarification-v1');
  });

  it('includes explicitly configured provider request options', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"kind":"question"}' } }],
        }),
        { status: 200 },
      ),
    );
    const provider = createTokenHubProvider({
      apiKey: 'secret',
      model: 'deepseek-v4-flash',
      fetch: fetchMock,
      buildMessages: buildGoalClarificationMessages,
      requestOptions: { thinking: { type: 'disabled' } },
    });

    await provider.generateStructured(request);

    const options = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(options?.body))).toMatchObject({
      thinking: { type: 'disabled' },
    });
  });

  it('uses a configured TokenHub base URL without duplicating slashes', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"kind":"question"}' } }],
        }),
        { status: 200 },
      ),
    );
    const provider = createTokenHubProvider({
      apiKey: 'secret',
      model: 'model',
      baseUrl: 'https://tokenhub-intl.tencentmaas.com/v1/',
      fetch: fetchMock,
      buildMessages: buildGoalClarificationMessages,
    });

    await provider.generateStructured(request);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://tokenhub-intl.tencentmaas.com/v1/chat/completions',
    );
  });

  it('reports HTTP failures without exposing the response or API key', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('upstream-secret-details', { status: 401 }),
    );
    const provider = createTokenHubProvider({
      apiKey: 'test-secret',
      model: 'hy3',
      fetch: fetchMock,
      buildMessages: buildGoalClarificationMessages,
    });

    const failure = provider.generateStructured(request);

    await expect(failure).rejects.toMatchObject({
      code: 'HTTP_ERROR',
    });
    await expect(failure).rejects.not.toThrow(/test-secret|upstream-secret-details/);
  });

  it('aborts a stalled request at the configured timeout', async () => {
    const provider = createTokenHubProvider({
      apiKey: 'secret',
      model: 'hy3',
      timeoutMs: 1,
      fetch: async (_input, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
      buildMessages: buildGoalClarificationMessages,
    });

    await expect(provider.generateStructured(request)).rejects.toMatchObject({
      code: 'TIMEOUT_ERROR',
    });
  });

  it('keeps the timeout active while parsing a stalled response body', async () => {
    const provider = createTokenHubProvider({
      apiKey: 'secret',
      model: 'hy3',
      timeoutMs: 1,
      fetch: async (_input, options) =>
        ({
          ok: true,
          json: () =>
            new Promise((resolve, reject) => {
              const delayedBody = setTimeout(
                () =>
                  resolve({
                    choices: [
                      { message: { content: '{"kind":"question"}' } },
                    ],
                  }),
                20,
              );
              options?.signal?.addEventListener('abort', () => {
                clearTimeout(delayedBody);
                reject(new Error('body aborted'));
              });
            }),
        }) as Response,
      buildMessages: buildGoalClarificationMessages,
    });

    await expect(provider.generateStructured(request)).rejects.toMatchObject({
      code: 'TIMEOUT_ERROR',
    });
  });

  it('returns malformed model content so the workflow can request a repair', async () => {
    const provider = createTokenHubProvider({
      apiKey: 'secret',
      model: 'hy3',
      fetch: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'not-json' } }],
          }),
          { status: 200 },
        ),
      buildMessages: buildGoalClarificationMessages,
    });

    await expect(provider.generateStructured(request)).resolves.toBe('not-json');
  });

  it.each([{}, { choices: [] }])(
    'rejects an invalid TokenHub response envelope: %j',
    async (payload) => {
      const provider = createTokenHubProvider({
        apiKey: 'secret',
        model: 'hy3',
        fetch: async () =>
          new Response(JSON.stringify(payload), { status: 200 }),
        buildMessages: buildGoalClarificationMessages,
      });

      await expect(provider.generateStructured(request)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    },
  );
});
