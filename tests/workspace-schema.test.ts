import { describe, expect, it } from "vitest";
import {
  actions,
  aiRuns,
  communications,
  holds,
  intakeReviews,
  invoiceDrafts,
  jobs,
  organizations,
  people,
  questions,
  sources,
} from "@/db/schema";
import { getTableColumns } from "drizzle-orm";

describe("workspace ownership", () => {
  it("scopes every business root", () => {
    for (const table of [
      jobs,
      people,
      organizations,
      holds,
      actions,
      sources,
      intakeReviews,
      questions,
      communications,
      aiRuns,
      invoiceDrafts,
    ])
      expect(getTableColumns(table).workspaceId.notNull).toBe(true);
  });
});
