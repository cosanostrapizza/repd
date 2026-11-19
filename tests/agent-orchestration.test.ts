import { describe, expect, it } from "vitest";
import { agentNextStepSchema } from "@/lib/ai/schemas";

describe("bounded agent step contract", () => {
  it("accepts one typed tool choice without a reasoning trace", () => {
    expect(
      agentNextStepSchema.parse({
        kind: "tool",
        toolName: "read_job_state",
        input: { jobId: "job_123" },
        message: "",
        rationaleSummary: "Inspect authoritative job state.",
      }),
    ).toMatchObject({ kind: "tool", toolName: "read_job_state" });
  });

  it("rejects an unstructured planner blob", () => {
    expect(() =>
      agentNextStepSchema.parse({ actions: [{ sql: "update jobs" }] }),
    ).toThrow();
  });
});
