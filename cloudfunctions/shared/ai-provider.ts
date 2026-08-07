export interface StructuredGenerationRequest {
  workflow: string;
  promptVersion: string;
  input: unknown;
  repair?: {
    candidate: unknown;
    validationCode: string;
  };
}

export interface AIProvider {
  generateStructured(request: StructuredGenerationRequest): Promise<unknown>;
}
