import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAiRuntimeConfiguration } from '../cloudfunctions/shared/ai-runtime-config';

function database(read: () => unknown) {
  return {
    collection(name: string) {
      expect(name).toBe('runtime_settings');
      return { doc: (id: string) => {
        expect(id).toBe('ai_provider');
        return { get: async () => ({ data: [read()] }) };
      } };
    },
  };
}

describe('AI runtime configuration', () => {
  const legacyEnvironment = {
    TOKENHUB_API_KEY: 'legacy-key',
    TOKENHUB_BASE_URL: 'https://legacy.example/v1',
    TOKENHUB_MODEL: 'legacy-model',
  };

  it('uses the complete server-side document instead of legacy environment variables', async () => {
    await expect(loadAiRuntimeConfiguration(database(() => ({
      apiKey: 'runtime-key', baseUrl: 'https://runtime.example/v1', model: 'runtime-model',
    })), legacyEnvironment)).resolves.toEqual({
      apiKey: 'runtime-key', baseUrl: 'https://runtime.example/v1', model: 'runtime-model',
    });
  });

  it('reads a saved configuration update on the next call without a cache', async () => {
    let apiKey = 'first-key';
    const runtimeDatabase = database(() => ({ apiKey, model: 'runtime-model' }));

    await expect(loadAiRuntimeConfiguration(runtimeDatabase, legacyEnvironment)).resolves.toMatchObject({ apiKey: 'first-key' });
    apiKey = 'rotated-key';
    await expect(loadAiRuntimeConfiguration(runtimeDatabase, legacyEnvironment)).resolves.toMatchObject({ apiKey: 'rotated-key' });
  });

  it('falls back to the complete legacy configuration when the runtime document is incomplete', async () => {
    await expect(loadAiRuntimeConfiguration(database(() => ({ apiKey: 'runtime-key', model: '' })), legacyEnvironment))
      .resolves.toEqual({ apiKey: 'legacy-key', baseUrl: 'https://legacy.example/v1', model: 'legacy-model' });
  });

  it('does not combine a partial runtime document with legacy values', async () => {
    await expect(loadAiRuntimeConfiguration(database(() => ({ apiKey: 'runtime-key', model: '' })), {
      TOKENHUB_API_KEY: undefined,
      TOKENHUB_MODEL: 'legacy-model',
    })).resolves.toBeNull();
  });

  it('routes every AI cloud-function entry through the shared runtime loader', async () => {
    for (const functionName of [
      'goal-next-step', 'plan-generate', 'plan-resize-task', 'review-generate',
    ]) {
      const source = await readFile(resolve('cloudfunctions', functionName, 'index.ts'), 'utf8');
      expect(source).toContain("../shared/ai-runtime-config");
      expect(source).toContain('loadAiRuntimeConfiguration');
      expect(source).not.toContain('process.env.TOKENHUB_');
    }
  });

  it('includes the shared loader in every AI cloud-function deployment build', async () => {
    for (const functionName of [
      'goal-next-step', 'plan-generate', 'plan-resize-task', 'review-generate',
    ]) {
      const configuration = await readFile(resolve('cloudfunctions', functionName, 'tsconfig.json'), 'utf8');
      expect(configuration).toContain('../shared/ai-runtime-config.ts');
    }
  });
});
