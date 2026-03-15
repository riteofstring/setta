import { FiCopy, FiEdit3, FiRotateCcw } from "react-icons/fi";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import type { ChatMessageBranchInfo } from "state/actions/aiBranches";

export function ChatMessageActions({
  onCopy,
  onRedo,
  showRedo,
  redoDisabled,
  redoDisabledReason,
  showEdit,
  editDisabled,
  editDisabledReason,
  onEdit,
  branchInfo,
  onBranchSwitch,
}: {
  onCopy: () => void;
  onRedo?: () => void;
  showRedo: boolean;
  redoDisabled: boolean;
  redoDisabledReason: string | null;
  showEdit: boolean;
  editDisabled: boolean;
  editDisabledReason: string | null;
  onEdit?: (bubbleWidthPx?: number) => void;
  branchInfo?: ChatMessageBranchInfo;
  onBranchSwitch?: (nextChatId: string) => void;
}) {
  const branchCount = branchInfo?.branchChatIds.length ?? 0;
  const activeIndex = branchInfo?.activeIndex ?? 0;
  const hasBranches = branchCount > 1 && Boolean(onBranchSwitch);
  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < branchCount - 1;

  return (
    <div
      className="pointer-events-none relative z-[1] inline-flex flex-col items-center gap-1 rounded-md border border-setta-200/90 bg-setta-100/95 px-1 py-0.5 text-setta-500 opacity-0 shadow-sm transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 @[40rem]/chat-message:flex-row dark:border-setta-700/90 dark:bg-setta-925/95 dark:text-setta-300"
      data-chat-message-actions="true"
    >
      <button
        type="button"
        aria-label="Copy message"
        className="inline-flex h-5 w-5 cursor-pointer items-center justify-center text-[11px] transition-colors hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 dark:hover:text-setta-100"
        onClick={onCopy}
      >
        <FiCopy />
      </button>
      {showRedo ? (
        <button
          type="button"
          aria-label="Redo response"
          className="inline-flex h-5 w-5 cursor-pointer items-center justify-center text-[11px] transition-colors hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-setta-100"
          onClick={() => {
            onRedo?.();
          }}
          disabled={redoDisabled}
          title={redoDisabledReason ?? undefined}
        >
          <FiRotateCcw />
        </button>
      ) : null}
      {showEdit ? (
        <button
          type="button"
          aria-label="Edit message"
          className="inline-flex h-5 w-5 cursor-pointer items-center justify-center text-[11px] transition-colors hover:text-setta-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-setta-400 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-setta-100"
          onClick={(event) => {
            const bubble = event.currentTarget.closest(
              '[data-chat-user-bubble="true"]',
            );
            const bubbleWidthPx = bubble
              ? bubble.getBoundingClientRect().width
              : undefined;
            onEdit?.(bubbleWidthPx);
          }}
          disabled={editDisabled}
          title={editDisabledReason ?? undefined}
        >
          <FiEdit3 />
        </button>
      ) : null}
      {hasBranches ? (
        <div className="ml-0.5 inline-flex items-center gap-0.5 rounded-sm border border-setta-200 px-0.5 py-0.5 text-[9px] font-medium tabular-nums text-setta-500 dark:border-setta-700 dark:text-setta-300">
          <button
            type="button"
            aria-label="Previous branch"
            className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] transition-colors hover:bg-setta-200/80 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-setta-700 dark:hover:text-setta-100"
            onClick={() => {
              if (!branchInfo || !onBranchSwitch) {
                return;
              }
              const nextId = branchInfo.branchChatIds[activeIndex - 1];
              if (nextId) {
                onBranchSwitch(nextId);
              }
            }}
            disabled={!canGoPrevious}
          >
            <MdChevronLeft />
          </button>
          <span className="min-w-[30px] px-1 text-center">
            {activeIndex + 1}/{branchCount}
          </span>
          <button
            type="button"
            aria-label="Next branch"
            className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] transition-colors hover:bg-setta-200/80 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-setta-700 dark:hover:text-setta-100"
            onClick={() => {
              if (!branchInfo || !onBranchSwitch) {
                return;
              }
              const nextId = branchInfo.branchChatIds[activeIndex + 1];
              if (nextId) {
                onBranchSwitch(nextId);
              }
            }}
            disabled={!canGoNext}
          >
            <MdChevronRight />
          </button>
        </div>
      ) : null}
    </div>
  );
}
