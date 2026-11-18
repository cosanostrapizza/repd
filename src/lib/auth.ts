import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, ensureDatabase } from "@/db/client";
import { users, workspaceMembers, workspaces } from "@/db/schema";

const cookieName = "repd_session";
const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "repd-local-development-secret-change-me",
);

export async function createSession(userId: string, workspaceId: string) {
  const token = await new SignJWT({ userId, workspaceId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret);
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession() {
  (await cookies()).delete(cookieName);
}

export async function getSession() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: String(payload.userId),
      workspaceId: String(payload.workspaceId),
    };
  } catch {
    return null;
  }
}

export async function requireContext() {
  await ensureDatabase();
  const session = await getSession();
  if (!session) redirect("/login");
  const rows = await db
    .select({ user: users, workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, session.userId),
        eq(workspaceMembers.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);
  if (!rows[0]) {
    await clearSession();
    redirect("/login");
  }
  return { ...session, ...rows[0] };
}
