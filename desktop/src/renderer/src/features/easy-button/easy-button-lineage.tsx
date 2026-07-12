import { GitFork, Undo2 } from "lucide-react";

import type { BranchDecisionSource, ConversationBranch } from "@generated/backend";

import type { EasyButtonConversationCommands } from "./easy-button-conversation-commands";

export interface EasyButtonForkLineage {
  decisionSource: BranchDecisionSource;
  forkedAtTurnId: string;
  parentConversationId: string;
  parentTitle: string | null;
}

export function forkLineage(
  branch: ConversationBranch | null,
  parentTitle: string | null,
): EasyButtonForkLineage | null {
  if (!branch) {
    return null;
  }
  return {
    decisionSource: branch.decisionSource,
    forkedAtTurnId: branch.forkedAtTurnId,
    parentConversationId: branch.parentConversationId,
    parentTitle,
  };
}

export function EasyButtonForkLineageBanner({
  commands,
  lineage,
}: {
  commands: EasyButtonConversationCommands | undefined;
  lineage: EasyButtonForkLineage;
}) {
  const parentLabel = lineage.parentTitle ?? "parent conversation";
  return (
    <aside
      aria-label={`Durable fork of ${parentLabel}`}
      className="easy-button-lineage"
      data-fork-decision-source={lineage.decisionSource}
      data-fork-parent-conversation-id={lineage.parentConversationId}
      data-fork-source-turn-id={lineage.forkedAtTurnId}
      data-testid="easy-button-fork-lineage"
    >
      <GitFork aria-hidden="true" />
      <span>
        Durable fork of <strong>{parentLabel}</strong>
      </span>
      <button
        data-testid="easy-button-open-parent"
        disabled={!commands?.available || commands.pending}
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
