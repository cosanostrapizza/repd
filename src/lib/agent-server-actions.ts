"use server";

import { revalidatePath } from "next/cache";
import { parseAgentPageContext } from "@/lib/agent-context";
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
  submission?: {
    runId: string;
    userMessageId: string;
    assistantMessageId: string;
    content: string;
    response: string;
  };
};

export async function sendAgentMessage(
  previous: AgentPanelState,
  formData: FormData,
): Promise<AgentPanelState> {
  const ctx = await requireContext();
  const content = String(formData.get("content") ?? "").trim();
  if (content.length < 3)
    return { ...previous, error: "Tell Repd what you need." };
  const parsedPageContext = parseAgentPageContext(formData.get("pageContext"));
  const requestedJobId = String(formData.get("contextJobId") ?? "") || null;
  const pageContext =
    parsedPageContext &&
    (!parsedPageContext.job || parsedPageContext.job.id === requestedJobId)
      ? parsedPageContext
      : null;
  const result = await executeAgentMessage({
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    content,
    threadId: String(formData.get("threadId") ?? "") || previous.threadId,
    contextJobId: requestedJobId,
    pageContext,
  });
  revalidatePath("/");
  revalidatePath("/jobs");
  if (result.jobId) revalidatePath(`/jobs/${result.jobId}`);
  if (result.actionId) revalidatePath(`/actions/${result.actionId}`);
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
    submission: {
      runId: result.runId,
      userMessageId: result.userMessageId,
      assistantMessageId: result.assistantMessageId,
      content,
      response: result.response,
    },
  };
}
