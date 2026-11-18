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
      "0002_coordination_intelligence.sql",
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
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('intake_reviews','communications','ai_runs','invoice_drafts','coordination_objectives','coordination_dependencies','coordination_date_options') ORDER BY table_name",
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "ai_runs",
      "communications",
      "coordination_date_options",
      "coordination_dependencies",
      "coordination_objectives",
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

  it("persists objective ownership and keeps requested holds inactive", async () => {
    await database.exec(
      "INSERT INTO sources (id,workspace_id,type,content_hash) VALUES ('source_coord','ws_a','pasted_email','coord-hash'); INSERT INTO coordination_objectives (id,workspace_id,job_id,source_id,kind,title,outcome,summary,next_action) VALUES ('objective_a','ws_a','job_a','source_coord','advance_inquiry','Advance Private A','Reach a booking decision','Two alternative dates','Choose interest'); INSERT INTO coordination_dependencies (id,workspace_id,objective_id,key,label,owner,status,result) VALUES ('dependency_a','ws_a','objective_a','interest','Creative interest','creative','needs_decision','Not decided'); INSERT INTO coordination_date_options (id,workspace_id,objective_id,job_id,source_id,label,relationship,hold_requested,hold_priority,hold_state) VALUES ('date_a','ws_a','objective_a','job_a','source_coord','December 16','alternative',true,'second','requested');",
    );
    const requested = await database.query<{
      hold_state: string;
      owner: string;
      active_holds: number;
    }>(
      "SELECT d.hold_state, dep.owner, (SELECT count(*)::int FROM holds WHERE job_id='job_a' AND status='active') AS active_holds FROM coordination_date_options d JOIN coordination_dependencies dep ON dep.objective_id=d.objective_id WHERE d.workspace_id='ws_a'",
    );
    expect(requested.rows[0]).toEqual({
      hold_state: "requested",
      owner: "creative",
      active_holds: 0,
    });
    const otherWorkspace = await database.query(
      "SELECT id FROM coordination_objectives WHERE workspace_id='ws_b'",
    );
    expect(otherWorkspace.rows).toEqual([]);
  });
});
