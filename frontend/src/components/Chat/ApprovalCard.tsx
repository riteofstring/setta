import {
  BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME,
  BrailleSpinner,
} from "components/Utils/BrailleSpinner";
import { useEffect, useState } from "react";
import { IoMdCheckmark } from "react-icons/io";
import { MdErrorOutline } from "react-icons/md";
import { PiWrenchFill } from "react-icons/pi";
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
  const [showDetails, setShowDetails] = useState(false);
  const approved = resolveApprovalStatus(toolResult);
  const { decisionPending, decisionError, submitApproval } =
    useApprovalDecision(toolCallId, approved);

  const displayName = toolName?.trim() || TOOL_LABEL_FALLBACK;
  const detailText = formatValue(input);

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
        {buildStatusIcon(approved, isStreaming)}
      </div>
      <ApprovalDecisionSection
        approved={approved}
        decisionError={decisionError}
        decisionPending={decisionPending}
        onDecide={submitApproval}
      />
      <ApprovalDetailsSection
        detailText={detailText}
        showDetails={showDetails}
        onToggle={() => setShowDetails((current) => !current)}
      />
    </div>
  );
}

function useApprovalDecision(
  toolCallId: string,
  approved: boolean | undefined,
): {
  decisionPending: boolean;
  decisionError: string | null;
  submitApproval: (nextApproved: boolean) => Promise<void>;
} {
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    if (approved !== undefined) {
      setDecisionPending(false);
      setDecisionError(null);
    }
  }, [approved]);

  async function submitApproval(nextApproved: boolean): Promise<void> {
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
      setDecisionError(resolveApprovalErrorMessage(err));
    }
  }

  return { decisionPending, decisionError, submitApproval };
}

function ApprovalDecisionSection({
  approved,
  decisionError,
  decisionPending,
  onDecide,
}: {
  approved: boolean | undefined;
  decisionError: string | null;
  decisionPending: boolean;
  onDecide: (nextApproved: boolean) => Promise<void>;
}) {
  if (approved === undefined) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-setta-100 bg-setta-50 px-3 py-2 dark:border-setta-800 dark:bg-setta-950/40">
        {decisionError ? (
          <span className="mr-auto text-xs text-red-500">{decisionError}</span>
        ) : (
          <span className="mr-auto text-xs text-setta-500">
            Approve this action?
          </span>
        )}
        <button
          className="rounded-md bg-setta-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-setta-800 disabled:opacity-60"
          onClick={() => onDecide(false)}
          disabled={decisionPending}
        >
          Deny
        </button>
        <button
          className="rounded-md bg-blue-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-600 disabled:opacity-60"
          onClick={() => onDecide(true)}
          disabled={decisionPending}
        >
          Approve
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-setta-100 bg-setta-50 px-3 py-2 text-xs text-setta-500 dark:border-setta-800 dark:bg-setta-950/40">
      {approved ? "Approved" : "Denied"}
    </div>
  );
}

function ApprovalDetailsSection({
  detailText,
  showDetails,
  onToggle,
}: {
  detailText: string | null;
  showDetails: boolean;
  onToggle: () => void;
}) {
  if (!detailText) {
    return null;
  }

  return (
    <div className="border-t border-setta-100 dark:border-setta-800">
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-setta-600 transition hover:bg-setta-100 dark:text-setta-300 dark:hover:bg-setta-800/60"
        onClick={onToggle}
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
  );
}

function resolveApprovalStatus(
  toolResult: ToolChatMessage | undefined,
): boolean | undefined {
  return toolResult ? !toolResult.is_error : undefined;
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
      className={`${BRAILLE_SPINNER_RUNTIME_SIZE_CLASS_NAME} ${
        isStreaming
          ? "text-setta-400 dark:text-setta-300/70"
          : "text-setta-300/70"
      }`}
    />
  );
}

function resolveApprovalErrorMessage(err: unknown): string {
  return err instanceof Error
    ? err.message
    : "Failed to send approval response.";
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
