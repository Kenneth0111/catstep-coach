import { validateDailyPlanStructure } from '../shared/daily-plan';
import { createTokenHubProvider } from '../shared/tokenhub-provider';
import { buildDailyPlanMessages } from './prompt';
import { getDailyPlanProviderOverrides } from './provider-config';

export interface TokenHubSmokeResult {
  ok: true;
  model: string;
  latencyMs: number;
  structurallyValid: true;
}

export class TokenHubSmokeError extends Error {
  constructor(readonly code: 'MISCONFIGURED' | 'FAILED') {
    super(code);
    this.name = 'TokenHubSmokeError';
  }
}

export async function runTokenHubSmoke(
  env: Readonly<Record<string, string | undefined>>,
  fetchRequest: typeof fetch = globalThis.fetch,
  now: () => number = () => Date.now(),
): Promise<TokenHubSmokeResult> {
  const apiKey = env.TOKENHUB_API_KEY?.trim();
  const model = env.TOKENHUB_MODEL?.trim();
  if (!apiKey || !model) {
    throw new TokenHubSmokeError('MISCONFIGURED');
  }

  const constraints = {
    availableMinutes: 15,
    goalIds: ['smoke-goal'],
  };
  const baseUrl = env.TOKENHUB_BASE_URL?.trim() || undefined;
  const provider = createTokenHubProvider({
    apiKey,
    model,
    baseUrl,
    ...getDailyPlanProviderOverrides(baseUrl),
    fetch: fetchRequest,
    buildMessages: buildDailyPlanMessages,
  });
  const startedAt = now();

  try {
    const candidate = await provider.generateStructured({
      workflow: 'generateDailyPlan',
      promptVersion: 'daily-plan-v1',
      input: constraints,
    });
    validateDailyPlanStructure(candidate, constraints);
    return {
      ok: true,
      model,
      latencyMs: now() - startedAt,
      structurallyValid: true,
    };
  } catch {
    throw new TokenHubSmokeError('FAILED');
  }
}

async function main() {
  try {
    console.log(JSON.stringify(await runTokenHubSmoke(process.env)));
  } catch (error) {
    const code =
      error instanceof TokenHubSmokeError ? error.code : ('FAILED' as const);
    console.error(JSON.stringify({ ok: false, code }));
    process.exitCode = 1;
  }
}

const nodeRequire = require as unknown as NodeJS.Require;
if (nodeRequire.main === module) {
  void main();
}
