import { PROJECT_CHAT_SIDE_RAIL_WIDTH_PX } from "components/ChatWindowing/projectChatViewport";
import {
  ProjectChatWindowSurface,
  SECTION_WINDOW_ACTION_BUTTON_CLASS,
  SECTION_WINDOW_CLOSE_BUTTON_CLASS,
  SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
} from "components/ChatWindowing/ProjectChatWindowSurface";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import {
  getWindowControlQuickInfoHandlers,
  getWindowControlQuickInfoText,
} from "components/Utils/windowControlQuickInfo";
import { MdFlipToFront, MdVerticalAlignBottom } from "react-icons/md";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
} from "utils/generatedTypes";

import {
  CHAT_WINDOW_LAYER_Z_INDEX,
  PaneTrackedRect,
  ResolvedWindowPill,
  TRACKED_PANE_CHAT_WINDOW_LAYER_Z_INDEX,
  canMoveProjectChatWindowToCanvas,
  getChatWindowEnterAnimationClass,
  getChatWindowExitAnimationClass,
  type ChatWindowEnterAnimationKind,
  type ChatWindowExitAnimationKind,
} from "./shared";
import { ProjectChatWindowContent } from "./windowContent";

export type MaximizedWindowLayerProps = {
  openMaximizedWindow: ResolvedWindowPill;
  projectConfigId: string;
  canEditLayout: boolean;
  maximizedExitAnimation: ChatWindowExitAnimationKind | null;
  maximizedEnterAnimation: ChatWindowEnterAnimationKind | null;
  maximizedEnterAnimationPrime: ChatWindowEnterAnimationKind | null;
  isPaneTrackedMaximizedGitGraphWindow: boolean;
  trackedGitPaneGraphRect: PaneTrackedRect | null;
  workspaceTopInsetPx: number;
  dockBottomOffsetPx: number;
  onFocusWindow: (instanceId: string) => void;
  onShowInCanvas: (instanceId: string) => void;
  onRestoreWindow: (instanceId: string) => void;
  onDockWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
  onSetWindowTitle: (instanceId: string, nextTitle: string) => void;
};

export type MaximizedWindowSurfaceProps = Omit<
  MaximizedWindowLayerProps,
  | "maximizedExitAnimation"
  | "maximizedEnterAnimation"
  | "maximizedEnterAnimationPrime"
>;

export function MaximizedSectionWindowSurface({
  openMaximizedWindow,
  canEditLayout,
  onShowInCanvas,
  onRestoreWindow,
  onDockWindow,
  onMinimizeWindow,
  onCloseWindow,
}: MaximizedWindowSurfaceProps) {
  const canShowCanvasAction = canMoveProjectChatWindowToCanvas(
    openMaximizedWindow.mode,
  );
  const sectionId = openMaximizedWindow.sectionId;
  if (!sectionId) {
    return null;
  }

  return (
    <SectionWindowSurface
      sectionId={sectionId}
      roundedClassName="rounded-none"
      chatHost={ChatWindowPlacementEnum.maximized}
      chatModeOverride={openMaximizedWindow.mode}
      headerActions={
        canEditLayout ? (
          <>
            {canShowCanvasAction ? (
              <button
                type="button"
                className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
                onClick={() => {
                  onShowInCanvas(openMaximizedWindow.instanceId);
                }}
                aria-label={getWindowControlQuickInfoText({
                  action: "show_in_canvas",
                  title: openMaximizedWindow.title,
                })}
                data-testid="project-chat-window-show-in-canvas"
                data-chat-window-instance-id={openMaximizedWindow.instanceId}
                {...getWindowControlQuickInfoHandlers({
                  action: "show_in_canvas",
                  title: openMaximizedWindow.title,
                })}
              >
                <MdFlipToFront size={12} />
              </button>
            ) : null}
            <button
              type="button"
              className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
              onClick={() => {
                onRestoreWindow(openMaximizedWindow.instanceId);
              }}
              aria-label={getWindowControlQuickInfoText({
                action: "restore_window",
                title: openMaximizedWindow.title,
              })}
              data-testid="project-chat-window-restore"
              data-chat-window-instance-id={openMaximizedWindow.instanceId}
              {...getWindowControlQuickInfoHandlers({
                action: "restore_window",
                title: openMaximizedWindow.title,
              })}
            >
              <MdFlipToFront size={12} />
            </button>
            <button
              type="button"
              className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
              onClick={() => {
                onDockWindow(openMaximizedWindow.instanceId);
              }}
              aria-label={getWindowControlQuickInfoText({
                action: "dock_window",
                title: openMaximizedWindow.title,
              })}
              data-testid="project-chat-window-dock"
              data-chat-window-instance-id={openMaximizedWindow.instanceId}
              {...getWindowControlQuickInfoHandlers({
                action: "dock_window",
                title: openMaximizedWindow.title,
              })}
            >
              <MdVerticalAlignBottom size={12} />
            </button>
            <button
              type="button"
              className={SECTION_WINDOW_MINIMIZE_BUTTON_CLASS}
              onClick={() => {
                onMinimizeWindow(openMaximizedWindow.instanceId);
              }}
              aria-label={getWindowControlQuickInfoText({
                action: "minimize_window",
                title: openMaximizedWindow.title,
              })}
              data-testid="project-chat-window-minimize"
              data-chat-window-instance-id={openMaximizedWindow.instanceId}
              {...getWindowControlQuickInfoHandlers({
                action: "minimize_window",
                title: openMaximizedWindow.title,
              })}
            >
              <i className="gg-math-minus" />
            </button>
            <button
              type="button"
              className={SECTION_WINDOW_CLOSE_BUTTON_CLASS}
              onClick={() => {
                onCloseWindow(openMaximizedWindow.instanceId);
              }}
              aria-label={getWindowControlQuickInfoText({
                action: "close_window",
                title: openMaximizedWindow.title,
              })}
              data-testid="project-chat-window-close"
              data-chat-window-instance-id={openMaximizedWindow.instanceId}
              {...getWindowControlQuickInfoHandlers({
                action: "close_window",
                title: openMaximizedWindow.title,
              })}
            >
              <i className="gg-close" />
            </button>
          </>
        ) : null
      }
    />
  );
}

