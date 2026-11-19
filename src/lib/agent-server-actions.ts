"use server";

import { revalidatePath } from "next/cache";
import { executeAgentMessage } from "@/lib/agent-workspace";
import { requireContext } from "@/lib/auth";

export type AgentPanelState = {
  error?: string;
  threadId?: string;
  response?: string;
  status?: "completed" | "waiting_for_user" | "failed";
  jobId?: string | null;
  links?: Array<{ href: string; label: string }>;
  events?: Array<{
    id: string;
    type: string;
    status: string;
    label: string;
    detail: string | null;
  }>;
};

export async function sendAgentMessage(
  previous: AgentPanelState,
  formData: FormData,
): Promise<AgentPanelState> {
  const ctx = await requireContext();
  const content = String(formData.get("content") ?? "").trim();
  if (content.length < 3) return { ...previous, error: "Tell Repd what you need." };
  const result = await executeAgentMessage({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    content,
    threadId: String(formData.get("threadId") ?? "") || previous.threadId,
    contextJobId: String(formData.get("contextJobId") ?? "") || null,
  });
  revalidatePath("/");
  if (result.jobId) revalidatePath(`/jobs/${result.jobId}`);
  revalidatePath("/agent");
  return {
    threadId: result.threadId,
    response: result.response,
    status: result.status,
    jobId: result.jobId,
    links: result.links,
    events: result.events.map(({ id, type, status, label, detail }) => ({
      id,
      type,
      status,
      label,
      detail,
    })),
  };
}
