import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { useMemo, type ComponentProps, type RefCallback } from "react";
import { IoMdArrowRoundBack } from "react-icons/io";
import { MdAdd, MdChevronLeft, MdChevronRight } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import type { ProjectChatAuxView } from "state/definitions";

import { PlanModeBadge } from "components/Chat/PlanModeBadge";
import { ProjectChatSettingsPopover } from "./projectChatSettingsPopover";
import {
  buildProjectChatAuxTabs,
  getProjectChatReturnTooltipContent,
  getProjectChatThreadsTooltipContent,
  PROJECT_CHAT_CONTENT_SHELL_CLASS,
} from "./projectChatSurfaceViewModel";

type ProjectChatSettingsPopoverProps = ComponentProps<
  typeof ProjectChatSettingsPopover
>;

export function ProjectChatSurfaceChrome({
  showInlineThreads,
  handleInlineThreadsHeaderShellRef,
  handleInlineThreadsHeaderHostRef,
  resolvedInlineThreadsWidth,
  projectChatAuxView,
  isAuxView,
  onReturnToChat,
  onNewChatClick,
  onToggleThreads,
  viewThreads,
  showPlanModeBadge,
  settingsPopoverProps,
  conversationFilterText,
  onConversationFilterTextChange,
  hasConversationSearchTerms,
  conversationSearchCounterText,
  conversationSearchMatchCount,
  onStepConversationSearch,
  onOpenSkillsAuxView,
  onOpenMcpAuxView,
  onOpenSlashCommandsAuxView,
  onOpenProjectSettingsAuxView,
}: {
  showInlineThreads: boolean;
  handleInlineThreadsHeaderShellRef: RefCallback<HTMLDivElement>;
  handleInlineThreadsHeaderHostRef: RefCallback<HTMLDivElement>;
  resolvedInlineThreadsWidth: number;
  projectChatAuxView: ProjectChatAuxView;
  isAuxView: boolean;
  onReturnToChat: () => void;
  onNewChatClick: () => void;
  onToggleThreads: () => void;
  viewThreads: boolean;
  showPlanModeBadge: boolean;
  settingsPopoverProps: ProjectChatSettingsPopoverProps;
  conversationFilterText: string;
  onConversationFilterTextChange: (value: string) => void;
  hasConversationSearchTerms: boolean;
  conversationSearchCounterText: string;
  conversationSearchMatchCount: number;
  onStepConversationSearch: (direction: "previous" | "next") => void;
  onOpenSkillsAuxView: () => void;
  onOpenMcpAuxView: () => void;
  onOpenSlashCommandsAuxView: () => void;
  onOpenProjectSettingsAuxView: () => void;
}) {
  const returnToChatTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "Return to chat",
        content: getProjectChatReturnTooltipContent(projectChatAuxView),
      }),
    [projectChatAuxView],
  );
  const newChatTooltipHandlers = useMemo(
    () =>
      getFloatingBoxHandlers({
        title: "New chat",
        content: "Start a new conversation in the selected group.",
      }),
    [],
  );
  const threadsTooltipHandlers = useMemo(() => {
    const showingInlineThreads = viewThreads && showInlineThreads;
    return getFloatingBoxHandlers({
      title: showingInlineThreads ? "Hide threads" : "Threads",
      content: getProjectChatThreadsTooltipContent(showingInlineThreads),
    });
  }, [showInlineThreads, viewThreads]);
  const auxTabs = useMemo(
    () => buildProjectChatAuxTabs(projectChatAuxView),
    [projectChatAuxView],
  );
  const auxViewHandlers = useMemo(
    () => ({
      skills: onOpenSkillsAuxView,
      mcp: onOpenMcpAuxView,
      slash_commands: onOpenSlashCommandsAuxView,
      ai_settings: onOpenProjectSettingsAuxView,
    }),
    [
      onOpenMcpAuxView,
      onOpenProjectSettingsAuxView,
      onOpenSkillsAuxView,
      onOpenSlashCommandsAuxView,
    ],
  );

  return (
    <nav className="flex flex-col border-b border-setta-100 dark:border-setta-800 [&_button]:cursor-pointer">
      <div className="flex w-full min-w-0 items-stretch">
        {showInlineThreads ? (
          <div
            ref={handleInlineThreadsHeaderShellRef}
            className="shrink-0 overflow-hidden border-r border-setta-200 pb-2 dark:border-setta-800"
            style={{ width: `${resolvedInlineThreadsWidth}px` }}
          >
            <div
              ref={handleInlineThreadsHeaderHostRef}
              className="h-full w-full min-w-0 @container"
              data-testid="project-chat-inline-threads-header-host"
            />
          </div>
        ) : null}
        <div
          className={`min-w-0 flex-1 pb-2 @container ${showInlineThreads ? "pl-2" : ""}`}
        >
          <div className={PROJECT_CHAT_CONTENT_SHELL_CLASS}>
            <div className="mt-2 grid w-full min-w-0 items-center gap-2 [grid-template-columns:auto_auto] @[16.25rem]:[grid-template-columns:auto_minmax(0,1fr)_auto]">
              <div className="flex min-w-0 items-center gap-2">
                {isAuxView ? (
                  <button
                    className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
                    onClick={onReturnToChat}
                    aria-label="Return to chat"
                    {...returnToChatTooltipHandlers}
                  >
                    <IoMdArrowRoundBack />
                    <span className="hidden @[46rem]:block">
                      Return to chat
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
                      aria-label="New Chat"
                      onClick={onNewChatClick}
                      {...newChatTooltipHandlers}
                    >
                      <MdAdd size={15} />
                      <span className="hidden @[46rem]:block">New</span>
                    </button>
                    <button
                      className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
                      onClick={onToggleThreads}
                      aria-label="View Threads"
                      {...threadsTooltipHandlers}
                    >
                      <RiChatHistoryLine size={15} />
                      <span className="hidden @[46rem]:block">
                        {viewThreads && showInlineThreads
                          ? "Hide Threads"
                          : "Threads"}
                      </span>
                    </button>
                  </>
                )}
              </div>
              {projectChatAuxView !== "none" ? (
                <div
                  className="min-w-0 overflow-hidden @[16.25rem]:col-start-2"
                  data-testid="project-chat-aux-tabs"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    {auxTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        data-testid={tab.testId}
                        aria-current={tab.active ? "page" : undefined}
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                          tab.active
                            ? "bg-setta-100 text-setta-900 dark:bg-setta-800 dark:text-setta-100"
                            : "text-setta-500 hover:bg-setta-100 hover:text-setta-800 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                        }`}
                        onClick={auxViewHandlers[tab.id]}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {!isAuxView ? (
                <div className="flex items-center justify-self-end @[16.25rem]:col-start-3">
                  {showPlanModeBadge ? <PlanModeBadge /> : null}
                  <ProjectChatSettingsPopover {...settingsPopoverProps} />
                </div>
              ) : null}
              {!isAuxView ? (
                <search
                  className="nodrag relative col-span-2 row-start-2 flex min-w-0 items-center @[16.25rem]:col-span-1 @[16.25rem]:col-start-2 @[16.25rem]:row-start-1 @[44rem]:min-w-[11rem]"
                  data-testid="project-chat-conversation-filter"
                >
                  <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 pl-1">
                    <i className="gg-sort-az !scale-[0.68] text-setta-300 dark:text-setta-600" />
                  </span>
                  <input
                    type="text"
                    aria-label="Search in conversation"
                    data-testid="project-chat-conversation-filter-input"
                    value={conversationFilterText}
                    onChange={(event) => {
                      onConversationFilterTextChange(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onStepConversationSearch(
                          event.shiftKey ? "previous" : "next",
                        );
                        return;
                      }
                      if (event.key !== "Escape") {
                        return;
                      }
                      event.currentTarget.blur();
                    }}
                    placeholder="Search in conversation"
                    className={`w-full min-w-0 flex-1 cursor-text truncate border-solid border-transparent bg-transparent py-1 pl-5 text-xs text-setta-700 placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:border-blue-300 dark:text-setta-300 dark:placeholder-setta-600 ${
                      hasConversationSearchTerms ? "pr-16" : "pr-2"
                    }`}
                  />
                  {hasConversationSearchTerms ? (
                    <div className="absolute right-0.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5">
                      <span className="min-w-[34px] px-0.5 text-center text-[10px] text-setta-400 dark:text-setta-500">
                        {conversationSearchCounterText}
                      </span>
                      <button
                        type="button"
                        aria-label="Previous conversation match"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                        onClick={() => {
                          onStepConversationSearch("previous");
                        }}
                        disabled={conversationSearchMatchCount === 0}
                      >
                        <MdChevronLeft />
                      </button>
                      <button
                        type="button"
                        aria-label="Next conversation match"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                        onClick={() => {
                          onStepConversationSearch("next");
                        }}
                        disabled={conversationSearchMatchCount === 0}
                      >
                        <MdChevronRight />
                      </button>
                    </div>
                  ) : null}
                </search>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
