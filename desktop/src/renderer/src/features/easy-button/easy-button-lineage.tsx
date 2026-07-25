import { GitBranch, GitFork, Undo2 } from "lucide-react";

import type { BranchDecisionSource, BranchKind, ConversationBranch } from "@generated/backend";

import type { EasyButtonConversationCommands } from "./easy-button-conversation-commands";

export interface EasyButtonLineage {
  decisionSource: BranchDecisionSource;
  forkedAtTurnId: string;
  kind: BranchKind;
  parentConversationId: string;
  parentTitle: string | null;
}

export function conversationLineage(
  branch: ConversationBranch | null,
  parentTitle: string | null,
): EasyButtonLineage | null {
  if (!branch) {
    return null;
  }
  return {
    decisionSource: branch.decisionSource,
    forkedAtTurnId: branch.forkedAtTurnId,
    kind: branch.kind,
    parentConversationId: branch.parentConversationId,
    parentTitle,
  };
}

export function EasyButtonLineageBanner({
  commands,
  lineage,
}: {
  commands: EasyButtonConversationCommands | undefined;
  lineage: EasyButtonLineage;
}) {
  const parentLabel = lineage.parentTitle ?? "parent conversation";
  const delegated = lineage.kind === "child";
  const relationship = delegated ? "Delegated from" : "Durable fork of";
  return (
    <aside
      aria-label={`${relationship} ${parentLabel}`}
      className="easy-button-lineage"
      data-lineage-decision-source={lineage.decisionSource}
      data-lineage-kind={lineage.kind}
      data-lineage-parent-conversation-id={lineage.parentConversationId}
      data-lineage-source-turn-id={lineage.forkedAtTurnId || undefined}
      data-testid="easy-button-lineage"
    >
      {delegated ? <GitBranch aria-hidden="true" /> : <GitFork aria-hidden="true" />}
      <span>
        {relationship} <strong>{parentLabel}</strong>
      </span>
      <button
        data-testid="easy-button-open-parent"
        disabled={!commands?.workspaceCommandsAvailable || commands.pending}
        onClick={() =>
          commands?.presentRelatedConversation(lineage.parentConversationId, lineage.parentTitle)
        }
        type="button"
      >
        <Undo2 aria-hidden="true" />
        Open parent
      </button>
    </aside>
  );
}
