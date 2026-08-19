import type { TokenHubProviderOptions } from '../shared/tokenhub-provider';

type DailyPlanProviderOverrides = Pick<
  TokenHubProviderOptions,
  'timeoutMs' | 'requestOptions'
>;

export function getDailyPlanProviderOverrides(
  baseUrl: string | undefined,
): DailyPlanProviderOverrides {
  if (!baseUrl) {
    return {};
  }

  try {
    if (new URL(baseUrl).hostname !== 'api.deepseek.com') {
      return {};
    }
  } catch {
    return {};
  }

  return {
    timeoutMs: 8_000,
    requestOptions: { thinking: { type: 'disabled' } },
  };
}
