export interface AiRuntimeConfiguration {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface AiRuntimeConfigurationDatabase {
  collection(name: 'runtime_settings'): {
    doc(id: 'ai_provider'): {
      get(): Promise<{ data: unknown[] }>;
    };
  };
}

type Environment = Readonly<Record<string, string | undefined>>;

function trimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readConfiguration(value: unknown): AiRuntimeConfiguration | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const apiKey = trimmedString((value as { apiKey?: unknown }).apiKey);
  const model = trimmedString((value as { model?: unknown }).model);
  if (!apiKey || !model) {
    return null;
  }
  return {
    apiKey,
    model,
    baseUrl: trimmedString((value as { baseUrl?: unknown }).baseUrl),
  };
}

export async function loadAiRuntimeConfiguration(
  database: AiRuntimeConfigurationDatabase,
  environment: Environment,
): Promise<AiRuntimeConfiguration | null> {
  try {
    const runtimeSettings = await database
      .collection('runtime_settings')
      .doc('ai_provider')
      .get();
    const configuration = readConfiguration(runtimeSettings.data[0]);
    if (configuration) {
      return configuration;
    }
  } catch {
    // A deployment using only the legacy environment variables remains usable.
  }

  return readConfiguration({
    apiKey: environment.TOKENHUB_API_KEY,
    baseUrl: environment.TOKENHUB_BASE_URL,
    model: environment.TOKENHUB_MODEL,
  });
}

export function toTokenHubEnvironment(
  configuration: AiRuntimeConfiguration | null,
): Environment {
  if (!configuration) {
    return {};
  }
  return {
    TOKENHUB_API_KEY: configuration.apiKey,
    TOKENHUB_BASE_URL: configuration.baseUrl,
    TOKENHUB_MODEL: configuration.model,
  };
}
