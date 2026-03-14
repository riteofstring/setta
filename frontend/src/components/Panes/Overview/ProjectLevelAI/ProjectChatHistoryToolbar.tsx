import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useMemo } from "react";
import {
  MdAdd,
  MdCategory,
  MdChevronLeft,
  MdChevronRight,
  MdRestore,
} from "react-icons/md";

export function ProjectChatHistoryToolbar({
  masterSearchInput,
  hasMasterSearch,
  masterSearchCounterText,
  masterSearchMatchCount,
  showThreadAgentBadges,
  canUndoDeletedThreadOrGroup,
  onMasterSearchInputChange,
  onStepMasterSearch,
  onToggleThreadAgentBadges,
  onRestoreDeletedThreadOrGroup,
  onCreateGroup,
}: {
  masterSearchInput: string;
  hasMasterSearch: boolean;
  masterSearchCounterText: string;
  masterSearchMatchCount: number;
  showThreadAgentBadges: boolean;
  canUndoDeletedThreadOrGroup: boolean;
  onMasterSearchInputChange: (value: string) => void;
  onStepMasterSearch: (direction: "previous" | "next") => void;
  onToggleThreadAgentBadges: () => void;
  onRestoreDeletedThreadOrGroup: () => void;
  onCreateGroup: () => void;
}) {
  const newGroupTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "New group",
        content: "Create a new thread group and rename it.",
      }),
    [],
  );
  const agentBadgeToggleTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: showThreadAgentBadges
          ? "Hide thread badges"
          : "Show thread badges",
        content: showThreadAgentBadges
          ? "Hide the per-thread engine badge labels."
          : "Show the per-thread engine badge labels.",
      }),
    [showThreadAgentBadges],
  );
  const restoreThreadMutationTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Undo last thread delete",
        content:
          "Undo the most recently deleted thread or thread group in this project.",
      }),
    [],
  );

  return (
    <div
      className="flex w-full min-w-0 items-center gap-2 whitespace-nowrap @container"
      data-testid="project-chat-threads-toolbar"
    >
      <div
        role="search"
        className="relative flex min-w-0 flex-1 items-center"
        data-testid="project-chat-master-search"
      >
        <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 pl-1">
          <i className="gg-sort-az !scale-[0.68] text-setta-300 dark:text-setta-600" />
        </span>
        <input
          type="text"
          aria-label="Search conversations"
          data-testid="project-chat-master-search-input"
          value={masterSearchInput}
          onChange={(event) => {
            onMasterSearchInputChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") {
              return;
            }
            event.currentTarget.blur();
          }}
          placeholder="Search conversations"
          className={`w-full min-w-0 flex-1 cursor-text truncate border-solid border-transparent bg-transparent py-1 pl-5 text-xs text-setta-700 placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:text-setta-300 dark:placeholder-setta-600 ${
            hasMasterSearch ? "pr-16" : "pr-2"
          }`}
        />
        {hasMasterSearch ? (
          <div className="absolute right-0.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5">
            <span className="min-w-[34px] px-0.5 text-center text-[10px] text-setta-400 dark:text-setta-500">
              {masterSearchCounterText}
            </span>
            <button
              type="button"
              aria-label="Previous conversation result"
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
              onClick={() => onStepMasterSearch("previous")}
              disabled={masterSearchMatchCount === 0}
            >
              <MdChevronLeft />
            </button>
            <button
              type="button"
              aria-label="Next conversation result"
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
              onClick={() => onStepMasterSearch("next")}
              disabled={masterSearchMatchCount === 0}
            >
              <MdChevronRight />
            </button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="nodrag relative inline-flex h-full shrink-0 cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
        onClick={onToggleThreadAgentBadges}
        aria-label={
          showThreadAgentBadges
            ? "Hide thread engine badges"
            : "Show thread engine badges"
        }
        aria-pressed={showThreadAgentBadges}
        data-testid="project-chat-thread-agent-badge-toggle-button"
        {...agentBadgeToggleTooltipHandlers}
      >
        <MdCategory size={12} />
      </button>
      <button
        type="button"
        className="nodrag relative inline-flex h-full shrink-0 cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 disabled:cursor-not-allowed disabled:text-setta-400 disabled:opacity-60 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent dark:disabled:text-setta-500"
        aria-label="Undo Delete"
        onClick={onRestoreDeletedThreadOrGroup}
        disabled={!canUndoDeletedThreadOrGroup}
        data-testid="project-chat-thread-restore-last-delete-button"
        {...restoreThreadMutationTooltipHandlers}
      >
        <MdRestore size={14} />
        <span className="hidden @[26rem]:inline">Undo Delete</span>
      </button>
      <button
        type="button"
        className="nodrag relative inline-flex h-full shrink-0 cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
        aria-label="New Group"
        onClick={onCreateGroup}
        data-testid="project-chat-thread-group-new-group-button"
        {...newGroupTooltipHandlers}
      >
        <MdAdd size={15} />
        <span className="hidden @[20rem]:inline">New Group</span>
      </button>
    </div>
  );
}
