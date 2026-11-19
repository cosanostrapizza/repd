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
      "0003_calendar_date_semantics.sql",
      "0004_agent_native_workspace.sql",
      "0005_execution_reliability.sql",
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
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('intake_reviews','communications','ai_runs','invoice_drafts','coordination_objectives','coordination_dependencies','coordination_date_options','agent_threads','agent_messages','agent_runs','agent_run_events') ORDER BY table_name",
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "agent_messages",
      "agent_run_events",
      "agent_runs",
      "agent_threads",
      "ai_runs",
      "communications",
      "coordination_date_options",
      "coordination_dependencies",
      "coordination_objectives",
      "intake_reviews",
      "invoice_drafts",
    ]);
  });

  it("enforces one invoice draft per preparation action", async () => {
    const result = await database.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname='invoice_drafts_action_unique'",
    );
    expect(result.rows).toEqual([
      { indexname: "invoice_drafts_action_unique" },
    ]);
  });

  it("stores stable action ownership and durable agent execution events", async () => {
    await database.exec(
      "INSERT INTO sources (id,workspace_id,type,content_hash) VALUES ('source_agent','ws_a','pasted_email','agent-hash'); INSERT INTO coordination_objectives (id,workspace_id,job_id,source_id,kind,title,outcome,summary,next_action) VALUES ('objective_agent','ws_a','job_a','source_agent','treatment_response','Prepare response','Preserve decision','Decision recorded','Prepare draft'); INSERT INTO actions (id,workspace_id,job_id,objective_id,kind,title,explanation,recommendation,priority,status,execution_status,deduplication_key,resolution_condition,requires_approval) VALUES ('action_agent','ws_a','job_a','objective_agent','producer_coordination','Prepare response','Draft only','Retry preparation','blocking','open','failed','objective-agent:prepare','{\"type\":\"manual\"}',true); INSERT INTO agent_threads (id,workspace_id,job_id,title) VALUES ('thread_a','ws_a','job_a','Treatment reply'); INSERT INTO agent_messages (id,workspace_id,thread_id,job_id,role,content) VALUES ('message_a','ws_a','thread_a','job_a','user','Prepare the reply'); INSERT INTO agent_runs (id,workspace_id,thread_id,user_message_id,job_id,action_id,status) VALUES ('run_a','ws_a','thread_a','message_a','job_a','action_agent','failed'); INSERT INTO agent_run_events (id,workspace_id,run_id,sequence,type,status,label,action_id) VALUES ('event_a','ws_a','run_a',1,'failure','failed','Reply preparation failed','action_agent');",
    );
    const result = await database.query<{
      objective_id: string;
      execution_status: string;
      event_type: string;
    }>(
      "SELECT a.objective_id,a.execution_status,e.type AS event_type FROM actions a JOIN agent_run_events e ON e.action_id=a.id WHERE a.id='action_agent'",
    );
    expect(result.rows[0]).toEqual({
      objective_id: "objective_agent",
      execution_status: "failed",
      event_type: "failure",
    });
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

  it("stores calendar dates and client selection without confirming booking", async () => {
    await database.exec(
      "UPDATE jobs SET shoot_date='2026-12-16' WHERE id='job_a'; UPDATE coordination_date_options SET starts_on='2026-12-16',ends_on='2026-12-16',client_selected=true WHERE id='date_a';",
    );
    const result = await database.query<{
      shoot_date: string;
      booking_status: string;
      starts_on: string;
      client_selected: boolean;
      hold_state: string;
    }>(
      "SELECT j.shoot_date::text,j.booking_status,d.starts_on::text,d.client_selected,d.hold_state FROM jobs j JOIN coordination_date_options d ON d.job_id=j.id WHERE j.id='job_a'",
    );
    expect(result.rows[0]).toEqual({
      shoot_date: "2026-12-16",
      booking_status: "unbooked",
      starts_on: "2026-12-16",
      client_selected: true,
      hold_state: "requested",
    });
  });
});
