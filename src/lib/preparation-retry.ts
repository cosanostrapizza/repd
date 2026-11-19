import { AIConfigurationError, AIProviderError } from "@/lib/ai/provider";

export type PreparationFailureCategory =
  | "provider_transient"
  | "provider_configuration"
  | "provider_non_retryable"
  | "artifact_validation"
  | "state_transition";

export class PreparationArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreparationArtifactValidationError";
  }
}

export function classifyPreparationFailure(error: unknown): {
  category: PreparationFailureCategory;
  automaticallyRetryable: boolean;
  message: string;
} {
  if (error instanceof AIConfigurationError)
    return {
      category: "provider_configuration",
      automaticallyRetryable: false,
      message: error.message,
    };
  if (error instanceof AIProviderError) {
    const transient =
      error.code === "provider_error" ||
      error.code === "empty_output" ||
      /(?:connection|timeout|408|409|429|5\d\d)$/i.test(error.code);
    return {
      category: transient ? "provider_transient" : "provider_non_retryable",
      automaticallyRetryable: transient,
      message: error.message,
    };
  }
  if (error instanceof PreparationArtifactValidationError)
    return {
      category: "artifact_validation",
      automaticallyRetryable: false,
      message: error.message,
    };
  return {
    category: "state_transition",
    automaticallyRetryable: false,
    message:
      error instanceof Error
        ? error.message
        : "Repd could not transition the preparation operation.",
  };
}

export async function runWithBoundedAutomaticRetry<T>(args: {
  operation: () => Promise<T>;
  maxAttempts?: number;
  onRetry?: (attempt: number, error: unknown) => Promise<void> | void;
}) {
  const maxAttempts = Math.max(1, Math.min(args.maxAttempts ?? 2, 2));
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      return { value: await args.operation(), attempts };
    } catch (error) {
      const failure = classifyPreparationFailure(error);
      if (!failure.automaticallyRetryable || attempts >= maxAttempts) throw error;
      await args.onRetry?.(attempts + 1, error);
    }
  }
  throw new Error("Preparation retry policy exhausted unexpectedly.");
}
