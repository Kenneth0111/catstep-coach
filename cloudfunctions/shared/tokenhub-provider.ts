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
  fetch?: typeof fetch;
  buildMessages(
    request: StructuredGenerationRequest,
  ): TokenHubChatMessage[];
}

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
  const timeoutMs = options.timeoutMs ?? 8_000;

  return {
    async generateStructured(request) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;

      try {
        response = await fetchRequest(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model,
            messages: options.buildMessages(request),
            stream: false,
          }),
          signal: controller.signal,
        });
      } catch {
        throw new TokenHubProviderError('NETWORK_ERROR');
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new TokenHubProviderError('HTTP_ERROR');
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new TokenHubProviderError('INVALID_RESPONSE');
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
    },
  };
}
