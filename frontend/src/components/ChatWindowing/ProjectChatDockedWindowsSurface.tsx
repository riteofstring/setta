import {
  DOCK_SURFACE_HORIZONTAL_MARGIN_PX,
  DOCK_SURFACE_MAX_WIDTH_PX,
  DOCK_WINDOW_DEFAULT_HEIGHT_PX,
  DOCK_WINDOW_DEFAULT_WIDTH_PX,
  MIN_DOCK_CHAT_HEIGHT_PX,
  MIN_DOCK_CHAT_WIDTH_PX,
} from "components/ChatWindowing/projectChatBottomDockLayout";
import type { ChatWindowPillExitAnimationKind } from "components/ChatWindowing/projectChatBottomDockPillStrip";
import { MinimizedPillStrip } from "components/ChatWindowing/projectChatBottomDockPillStrip";
import {
  DOCKED_CHAT_WINDOW_SHADOW_CLASS,
  DOCKED_WINDOWED_CHAT_ROUNDED_CLASS,
  buildDockedWindowActionSpecs,
  getChatWindowEnterAnimationClass,
  getChatWindowExitAnimationClass,
} from "components/ChatWindowing/projectChatBottomDockSurfaceHelpers";
import type {
  ChatWindowEnterAnimationKind,
  ChatWindowExitAnimationKind,
  ResolvedWindowPill,
} from "components/ChatWindowing/projectChatBottomDockTypes";
import type { FloatingWindowResizeDirection } from "components/ChatWindowing/projectChatFloatingInteractions";
import { ProjectChatWindowShell } from "components/ChatWindowing/projectChatWindowShell";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
} from "utils/generatedTypes";

const DOCK_WINDOW_RESIZE_HANDLES: Array<{
  direction: FloatingWindowResizeDirection;
  className: string;
  cursorClassName: string;
  indicatorClassName?: string;
}> = [
  {
    direction: "top",
    className: "left-2 right-2 top-0 h-2",
    cursorClassName: "cursor-ns-resize",
  },
  {
    direction: "bottom",
    className: "left-2 right-2 bottom-0 h-2",
    cursorClassName: "cursor-ns-resize",
  },
  {
    direction: "top_left",
    className: "left-0 top-0 h-3 w-3",
    cursorClassName: "cursor-nwse-resize",
  },
  {
    direction: "top_right",
    className: "right-0 top-0 h-3 w-3",
    cursorClassName: "cursor-nesw-resize",
  },
  {
    direction: "bottom_left",
    className: "left-0 bottom-0 h-3 w-3",
    cursorClassName: "cursor-nesw-resize",
  },
  {
    direction: "bottom_right",
    className: "right-0 bottom-0 h-3 w-3",
    cursorClassName: "cursor-nwse-resize",
  },
];

