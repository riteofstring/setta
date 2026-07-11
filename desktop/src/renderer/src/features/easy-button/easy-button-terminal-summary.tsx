import type { ConversationTurn } from "@generated/backend";

export interface EasyButtonTerminalSummaryRecord {
  id: string;
  status: Extract<ConversationTurn["status"], "completed" | "cancelled" | "failed">;
  text: string;
  turnId: string;
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
