import { describe, expect, it } from "vitest";
import { parseAgentPageContext } from "@/lib/agent-context";

describe("agent page context", () => {
  it("accepts only the focused job, route, and selected application object", () => {
    const context = parseAgentPageContext(
      JSON.stringify({
        route: "/jobs/job_nike",
        job: { id: "job_nike", title: "Nike Run Division — SS27" },
        selected: {
          kind: "field",
          id: "usageTerms",
          label: "Usage & exclusivity: US paid social",
        },
      }),
    );
    expect(context).toEqual({
      route: "/jobs/job_nike",
      job: { id: "job_nike", title: "Nike Run Division — SS27" },
      selected: {
        kind: "field",
        id: "usageTerms",
        label: "Usage & exclusivity: US paid social",
      },
    });
  });

  it("drops malformed or oversized client context", () => {
    expect(parseAgentPageContext("not-json")).toBeNull();
    expect(
      parseAgentPageContext(
        JSON.stringify({ route: "https://unrelated.example", extra: "data" }),
      ),
    ).toBeNull();
    expect(
      parseAgentPageContext(
        JSON.stringify({ route: "/", selected: { kind: "other", label: "x" } }),
      ),
    ).toBeNull();
    expect(
      parseAgentPageContext(
        JSON.stringify({
          route: "/jobs/job_nike",
          selected: { kind: "field", label: "x".repeat(181) },
        }),
      ),
    ).toBeNull();
  });
});
