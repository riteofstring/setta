import { PlanModeBadge } from "components/Chat/PlanModeBadge";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import { Resizable } from "re-resizable";
import {
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { IoMdArrowRoundBack } from "react-icons/io";
import { MdAdd, MdChevronLeft, MdChevronRight } from "react-icons/md";
import { RiChatHistoryLine } from "react-icons/ri";
import { ProjectChatCore } from "../ProjectChatCore";
import { type ProjectChatCoreProps } from "../ProjectChatCore/types";
import { ProjectChatHistory } from "../ProjectChatHistory";
import {
  INLINE_THREADS_MIN_WIDTH_PX,
  PROJECT_CHAT_CONTENT_SHELL_CLASS,
} from "./constants";
import {
  ProjectAISettingsPopover,
  type ProjectAISettingsPopoverProps,
} from "./ProjectAISettingsPopover";

type TooltipHandlers = ReturnType<typeof getFloatingBoxHandlers>;

type ProjectChatAuxTab = {
  id: string;
  label: string;
  testId: string;
  active: boolean;
  onClick: () => void;
};

export type ProjectChatHistoryBaseProps = Omit<
  ComponentProps<typeof ProjectChatHistory>,
  "closeOnSelect" | "headerPortalTarget" | "inline"
>;

type ProjectChatSurfaceLayoutProps = {
  ready: boolean;
  showInlineThreads: boolean;
  resolvedInlineThreadsWidth: number;
  inlineThreadsMaxWidth: number;
  canResizeInlineThreads: boolean;
  inlineThreadsHeaderPortalTarget: HTMLDivElement | null;
  handleChatContainerRef: (node: HTMLDivElement | null) => void;
  handleInlineThreadsHeaderShellRef: (node: HTMLDivElement | null) => void;
  handleInlineThreadsHeaderHostRef: (node: HTMLDivElement | null) => void;
  handleInlineThreadsResizableColumnRef: (node: HTMLDivElement | null) => void;
  syncInlineThreadsHeaderWidth: (nextWidth: number) => void;
  updateInlineThreadsWidth: (nextWidth: number) => void;
  showReturnOnlyNav: boolean;
  returnToChatTooltipHandlers: TooltipHandlers;
  handleReturnToChat: () => void;
  handleNewChatClick: () => void;
  newChatTooltipHandlers: TooltipHandlers;
  handleToggleThreads: () => void;
  threadsTooltipHandlers: TooltipHandlers;
  viewThreads: boolean;
  showAuxTabs: boolean;
  auxTabs: readonly ProjectChatAuxTab[];
  isAuxView: boolean;
  showPlanModeBadge: boolean;
  settingsPopoverProps: ProjectAISettingsPopoverProps;
  showConversationFilter: boolean;
  conversationFilterText: string;
  setConversationFilterText: Dispatch<SetStateAction<string>>;
  hasConversationSearchTerms: boolean;
  conversationSearchCounterText: string;
  conversationSearchMatchCount: number;
  handleStepConversationSearch: (direction: "previous" | "next") => void;
  engineSwitchContinuationBannerText: string | null;
  handleContinueInNewThread: () => void;
  auxViewContent: ReactNode;
  chatHistoryProps: ProjectChatHistoryBaseProps;
  chatCoreProps: ProjectChatCoreProps;
};

// eslint-disable-next-line complexity
export function ProjectChatSurfaceLayout({
  ready,
  showInlineThreads,
  resolvedInlineThreadsWidth,
  inlineThreadsMaxWidth,
  canResizeInlineThreads,
  inlineThreadsHeaderPortalTarget,
  handleChatContainerRef,
  handleInlineThreadsHeaderShellRef,
  handleInlineThreadsHeaderHostRef,
  handleInlineThreadsResizableColumnRef,
  syncInlineThreadsHeaderWidth,
  updateInlineThreadsWidth,
  showReturnOnlyNav,
  returnToChatTooltipHandlers,
  handleReturnToChat,
  handleNewChatClick,
  newChatTooltipHandlers,
  handleToggleThreads,
  threadsTooltipHandlers,
  viewThreads,
  showAuxTabs,
  auxTabs,
  isAuxView,
  showPlanModeBadge,
  settingsPopoverProps,
  showConversationFilter,
  conversationFilterText,
  setConversationFilterText,
  hasConversationSearchTerms,
  conversationSearchCounterText,
  conversationSearchMatchCount,
  handleStepConversationSearch,
  engineSwitchContinuationBannerText,
  handleContinueInNewThread,
  auxViewContent,
  chatHistoryProps,
  chatCoreProps,
}: ProjectChatSurfaceLayoutProps) {
  if (!ready) {
    return null;
  }

  return (
    <div
      ref={handleChatContainerRef}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden @container"
    >
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
                  {showReturnOnlyNav ? (
                    <button
                      className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
                      onClick={handleReturnToChat}
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
                        onClick={handleNewChatClick}
                        {...newChatTooltipHandlers}
                      >
                        <MdAdd size={15} />
                        <span className="hidden @[46rem]:block">New</span>
                      </button>
                      <button
                        className="nodrag relative inline-flex h-full cursor-pointer select-none items-center gap-1 rounded-md bg-transparent px-1 text-xs font-semibold text-setta-600 transition-colors hover:text-setta-900 focus-visible:ring-2 active:!bg-blue-100 dark:text-setta-300 dark:hover:bg-transparent dark:hover:text-white active:dark:!bg-transparent"
                        onClick={handleToggleThreads}
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
                {showAuxTabs ? (
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
                          onClick={tab.onClick}
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
                    <ProjectAISettingsPopover {...settingsPopoverProps} />
                  </div>
                ) : null}
                {showConversationFilter ? (
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
                        setConversationFilterText(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleStepConversationSearch(
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
                          onClick={() =>
                            handleStepConversationSearch("previous")
                          }
                          disabled={conversationSearchMatchCount === 0}
                        >
                          <MdChevronLeft />
                        </button>
                        <button
                          type="button"
                          aria-label="Next conversation match"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100"
                          onClick={() => handleStepConversationSearch("next")}
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
      {engineSwitchContinuationBannerText ? (
        <div className="sticky top-0 z-10 border-b border-amber-300 bg-amber-50/95 px-2 py-2 text-xs text-amber-900 backdrop-blur dark:border-amber-600/70 dark:bg-amber-950/60 dark:text-amber-200">
          <div
            className={`${PROJECT_CHAT_CONTENT_SHELL_CLASS} flex items-center justify-between gap-2`}
          >
            <p
              data-testid="project-chat-engine-switch-banner"
              className="min-w-0 flex-1"
            >
              {engineSwitchContinuationBannerText}
            </p>
            <button
              type="button"
              data-testid="project-chat-engine-switch-continue-button"
              onClick={handleContinueInNewThread}
              className="shrink-0 rounded-md border border-amber-400/90 bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-500/80 dark:bg-amber-900/60 dark:text-amber-100 dark:hover:bg-amber-900"
            >
              Continue in new thread
            </button>
          </div>
        </div>
      ) : null}

      {showInlineThreads ? (
        <div className="flex min-h-0 flex-1">
          <Resizable
            className="h-full shrink-0"
            size={{ width: resolvedInlineThreadsWidth, height: "100%" }}
            minWidth={INLINE_THREADS_MIN_WIDTH_PX}
            maxWidth={inlineThreadsMaxWidth}
            boundsByDirection
            enable={{
              top: false,
              right: canResizeInlineThreads,
              bottom: false,
              left: false,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }}
            handleComponent={{
              right: (
                <div
                  data-testid="project-chat-inline-threads-resize-handle"
                  className="h-full w-2 cursor-col-resize bg-transparent hover:bg-blue-500/20"
                />
              ),
            }}
            onResize={(_event, _direction, elementRef) => {
              syncInlineThreadsHeaderWidth(elementRef.offsetWidth);
            }}
            onResizeStop={(_event, _direction, elementRef) => {
              syncInlineThreadsHeaderWidth(elementRef.offsetWidth);
              updateInlineThreadsWidth(elementRef.offsetWidth);
            }}
          >
            <div
              ref={handleInlineThreadsResizableColumnRef}
              className="h-full min-h-0"
            >
              <ProjectChatHistory
                {...chatHistoryProps}
                inline={true}
                closeOnSelect={false}
                headerPortalTarget={inlineThreadsHeaderPortalTarget}
              />
            </div>
          </Resizable>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-2">
            {auxViewContent ? (
              <div
                className={`${PROJECT_CHAT_CONTENT_SHELL_CLASS} flex min-h-0 flex-1 flex-col`}
                data-chat-width-shell="true"
              >
                {auxViewContent}
              </div>
            ) : (
              <ProjectChatCore {...chatCoreProps} />
            )}
          </div>
        </div>
      ) : auxViewContent ? (
        <div
          className={`${PROJECT_CHAT_CONTENT_SHELL_CLASS} flex min-h-0 flex-1 flex-col`}
          data-chat-width-shell="true"
        >
          {auxViewContent}
        </div>
      ) : viewThreads ? (
        <ProjectChatHistory {...chatHistoryProps} closeOnSelect={true} />
      ) : (
        <ProjectChatCore {...chatCoreProps} />
      )}
    </div>
  );
}
