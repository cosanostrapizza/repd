import { WorkspaceShell } from "@/components/shell/workspace-shell";
import { requireContext } from "@/lib/auth";
import { getAgentConversation } from "@/lib/agent-workspace";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireContext();
  const conversation = await getAgentConversation(ctx.workspaceId);
  const initials = ctx.user.name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
  return (
    <WorkspaceShell
      workspaceName={ctx.workspace.name}
      userName={ctx.user.name}
      role={ctx.role}
      initials={initials}
      initialThreadId={conversation.thread?.id ?? undefined}
      initialMessages={conversation.messages.slice(-8).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        currentOutcome: message.currentOutcome,
      }))}
    >
      {children}
    </WorkspaceShell>
  );
}
