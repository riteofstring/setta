import type {
  Artifact,
  ArtifactMetadata,
  ConversationTurn,
  NarrationEvent,
  TrajectoryEvent,
} from "@generated/backend";

export interface EasyButtonTerminalSummaryRecord {
  id: string;
  status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
  text: string;
  turnId: string;
}

export type EasyButtonTerminalSummaryViewState = "idle" | "working" | "complete";

export function easyButtonTerminalSummary({
  artifactPayloads,
  artifacts,
  latestTurn,
  narration,
  trajectory,
  viewState,
}: {
  artifactPayloads?: readonly Artifact[];
  artifacts: readonly ArtifactMetadata[];
  latestTurn: ConversationTurn | null;
  narration: readonly NarrationEvent[];
  trajectory: readonly TrajectoryEvent[];
  viewState: EasyButtonTerminalSummaryViewState;
}): EasyButtonTerminalSummaryRecord | null {
  if (!latestTurn || viewState !== "complete" || !terminalTurn(latestTurn)) {
    return null;
  }
  const artifactSummary = artifactTerminalSummary(artifacts, artifactPayloads ?? [], latestTurn);
  if (artifactSummary) {
    return artifactSummary;
  }
  const narrated = narratedTerminalSummary(narration, latestTurn);
  if (narrated) {
    return narrated;
  }
  const agentMessage = agentTerminalSummary(trajectory, latestTurn);
  if (agentMessage) {
    return agentMessage;
  }
  return {
    id: `turn:${latestTurn.id}`,
    status: latestTurn.status,
    text: terminalFallbackText(latestTurn),
    turnId: latestTurn.id,
  };
}

export function EasyButtonTerminalSummary({
  summary,
}: {
  summary: EasyButtonTerminalSummaryRecord | null;
}) {
  if (!summary) {
    return null;
  }
  return (
    <p
      className="easy-button-summary"
      data-easy-button-summary-source={summary.id}
      data-easy-button-summary-turn={summary.turnId}
      data-testid="easy-button-summary"
    >
      {summary.status === "completed" ? (
        <>
          <span aria-hidden="true" className="easy-button-summary-ok">
            ✓
          </span>{" "}
        </>
      ) : null}
      <span data-testid="easy-button-summary-text">{summary.text}</span>
    </p>
  );
}

function artifactTerminalSummary(
  artifacts: readonly ArtifactMetadata[],
  artifactPayloads: readonly Artifact[],
  latestTurn: ConversationTurn & {
    status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
  },
): EasyButtonTerminalSummaryRecord | null {
  if (latestTurn.status !== "completed") {
    return null;
  }
  const turnArtifacts = artifacts.filter((artifact) => artifact.turnId === latestTurn.id);
  if (turnArtifacts.length === 0) {
    return null;
  }
  const payloadById = new Map(artifactPayloads.map((artifact) => [artifact.id, artifact]));
  for (let index = turnArtifacts.length - 1; index >= 0; index -= 1) {
    const metadata = turnArtifacts[index];
    const payload = metadata ? payloadById.get(metadata.id) : undefined;
    const headline = payload ? artifactHeadline(payload) : null;
    if (metadata && headline) {
      return {
        id: `artifact:${metadata.id}`,
        status: latestTurn.status,
        text: `Done. ${headline}`,
        turnId: latestTurn.id,
      };
    }
  }
  const artifact = turnArtifacts.at(-1);
  return artifact
    ? {
        id: `artifact:${artifact.id}`,
        status: latestTurn.status,
        text: "Done. I put the result in the artifact.",
        turnId: latestTurn.id,
      }
    : null;
}

function artifactHeadline(artifact: Artifact): string | null {
  switch (artifact.kind) {
    case "table":
      return tableArtifactHeadline(artifact);
    case "markdown":
    case "bar_chart":
    case "file":
      return null;
  }
  const _exhaustive: never = artifact.kind;
  return _exhaustive;
}

function tableArtifactHeadline(artifact: Artifact): string | null {
  const payload = artifact.table;
  if (!payload) {
    return null;
  }
  const categoryIndex = payload.columns.findIndex((column) => column.key === "category");
  const codeIndex = payload.columns.findIndex((column) => column.key === "code");
  if (categoryIndex < 0 || codeIndex < 0) {
    return null;
  }
  const sourceTotal = payload.rows.find(
    (row) => row[categoryIndex]?.trim() === "Source total" && row[codeIndex]?.trim(),
  );
  const total = sourceTotal?.[codeIndex]?.trim();
  return total ? `The source total is ${total} LOC; the full breakdown is in the table.` : null;
}

function narratedTerminalSummary(
  narration: readonly NarrationEvent[],
  latestTurn: ConversationTurn & {
    status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
  },
): EasyButtonTerminalSummaryRecord | null {
  for (let index = narration.length - 1; index >= 0; index -= 1) {
    const event = narration[index];
    if (
      event &&
      event.kind === "final_summary" &&
      event.turnId === latestTurn.id &&
      event.finalSummary
    ) {
      return {
        id: event.id,
        status: latestTurn.status,
        text: event.finalSummary.text,
        turnId: latestTurn.id,
      };
    }
  }
  return null;
}

function agentTerminalSummary(
  trajectory: readonly TrajectoryEvent[],
  latestTurn: ConversationTurn & {
    status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
  },
): EasyButtonTerminalSummaryRecord | null {
  for (let index = trajectory.length - 1; index >= 0; index -= 1) {
    const event = trajectory[index];
    if (
      event &&
      event.turnId === latestTurn.id &&
      event.agentMessageCompleted &&
      event.agentMessageCompleted.text.trim()
    ) {
      return {
        id: event.id,
        status: latestTurn.status,
        text: event.agentMessageCompleted.text,
        turnId: latestTurn.id,
      };
    }
  }
  return null;
}

function terminalFallbackText(
  turn: ConversationTurn & {
    status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
  },
): string {
  switch (turn.status) {
    case "completed":
      return "Work completed.";
    case "cancelled":
      return "Work cancelled.";
    case "failed":
      return turn.error?.message ?? "Work failed.";
  }
}

function terminalTurn(turn: ConversationTurn): turn is ConversationTurn & {
  status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
} {
  return turn.status === "completed" || turn.status === "cancelled" || turn.status === "failed";
}
