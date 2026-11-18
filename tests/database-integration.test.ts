import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("forward migrations and workspace-scoped persistence", () => {
  const database = new PGlite();
  beforeAll(async () => {
    for (const file of [
      "0000_colorful_blink.sql",
      "0001_lonely_the_anarchist.sql",
    ]) {
      const sql = await readFile(
        resolve(process.cwd(), "drizzle", file),
        "utf8",
      );
      for (const statement of sql
        .split("--> statement-breakpoint")
        .map((value) => value.trim())
        .filter(Boolean))
        await database.exec(statement);
    }
    await database.exec(
      "INSERT INTO workspaces (id,name,slug) VALUES ('ws_a','Studio A','a'),('ws_b','Studio B','b'); INSERT INTO jobs (id,workspace_id,title) VALUES ('job_a','ws_a','Private A'),('job_b','ws_b','Private B');",
    );
  }, 30_000);
  afterAll(async () => database.close());

  it("applies the forward migration without a destructive reset", async () => {
    const result = await database.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('intake_reviews','communications','ai_runs','invoice_drafts') ORDER BY table_name",
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "ai_runs",
      "communications",
      "intake_reviews",
      "invoice_drafts",
    ]);
  });

  it("supports scoped reads that do not expose another workspace", async () => {
    const result = await database.query<{ title: string }>(
      "SELECT title FROM jobs WHERE workspace_id = $1",
      ["ws_a"],
    );
    expect(result.rows).toEqual([{ title: "Private A" }]);
  });

  it("stores approval separately from external execution", async () => {
    await database.exec(
      "INSERT INTO actions (id,workspace_id,job_id,kind,title,explanation,recommendation,priority,status,execution_status,deduplication_key,resolution_condition,requires_approval,approved_at) VALUES ('action_a','ws_a','job_a','producer_coordination','Review note','Needs usage','Review draft','blocking','approved','ready','coordination:a','{\"type\":\"questions_answered\"}',true,now());",
    );
    const result = await database.query<{
      status: string;
      execution_status: string;
    }>("SELECT status,execution_status FROM actions WHERE id='action_a'");
    expect(result.rows[0]).toEqual({
      status: "approved",
      execution_status: "ready",
    });
  });
});
