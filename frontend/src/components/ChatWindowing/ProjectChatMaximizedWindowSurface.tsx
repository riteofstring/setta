import {
  buildMaximizedWindowActionSpecs,
  getChatWindowEnterAnimationClass,
  getChatWindowExitAnimationClass,
} from "components/ChatWindowing/projectChatBottomDockSurfaceHelpers";
import type {
  ChatWindowEnterAnimationKind,
  ChatWindowExitAnimationKind,
  PaneTrackedRect,
  ResolvedWindowPill,
} from "components/ChatWindowing/projectChatBottomDockTypes";
import { ProjectChatWindowShell } from "components/ChatWindowing/projectChatWindowShell";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
} from "utils/generatedTypes";

export function ProjectChatMaximizedWindowSurface({
  openMaximizedWindow,
  maximizedExitAnimation,
  maximizedEnterAnimation,
  maximizedEnterAnimationPrime,
  isPaneTrackedMaximizedGitGraphWindow,
  trackedGitPaneGraphRect,
  trackedPaneWindowLayerZIndex,
  chatWindowLayerZIndex,
  workspaceTopInsetPx,
  dockBottomOffsetPx,
  sideRailWidthPx,
  canEditLayout,
  projectConfigId,
  onFocusWindow,
  onSetWindowTitle,
  onShowInCanvas,
  onRestoreWindow,
  onDockWindow,
  onMinimizeWindow,
  onCloseWindow,
  onSetProjectChatId,
}: {
  openMaximizedWindow: ResolvedWindowPill | null;
  maximizedExitAnimation: ChatWindowExitAnimationKind | null;
  maximizedEnterAnimation: ChatWindowEnterAnimationKind | null;
  maximizedEnterAnimationPrime: ChatWindowEnterAnimationKind | null;
  isPaneTrackedMaximizedGitGraphWindow: boolean;
  trackedGitPaneGraphRect: PaneTrackedRect | null;
  trackedPaneWindowLayerZIndex: number;
  chatWindowLayerZIndex: number;
  workspaceTopInsetPx: number;
  dockBottomOffsetPx: number;
  sideRailWidthPx: number;
  canEditLayout: boolean;
  projectConfigId: string;
  onFocusWindow: (instanceId: string) => void;
  onSetWindowTitle: (instanceId: string, nextTitle: string) => void;
  onShowInCanvas: (instanceId: string) => void;
  onRestoreWindow: (instanceId: string) => void;
  onDockWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
  onSetProjectChatId: (
    instanceId: string,
    next: string | null | undefined,
  ) => void;
}) {
  if (!openMaximizedWindow) {
    return null;
  }

  const maximizedActionSpecs = buildMaximizedWindowActionSpecs({
    window: openMaximizedWindow,
    onShowInCanvas,
    onRestoreWindow,
    onDockWindow,
    onMinimizeWindow,
    onCloseWindow,
  });

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
          ? trackedPaneWindowLayerZIndex
          : chatWindowLayerZIndex,
        ...(isPaneTrackedMaximizedGitGraphWindow && trackedGitPaneGraphRect
          ? {
              left: trackedGitPaneGraphRect.left,
              top: trackedGitPaneGraphRect.top,
              width: trackedGitPaneGraphRect.width,
              height: trackedGitPaneGraphRect.height,
            }
          : {
              left: sideRailWidthPx,
              right: sideRailWidthPx,
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
        <ProjectChatWindowShell
          window={openMaximizedWindow}
          projectConfigId={projectConfigId}
          host={ChatWindowPlacementEnum.maximized}
          allowLayoutMutations={canEditLayout}
          roundedClassName="rounded-none"
          actionSpecs={maximizedActionSpecs}
          onTitleClick={() => {
            onFocusWindow(openMaximizedWindow.instanceId);
          }}
          onTitleCommit={
            openMaximizedWindow.mode === ChatWindowModeEnum.git_graph_mode
              ? undefined
              : (nextTitle) => {
                  onSetWindowTitle(openMaximizedWindow.instanceId, nextTitle);
                }
          }
          showEmbeddedGitPaneToggle={!isPaneTrackedMaximizedGitGraphWindow}
          showSectionWindowActions={canEditLayout}
          onSetProjectChatId={onSetProjectChatId}
        />
      </article>
    </section>
  );
}
