import type { SemanticEvidenceAnchor } from "@generated/backend";

import { WorkflowDetailsRows, WorkflowDetailsSection } from "./workflow-node-details-components";
import { shortIdentifier } from "./workflow-node-details-helpers";

export function SemanticSourceLinkSection({ evidence }: { evidence: SemanticEvidenceAnchor[] }) {
  if (evidence.length === 0) {
    return null;
  }
  return (
    <WorkflowDetailsSection title="Source Links">
      <div className="space-y-2" data-testid="semantic-source-links">
        {evidence.map((anchor) => (
          <SemanticSourceLinkRecord anchor={anchor} key={anchor.id} />
        ))}
      </div>
    </WorkflowDetailsSection>
  );
}

function SemanticSourceLinkRecord({ anchor }: { anchor: SemanticEvidenceAnchor }) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs">
      <WorkflowDetailsRows
        rows={[
          { label: "Source", value: anchor.sourceKind },
          { label: "Identity", value: sourceLinkIdentity(anchor) },
          { label: "Workflow", value: sourceLinkWorkflowText(anchor) },
          { label: "Chat", value: sourceLinkChatText(anchor) },
          { label: "Run item", value: shortIdentifier(anchor.runItemId) },
          { label: "Path", value: evidencePath(anchor) },
          { label: "Excerpt", value: anchor.text || anchor.summary },
          { label: "Hash", value: anchor.contentHash },
        ]}
      />
    </div>
  );
}

function sourceLinkIdentity(anchor: SemanticEvidenceAnchor) {
  return shortIdentifier(anchor.sourceId || anchor.uri || anchor.path || anchor.id);
}

function sourceLinkWorkflowText(anchor: SemanticEvidenceAnchor) {
  const parts = [
    ["definition", anchor.workflowDefinitionId],
    ["execution", anchor.workflowExecutionId],
    ["node", anchor.workflowNodeId],
    ["node execution", anchor.workflowNodeExecutionId],
  ] satisfies [string, string][];
  return parts
    .filter(([, value]) => value !== "")
    .map(([label, value]) => `${label}: ${shortIdentifier(value)}`)
    .join("; ");
}

function sourceLinkChatText(anchor: SemanticEvidenceAnchor) {
  const parts = [
    ["conversation", anchor.chatConversationId],
    ["run", anchor.chatRunId],
    ["message", anchor.chatMessageId],
  ] satisfies [string, string][];
  return parts
    .filter(([, value]) => value !== "")
    .map(([label, value]) => `${label}: ${shortIdentifier(value)}`)
    .join("; ");
}

function evidencePath(anchor: SemanticEvidenceAnchor) {
  if (anchor.path === "") {
    return "";
  }
  if (anchor.rangeStart === 0 && anchor.rangeEnd === 0) {
    return anchor.path;
  }
  return `${anchor.path}:${anchor.rangeStart}-${anchor.rangeEnd}`;
}