export function MaximizedProjectWindowSurface({
  openMaximizedWindow,
  projectConfigId,
  canEditLayout,
  isPaneTrackedMaximizedGitGraphWindow,
  onFocusWindow,
  onShowInCanvas,
  onRestoreWindow,
  onDockWindow,
  onMinimizeWindow,
  onCloseWindow,
  onSetWindowTitle,
}: MaximizedWindowSurfaceProps) {
  const canShowCanvasAction = canMoveProjectChatWindowToCanvas(
    openMaximizedWindow.mode,
  );
  const titleCommit =
    openMaximizedWindow.mode === ChatWindowModeEnum.git_graph_mode
      ? undefined
      : (nextTitle: string) => {
          onSetWindowTitle(openMaximizedWindow.instanceId, nextTitle);
        };

  return (
    <ProjectChatWindowSurface
      title={openMaximizedWindow.title}
      mode={openMaximizedWindow.mode}
      instanceId={openMaximizedWindow.instanceId}
      allowLayoutMutations={canEditLayout}
      roundedClassName="rounded-none"
      onTitleClick={() => {
        onFocusWindow(openMaximizedWindow.instanceId);
      }}
      {...(titleCommit ? { onTitleCommit: titleCommit } : {})}
      actions={[
        ...(canShowCanvasAction
          ? [
              {
                key: "show_in_canvas",
                label: `Show ${openMaximizedWindow.title} in canvas`,
                testId: "project-chat-window-show-in-canvas",
                instanceId: openMaximizedWindow.instanceId,
                icon: <MdFlipToFront size={12} />,
                onClick: () => {
                  onShowInCanvas(openMaximizedWindow.instanceId);
                },
              },
            ]
          : []),
        {
          key: "restore",
          label: `Restore ${openMaximizedWindow.title}`,
          testId: "project-chat-window-restore",
          instanceId: openMaximizedWindow.instanceId,
          icon: <MdFlipToFront size={12} />,
          onClick: () => {
            onRestoreWindow(openMaximizedWindow.instanceId);
          },
        },
        {
          key: "dock",
          label: `Dock ${openMaximizedWindow.title}`,
          testId: "project-chat-window-dock",
          instanceId: openMaximizedWindow.instanceId,
          icon: <MdVerticalAlignBottom size={12} />,
          onClick: () => {
            onDockWindow(openMaximizedWindow.instanceId);
          },
        },
        {
          key: "minimize",
          label: `Minimize ${openMaximizedWindow.title}`,
          testId: "project-chat-window-minimize",
          instanceId: openMaximizedWindow.instanceId,
          className: SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
          icon: <i className="gg-math-minus" />,
          onClick: () => {
            onMinimizeWindow(openMaximizedWindow.instanceId);
          },
        },
        {
          key: "close",
          label: `Close ${openMaximizedWindow.title}`,
          testId: "project-chat-window-close",
          instanceId: openMaximizedWindow.instanceId,
          className: SECTION_WINDOW_CLOSE_BUTTON_CLASS,
          icon: <i className="gg-close" />,
          onClick: () => {
            onCloseWindow(openMaximizedWindow.instanceId);
          },
        },
      ]}
    >
      <ProjectChatWindowContent
        pill={openMaximizedWindow}
        projectConfigId={projectConfigId}
        host={ChatWindowPlacementEnum.maximized}
        showEmbeddedGitPaneToggle={!isPaneTrackedMaximizedGitGraphWindow}
      />
    </ProjectChatWindowSurface>
  );
}

