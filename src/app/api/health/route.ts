import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, ensureDatabase } from "@/db/client";
export async function GET() {
  try {
    await ensureDatabase();
    await db.execute(sql`select 1`);
    return NextResponse.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "error", database: "unavailable" },
      { status: 503 },
    );
  }
}
