import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AIConfigurationError, AIProviderError } from "@/lib/ai/provider";
import {
  classifyPreparationFailure,
  PreparationArtifactValidationError,
  runWithBoundedAutomaticRetry,
} from "@/lib/preparation-retry";

describe("bounded preparation recovery", () => {
  it("retries one transient provider failure and then succeeds", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new AIProviderError("Provider unavailable", "openai_503"),
      )
      .mockResolvedValueOnce("prepared");
    const result = await runWithBoundedAutomaticRetry({ operation });
    expect(result).toEqual({ value: "prepared", attempts: 2 });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("never retries configuration or command failures", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new AIConfigurationError("Missing provider key"));
    await expect(runWithBoundedAutomaticRetry({ operation })).rejects.toThrow(
      "Missing provider key",
    );
    expect(operation).toHaveBeenCalledTimes(1);
    expect(classifyPreparationFailure(new Error("Invalid transition"))).toMatchObject({
      category: "state_transition",
      automaticallyRetryable: false,
    });
    expect(
      classifyPreparationFailure(
        new PreparationArtifactValidationError("Commitment changed"),
      ),
    ).toMatchObject({
      category: "artifact_validation",
      automaticallyRetryable: false,
    });
  });

  it("stops after two transient attempts", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new AIProviderError("Timed out", "openai_timeout"));
    await expect(runWithBoundedAutomaticRetry({ operation })).rejects.toThrow(
      "Timed out",
    );
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