export function ProjectChatDockedWindowsSurface({
  showDockedChatSurface,
  dockSurfaceRightPx,
  dockBottomOffsetPx,
  dockSurfaceWidthCss,
  dockSurfaceHeightCss,
  sideRailWidthPx,
  chromeLayerZIndex,
  stripPills,
  pillExitAnimationsById,
  canCreateManagedChatWindow,
  showDockManagerMenu,
  viewportWidthPx,
  visibleDockedPills,
  resolvedVisibleDockWindowWidthsById,
  resolvedDockWindowHeightsById,
  windowExitAnimationsById,
  windowEnterAnimationsById,
  windowEnterAnimationPrimesById,
  showDockHeaderCycleControls,
  canCycleDockBackward,
  canCycleDockForward,
  canEditLayout,
  projectConfigId,
  dockAvailableHeightPx,
  onOpenWindow,
  onCreateWindow,
  onFocusWindow,
  onSetWindowTitle,
  onShowInCanvas,
  onUndockWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onCloseWindow,
  onCycleDockWindowsBackward,
  onCycleDockWindowsForward,
  onSetProjectChatId,
  onSingleDockResizePointerDown,
  onSingleDockResizePointerMove,
  onSingleDockResizePointerUp,
}: {
  showDockedChatSurface: boolean;
  dockSurfaceRightPx: number;
  dockBottomOffsetPx: number;
  dockSurfaceWidthCss: string;
  dockSurfaceHeightCss: string;
  sideRailWidthPx: number;
  chromeLayerZIndex: number;
  stripPills: ResolvedWindowPill[];
  pillExitAnimationsById: Record<string, ChatWindowPillExitAnimationKind>;
  canCreateManagedChatWindow: boolean;
  showDockManagerMenu: boolean;
  viewportWidthPx: number;
  visibleDockedPills: ResolvedWindowPill[];
  resolvedVisibleDockWindowWidthsById: Record<string, number>;
  resolvedDockWindowHeightsById: Record<string, number>;
  windowExitAnimationsById: Record<string, ChatWindowExitAnimationKind>;
  windowEnterAnimationsById: Record<string, ChatWindowEnterAnimationKind>;
  windowEnterAnimationPrimesById: Record<string, ChatWindowEnterAnimationKind>;
  showDockHeaderCycleControls: boolean;
  canCycleDockBackward: boolean;
  canCycleDockForward: boolean;
  canEditLayout: boolean;
  projectConfigId: string;
  dockAvailableHeightPx: number;
  onOpenWindow: (instanceId: string, source: "pill" | "menu") => void;
  onCreateWindow: () => void;
  onFocusWindow: (instanceId: string) => void;
  onSetWindowTitle: (instanceId: string, nextTitle: string) => void;
  onShowInCanvas: (instanceId: string) => void;
  onUndockWindow: (instanceId: string) => void;
  onMaximizeWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
  onCycleDockWindowsBackward: () => void;
  onCycleDockWindowsForward: () => void;
  onSetProjectChatId: (
    instanceId: string,
    next: string | null | undefined,
  ) => void;
  onSingleDockResizePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    instanceId: string,
    direction: FloatingWindowResizeDirection,
  ) => void;
  onSingleDockResizePointerMove: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onSingleDockResizePointerUp: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
}) {
  if (!showDockedChatSurface) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed"
      style={{
        left: sideRailWidthPx + DOCK_SURFACE_HORIZONTAL_MARGIN_PX,
        right: dockSurfaceRightPx,
        bottom: dockBottomOffsetPx,
        zIndex: chromeLayerZIndex,
      }}
    >
      <div className="flex min-w-0 items-end justify-end gap-3">
        <div className="pointer-events-auto flex min-w-0 max-w-[28rem] items-end justify-end">
          <MinimizedPillStrip
            pills={stripPills}
            pillExitAnimationsById={pillExitAnimationsById}
            canCreateWindow={canCreateManagedChatWindow}
            showManagerMenu={showDockManagerMenu}
            viewportWidthPx={viewportWidthPx}
            onOpenWindow={onOpenWindow}
            onCreateWindow={onCreateWindow}
          />
        </div>
        <section
          className="pointer-events-none"
          style={{
            width: dockSurfaceWidthCss,
            height: dockSurfaceHeightCss,
          }}
          data-testid="project-chat-bottom-dock-window"
        >
          <div
            className="flex h-full min-h-0 items-end justify-end gap-3 overflow-x-hidden overflow-y-hidden px-1"
            data-testid="project-chat-bottom-dock-window-grid"
          >
            {visibleDockedPills.map((pill) => {
              const resolvedWindowWidthPx =
                resolvedVisibleDockWindowWidthsById[pill.instanceId] ??
                DOCK_WINDOW_DEFAULT_WIDTH_PX;
              const resolvedWindowHeightPx =
                resolvedDockWindowHeightsById[pill.instanceId] ??
                DOCK_WINDOW_DEFAULT_HEIGHT_PX;
              const dockedExitAnimation =
                windowExitAnimationsById[pill.instanceId] ?? null;
              const dockedEnterAnimation =
                windowEnterAnimationsById[pill.instanceId] ?? null;
              const dockedEnterAnimationPrime =
                windowEnterAnimationPrimesById[pill.instanceId] ?? null;
              const dockedActionSpecs = buildDockedWindowActionSpecs({
                window: pill,
                showDockHeaderCycleControls,
                canCycleDockBackward,
                canCycleDockForward,
                onCycleDockWindowsBackward,
                onCycleDockWindowsForward,
                onShowInCanvas,
                onUndockWindow,
                onMaximizeWindow,
                onMinimizeWindow,
                onCloseWindow,
              });

              return (
                <article
                  key={pill.instanceId}
                  className={`pointer-events-auto relative flex min-h-0 min-w-[16rem] shrink-0 flex-col overflow-hidden bg-transparent ${DOCKED_CHAT_WINDOW_SHADOW_CLASS} ${getChatWindowExitAnimationClass(
                    dockedExitAnimation,
                    ChatWindowPlacementEnum.bottom_docked,
                  )} ${getChatWindowEnterAnimationClass(
                    dockedEnterAnimationPrime,
                    ChatWindowPlacementEnum.bottom_docked,
                  )}`}
                  style={{
                    width: resolvedWindowWidthPx,
                    height: resolvedWindowHeightPx,
                    minWidth: MIN_DOCK_CHAT_WIDTH_PX,
                    maxWidth: DOCK_SURFACE_MAX_WIDTH_PX,
                    minHeight: MIN_DOCK_CHAT_HEIGHT_PX,
                    maxHeight: dockAvailableHeightPx,
                  }}
                  data-testid="project-chat-bottom-dock-window-panel"
                  data-chat-window-instance-id={pill.instanceId}
                  data-chat-window-exit-animation={
                    dockedExitAnimation ?? undefined
                  }
                  data-chat-window-enter-animation={
                    dockedEnterAnimation ?? undefined
                  }
                  onPointerDown={() => {
                    onFocusWindow(pill.instanceId);
                  }}
                >
                  <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                    <ProjectChatWindowShell
                      window={pill}
                      projectConfigId={projectConfigId}
                      host={ChatWindowPlacementEnum.bottom_docked}
                      allowLayoutMutations={canEditLayout}
                      roundedClassName={DOCKED_WINDOWED_CHAT_ROUNDED_CLASS}
                      actionSpecs={dockedActionSpecs}
                      onTitleClick={() => {
                        onFocusWindow(pill.instanceId);
                      }}
                      onTitleCommit={
                        pill.mode === ChatWindowModeEnum.git_graph_mode
                          ? undefined
                          : (nextTitle) => {
                              onSetWindowTitle(pill.instanceId, nextTitle);
                            }
                      }
                      showEmbeddedGitPaneToggle
                      onSetProjectChatId={onSetProjectChatId}
                    />
                    {canEditLayout
                      ? DOCK_WINDOW_RESIZE_HANDLES.map((handle) => (
                          <div
                            key={`${pill.instanceId}-${handle.direction}`}
                            role="separator"
                            aria-orientation={
                              handle.direction === "top" ||
                              handle.direction === "bottom"
                                ? "horizontal"
                                : "vertical"
                            }
                            className={`group/resize absolute z-10 flex items-center justify-center ${handle.className} ${handle.cursorClassName}`}
                            data-testid="project-chat-bottom-dock-resize-handle"
                            data-resize-direction={handle.direction}
                            onPointerDown={(event) => {
                              onSingleDockResizePointerDown(
                                event,
                                pill.instanceId,
                                handle.direction,
                              );
                            }}
                            onPointerMove={onSingleDockResizePointerMove}
                            onPointerUp={onSingleDockResizePointerUp}
                          >
                            {handle.indicatorClassName ? (
                              <div className={handle.indicatorClassName} />
                            ) : null}
                          </div>
                        ))
                      : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
