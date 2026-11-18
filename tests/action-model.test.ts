import { describe, expect, it } from "vitest";
import { actions } from "@/db/schema";
import { getTableColumns } from "drizzle-orm";

describe("durable action schema", () => {
  it("requires deduplication and resolution conditions", () => {
    const columns = getTableColumns(actions);
    expect(columns.deduplicationKey.notNull).toBe(true);
    expect(columns.resolutionCondition.notNull).toBe(true);
    expect(columns.resolutionReason.notNull).toBe(false);
  });
  it("keeps execution state separate from resolution", () => {
    const status = getTableColumns(actions).status;
    expect(status.enumValues).toContain("executing");
    expect(status.enumValues).toContain("resolved");
    const columns = getTableColumns(actions);
    expect(columns.executionStatus.notNull).toBe(true);
    expect(columns.approvedAt.notNull).toBe(false);
    expect(columns.idempotencyKey.notNull).toBe(false);
  });
});
