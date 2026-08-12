import type {
  AIProvider,
  StructuredGenerationRequest,
} from './ai-provider';

export interface TokenHubChatMessage {
  role: 'system' | 'user';
  content: string;
}

type TokenHubProviderErrorCode =
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE';

export class TokenHubProviderError extends Error {
  constructor(readonly code: TokenHubProviderErrorCode) {
    super(code);
    this.name = 'TokenHubProviderError';
  }
}

export interface TokenHubProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  requestOptions?: Record<string, unknown>;
  fetch?: typeof fetch;
  buildMessages(
    request: StructuredGenerationRequest,
  ): TokenHubChatMessage[];
}

export const TOKENHUB_REQUEST_TIMEOUT_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getMessageContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return null;
  }

  return typeof firstChoice.message.content === 'string'
    ? firstChoice.message.content
    : null;
}

export function createTokenHubProvider(
  options: TokenHubProviderOptions,
): AIProvider {
  const fetchRequest = options.fetch ?? globalThis.fetch;
  const baseUrl = (
    options.baseUrl ?? 'https://tokenhub.tencentmaas.com/v1'
  ).replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? TOKENHUB_REQUEST_TIMEOUT_MS;

  return {
    async generateStructured(request) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchRequest(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...options.requestOptions,
            model: options.model,
            messages: options.buildMessages(request),
            stream: false,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new TokenHubProviderError('HTTP_ERROR');
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new TokenHubProviderError(
            controller.signal.aborted
              ? 'NETWORK_ERROR'
              : 'INVALID_RESPONSE',
          );
        }

        const content = getMessageContent(payload);
        if (!content) {
          throw new TokenHubProviderError('INVALID_RESPONSE');
        }

        try {
          return JSON.parse(content) as unknown;
        } catch {
          return content;
        }
      } catch (error) {
        if (error instanceof TokenHubProviderError) {
          throw error;
        }
        throw new TokenHubProviderError('NETWORK_ERROR');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
