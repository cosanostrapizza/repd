import { AgentPanel } from "@/components/agent/agent-panel";
import { requireContext } from "@/lib/auth";
import { getAgentConversation } from "@/lib/agent-workspace";

export default async function AgentPage() {
  const ctx = await requireContext();
  const conversation = await getAgentConversation(ctx.workspaceId);
  return (
    <div className="content agent-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Universal workspace</p>
          <h1>Ask Repd</h1>
          <p className="muted">
            One conversation, grounded in the same jobs, actions, dependencies,
            and approvals as the structured workspace.
          </p>
        </div>
      </div>
      <AgentPanel
        expanded
        initialThreadId={conversation.thread?.id ?? undefined}
        initialMessages={conversation.messages.slice(-12).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          currentOutcome: message.currentOutcome,
        }))}
      />
    </div>
  );
}
