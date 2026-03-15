import { Resizable } from "re-resizable";
import { type ComponentProps, type ReactNode, type RefCallback } from "react";

import { ProjectChatCore } from "./ProjectChatCore";
import { ProjectChatHistory } from "./ProjectChatHistory";
import { PROJECT_CHAT_INLINE_THREADS_MIN_WIDTH_PX } from "./projectChatInlineThreadsLayout";
import { PROJECT_CHAT_CONTENT_SHELL_CLASS } from "./projectChatSurfaceViewModel";

type ProjectChatCoreProps = ComponentProps<typeof ProjectChatCore>;
type ProjectChatHistorySharedProps = Pick<
  ComponentProps<typeof ProjectChatHistory>,
  | "chatId"
  | "setChatId"
  | "runType"
  | "engineConfigId"
  | "draftThread"
  | "draftWaitingForResponse"
  | "selectedGroupId"
  | "onSelectedGroupChange"
  | "onStartNewThread"
  | "onStartNewThreadInGroup"
>;

function ProjectChatMainContent({
  auxViewContent,
  chatCoreProps,
}: {
  auxViewContent: ReactNode;
  chatCoreProps: ProjectChatCoreProps;
}) {
  if (auxViewContent) {
    return (
      <div
        className={`${PROJECT_CHAT_CONTENT_SHELL_CLASS} flex min-h-0 flex-1 flex-col`}
        data-chat-width-shell="true"
      >
        {auxViewContent}
      </div>
    );
  }
  return <ProjectChatCore {...chatCoreProps} />;
}

export function ProjectChatSurfaceBody({
  engineSwitchContinuationBannerText,
  onContinueInNewThread,
  showInlineThreads,
  resolvedInlineThreadsWidth,
  inlineThreadsMaxWidth,
  canResizeInlineThreads,
  handleInlineThreadsResize,
  handleInlineThreadsResizeStop,
  handleInlineThreadsResizableColumnRef,
  inlineThreadsHeaderPortalTarget,
  historyProps,
  viewThreads,
  onCloseThreadsView,
  auxViewContent,
  chatCoreProps,
}: {
  engineSwitchContinuationBannerText: string | null;
  onContinueInNewThread: () => void;
  showInlineThreads: boolean;
  resolvedInlineThreadsWidth: number;
  inlineThreadsMaxWidth: number;
  canResizeInlineThreads: boolean;
  handleInlineThreadsResize: (nextWidth: number) => void;
  handleInlineThreadsResizeStop: (nextWidth: number) => void;
  handleInlineThreadsResizableColumnRef: RefCallback<HTMLDivElement>;
  inlineThreadsHeaderPortalTarget: HTMLElement | null;
  historyProps: ProjectChatHistorySharedProps;
  viewThreads: boolean;
  onCloseThreadsView: () => void;
  auxViewContent: ReactNode;
  chatCoreProps: ProjectChatCoreProps;
}) {
  return (
    <>
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
              onClick={onContinueInNewThread}
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
            minWidth={PROJECT_CHAT_INLINE_THREADS_MIN_WIDTH_PX}
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
              handleInlineThreadsResize(elementRef.offsetWidth);
            }}
            onResizeStop={(_event, _direction, elementRef) => {
              handleInlineThreadsResizeStop(elementRef.offsetWidth);
            }}
          >
            <div
              ref={handleInlineThreadsResizableColumnRef}
              className="h-full min-h-0"
            >
              <ProjectChatHistory
                {...historyProps}
                inline={true}
                closeOnSelect={false}
                onCloseThreadsView={onCloseThreadsView}
                headerPortalTarget={inlineThreadsHeaderPortalTarget}
              />
            </div>
          </Resizable>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-2">
            <ProjectChatMainContent
              auxViewContent={auxViewContent}
              chatCoreProps={chatCoreProps}
            />
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
        <ProjectChatHistory
          {...historyProps}
          closeOnSelect={true}
          onCloseThreadsView={onCloseThreadsView}
        />
      ) : (
        <ProjectChatCore {...chatCoreProps} />
      )}
    </>
  );
}
