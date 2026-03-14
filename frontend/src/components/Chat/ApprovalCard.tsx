import { useEffect, useState } from "react";
import { IoMdCheckmark } from "react-icons/io";
import { MdErrorOutline } from "react-icons/md";
import { PiWrenchFill } from "react-icons/pi";
import { BrailleSpinner } from "components/Utils/BrailleSpinner";
import { respondExternalAgentApproval } from "state/actions/ai";
import { ToolChatMessage } from "utils/generatedTypes";

const TOOL_LABEL_FALLBACK = "Approval request";

type ApprovalCardProps = {
  toolCallId: string;
  toolName?: string | null;
  input?: unknown;
  toolType?: string | null;
  toolResult?: ToolChatMessage;
  isStreaming: boolean;
};

export function ApprovalCard({
  toolCallId,
  toolName,
  input,
  toolType,
  toolResult,
  isStreaming,
}: ApprovalCardProps) {
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const approved = toolResult ? !toolResult.is_error : undefined;

  useEffect(() => {
    if (approved !== undefined) {
      setDecisionPending(false);
      setDecisionError(null);
    }
  }, [approved]);

  const handleApproval = async (nextApproved: boolean) => {
    if (decisionPending || approved !== undefined) {
      return;
    }
    setDecisionPending(true);
    setDecisionError(null);
    try {
      const ok = await respondExternalAgentApproval(toolCallId, nextApproved);
      if (!ok) {
        setDecisionPending(false);
        setDecisionError("Failed to send approval response.");
      }
    } catch (err) {
      setDecisionPending(false);
      setDecisionError(
        err instanceof Error
          ? err.message
          : "Failed to send approval response.",
      );
    }
  };

  const displayName = toolName?.trim() || TOOL_LABEL_FALLBACK;
  const detailText = formatValue(input);
  const showActions = approved === undefined;
  const statusIcon = buildStatusIcon(approved, isStreaming);

  return (
    <div className="my-1 overflow-hidden rounded-md border border-setta-200/70 bg-white shadow-sm dark:border-setta-800 dark:bg-setta-900">
      <div className="flex items-center gap-2 px-3 py-2">
        <PiWrenchFill size={16} className="text-setta-400" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-semibold text-setta-700 dark:text-setta-200">
            {displayName}
          </span>
          {toolType ? (
            <span className="text-[10px] uppercase tracking-wide text-setta-400">
              {toolType}
            </span>
          ) : null}
        </div>
        {statusIcon}
      </div>
      {showActions ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-setta-100 bg-setta-50 px-3 py-2 dark:border-setta-800 dark:bg-setta-950/40">
          {decisionError ? (
            <span className="mr-auto text-xs text-red-500">
              {decisionError}
            </span>
          ) : (
            <span className="mr-auto text-xs text-setta-500">
              Approve this action?
            </span>
          )}
          <button
            className="rounded-md bg-setta-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-setta-800 disabled:opacity-60"
            onClick={() => handleApproval(false)}
            disabled={decisionPending}
          >
            Deny
          </button>
          <button
            className="rounded-md bg-blue-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
            onClick={() => handleApproval(true)}
            disabled={decisionPending}
          >
            Approve
          </button>
        </div>
      ) : (
        <div className="border-t border-setta-100 bg-setta-50 px-3 py-2 text-xs text-setta-500 dark:border-setta-800 dark:bg-setta-950/40">
          {approved ? "Approved" : "Denied"}
        </div>
      )}
      {detailText ? (
        <div className="border-t border-setta-100 dark:border-setta-800">
          <button
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-setta-600 transition hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800/60"
            onClick={() => setShowDetails((current) => !current)}
            type="button"
          >
            <span>Details</span>
            <span className="text-[10px] text-setta-400">
              {showDetails ? "Hide" : "Show"}
            </span>
          </button>
          {showDetails ? (
            <pre className="m-0 max-h-64 overflow-auto bg-setta-50 px-3 py-2 text-xs text-setta-600 dark:bg-setta-950/70 dark:text-setta-200">
              {detailText}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function buildStatusIcon(approved: boolean | undefined, isStreaming: boolean) {
  if (approved === true) {
    return <IoMdCheckmark className="text-emerald-500" />;
  }
  if (approved === false) {
    return <MdErrorOutline className="text-red-500" />;
  }
  return (
    <BrailleSpinner
      className={`text-[11px] ${
        isStreaming
          ? "text-setta-400 dark:text-setta-300/70"
          : "text-setta-300/70"
      }`}
    />
  );
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : null;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