export function MaximizedWindowLayer({
  openMaximizedWindow,
  projectConfigId,
  canEditLayout,
  maximizedExitAnimation,
  maximizedEnterAnimation,
  maximizedEnterAnimationPrime,
  isPaneTrackedMaximizedGitGraphWindow,
  trackedGitPaneGraphRect,
  workspaceTopInsetPx,
  dockBottomOffsetPx,
  onFocusWindow,
  onShowInCanvas,
  onRestoreWindow,
  onDockWindow,
  onMinimizeWindow,
  onCloseWindow,
  onSetWindowTitle,
}: MaximizedWindowLayerProps) {
  return (
    <section
      className={`border-setta-250 fixed overflow-hidden rounded-none border bg-setta-50 shadow-none dark:border-setta-800 dark:bg-setta-900 ${getChatWindowExitAnimationClass(
        maximizedExitAnimation,
        ChatWindowPlacementEnum.maximized,
      )} ${getChatWindowEnterAnimationClass(
        maximizedEnterAnimationPrime,
        ChatWindowPlacementEnum.maximized,
      )}`}
      style={{
        zIndex: isPaneTrackedMaximizedGitGraphWindow
          ? TRACKED_PANE_CHAT_WINDOW_LAYER_Z_INDEX
          : CHAT_WINDOW_LAYER_Z_INDEX,
        ...(isPaneTrackedMaximizedGitGraphWindow && trackedGitPaneGraphRect
          ? {
              left: trackedGitPaneGraphRect.left,
              top: trackedGitPaneGraphRect.top,
              width: trackedGitPaneGraphRect.width,
              height: trackedGitPaneGraphRect.height,
            }
          : {
              left: PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
              right: PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
              top: workspaceTopInsetPx,
              bottom: dockBottomOffsetPx,
            }),
      }}
      data-testid="project-chat-maximized-window"
      data-chat-window-instance-id={openMaximizedWindow.instanceId}
      data-chat-window-tracked-pane-target={
        isPaneTrackedMaximizedGitGraphWindow ? "git_overview" : undefined
      }
      data-chat-window-exit-animation={maximizedExitAnimation ?? undefined}
      data-chat-window-enter-animation={maximizedEnterAnimation ?? undefined}
    >
      <article className="flex h-full min-h-0 flex-col overflow-hidden">
        {openMaximizedWindow.sectionId ? (
          <MaximizedSectionWindowSurface
            openMaximizedWindow={openMaximizedWindow}
            projectConfigId={projectConfigId}
            canEditLayout={canEditLayout}
            isPaneTrackedMaximizedGitGraphWindow={
              isPaneTrackedMaximizedGitGraphWindow
            }
            trackedGitPaneGraphRect={trackedGitPaneGraphRect}
            workspaceTopInsetPx={workspaceTopInsetPx}
            dockBottomOffsetPx={dockBottomOffsetPx}
            onFocusWindow={onFocusWindow}
            onShowInCanvas={onShowInCanvas}
            onRestoreWindow={onRestoreWindow}
            onDockWindow={onDockWindow}
            onMinimizeWindow={onMinimizeWindow}
            onCloseWindow={onCloseWindow}
            onSetWindowTitle={onSetWindowTitle}
          />
        ) : (
          <MaximizedProjectWindowSurface
            openMaximizedWindow={openMaximizedWindow}
            projectConfigId={projectConfigId}
            canEditLayout={canEditLayout}
            isPaneTrackedMaximizedGitGraphWindow={
              isPaneTrackedMaximizedGitGraphWindow
            }
            trackedGitPaneGraphRect={trackedGitPaneGraphRect}
            workspaceTopInsetPx={workspaceTopInsetPx}
            dockBottomOffsetPx={dockBottomOffsetPx}
            onFocusWindow={onFocusWindow}
            onShowInCanvas={onShowInCanvas}
            onRestoreWindow={onRestoreWindow}
            onDockWindow={onDockWindow}
            onMinimizeWindow={onMinimizeWindow}
            onCloseWindow={onCloseWindow}
            onSetWindowTitle={onSetWindowTitle}
          />
        )}
      </article>
    </section>
  );
}
