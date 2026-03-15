import {
  FLOATING_CHAT_WINDOW_SHADOW_CLASS,
  WINDOWED_CHAT_ROUNDED_CLASS,
  buildFloatingWindowActionSpecs,
  getChatWindowEnterAnimationClass,
  getChatWindowExitAnimationClass,
} from "components/ChatWindowing/projectChatBottomDockSurfaceHelpers";
import type {
  ChatWindowEnterAnimationKind,
  ChatWindowExitAnimationKind,
  ResolvedWindowPill,
} from "components/ChatWindowing/projectChatBottomDockTypes";
import type {
  FloatingSnapPreview,
  FloatingWindowResizeDirection,
} from "components/ChatWindowing/projectChatFloatingInteractions";
import type {
  FloatingSnapPreset,
  FloatingSnapResizeHandle,
} from "components/ChatWindowing/projectChatSnapLayout";
import { ProjectChatWindowShell } from "components/ChatWindowing/projectChatWindowShell";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowBounds,
} from "utils/generatedTypes";

const FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX = 8;
const FLOATING_SNAP_RESIZE_HANDLE_LINE_THICKNESS_PX = 2;

const FLOATING_WINDOW_RESIZE_HANDLES: Array<{
  direction: FloatingWindowResizeDirection;
  className: string;
  cursorClassName: string;
  indicatorClassName?: string;
}> = [
  {
    direction: "top",
    className: "left-3 right-3 top-0 h-2",
    cursorClassName: "cursor-ns-resize",
  },
  {
    direction: "bottom",
    className: "left-3 right-3 bottom-0 h-2",
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
    indicatorClassName:
      "h-3 w-3 rounded-tl border-l border-t border-setta-300 bg-setta-100 dark:border-setta-700 dark:bg-setta-800",
  },
];

function isInteractiveWindowHeaderTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest(
      "button, [role='button'], [role='menuitem'], input, textarea, select, a, [contenteditable='true']",
    ),
  );
}

export function ProjectChatFloatingWindowsLayer({
  isCanvasVisibilitySuppressed,
  canEditLayout,
  activeFloatingSnapPreview,
  floatingSnapResizeHandles,
  chromeLayerZIndex,
  snapPreviewLayerZIndex,
  openFloatingPills,
  floatingBoundsById,
  floatingSnapPresetById,
  windowExitAnimationsById,
  windowEnterAnimationsById,
  windowEnterAnimationPrimesById,
  projectConfigId,
  onFocusWindow,
  onSetWindowTitle,
  onShowInCanvas,
  onDockWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onCloseWindow,
  onSetProjectChatId,
  onFloatingDragPointerDown,
  onFloatingDragPointerMove,
  onFloatingDragPointerUp,
  onFloatingResizePointerDown,
  onFloatingResizePointerMove,
  onFloatingResizePointerUp,
  onFloatingSnapResizePointerDown,
  onFloatingSnapResizePointerMove,
  onFloatingSnapResizePointerUp,
}: {
  isCanvasVisibilitySuppressed: boolean;
  canEditLayout: boolean;
  activeFloatingSnapPreview: FloatingSnapPreview | null;
  floatingSnapResizeHandles: FloatingSnapResizeHandle[];
  chromeLayerZIndex: number;
  snapPreviewLayerZIndex: number;
  openFloatingPills: ResolvedWindowPill[];
  floatingBoundsById: Record<string, ChatWindowBounds>;
  floatingSnapPresetById: Record<string, FloatingSnapPreset>;
  windowExitAnimationsById: Record<string, ChatWindowExitAnimationKind>;
  windowEnterAnimationsById: Record<string, ChatWindowEnterAnimationKind>;
  windowEnterAnimationPrimesById: Record<string, ChatWindowEnterAnimationKind>;
  projectConfigId: string;
  onFocusWindow: (instanceId: string) => void;
  onSetWindowTitle: (instanceId: string, nextTitle: string) => void;
  onShowInCanvas: (instanceId: string) => void;
  onDockWindow: (instanceId: string) => void;
  onMaximizeWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
  onSetProjectChatId: (
    instanceId: string,
    next: string | null | undefined,
  ) => void;
  onFloatingDragPointerDown: (
    event: ReactPointerEvent<HTMLParagraphElement | HTMLElement>,
    pill: ResolvedWindowPill,
  ) => void;
  onFloatingDragPointerMove: (
    event: ReactPointerEvent<HTMLParagraphElement | HTMLElement>,
  ) => void;
  onFloatingDragPointerUp: (
    event: ReactPointerEvent<HTMLParagraphElement | HTMLElement>,
  ) => void;
  onFloatingResizePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    pill: ResolvedWindowPill,
    direction: FloatingWindowResizeDirection,
  ) => void;
  onFloatingResizePointerMove: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onFloatingResizePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFloatingSnapResizePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    handle: FloatingSnapResizeHandle,
  ) => void;
  onFloatingSnapResizePointerMove: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onFloatingSnapResizePointerUp: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
}) {
  return (
    <>
      {!isCanvasVisibilitySuppressed &&
      canEditLayout &&
      activeFloatingSnapPreview ? (
        <div
          className="pointer-events-none fixed rounded-none border-2 border-setta-400/80 bg-setta-300/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] dark:border-setta-500/90 dark:bg-setta-500/25 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
          style={{
            zIndex: snapPreviewLayerZIndex,
            left: activeFloatingSnapPreview.bounds.x,
            top: activeFloatingSnapPreview.bounds.y,
            width: activeFloatingSnapPreview.bounds.width,
            height: activeFloatingSnapPreview.bounds.height,
          }}
          data-testid="project-chat-floating-snap-ghost-zone"
          data-chat-window-snap-preset={activeFloatingSnapPreview.preset}
        />
      ) : null}
      {!isCanvasVisibilitySuppressed &&
      canEditLayout &&
      floatingSnapResizeHandles.length > 0 ? (
        <div
          className="pointer-events-none fixed inset-0"
          style={{ zIndex: snapPreviewLayerZIndex }}
        >
          {floatingSnapResizeHandles.map((handle) => {
            const handleLengthPx = Math.max(
              0,
              handle.end -
                handle.start -
                FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
            );
            return (
              <div
                key={`${handle.axis}-${handle.leadingInstanceIds.join("|")}-${handle.trailingInstanceIds.join("|")}`}
                role="separator"
                aria-orientation={
                  handle.axis === "vertical" ? "vertical" : "horizontal"
                }
                className={`pointer-events-auto absolute flex items-center justify-center ${
                  handle.axis === "vertical"
                    ? "cursor-col-resize"
                    : "cursor-row-resize"
                }`}
                style={
                  handle.axis === "vertical"
                    ? {
                        left:
                          handle.coordinate -
                          FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX / 2,
                        top: handle.start,
                        width: FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                        height: Math.max(
                          FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                          handleLengthPx +
                            FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                        ),
                      }
                    : {
                        left: handle.start,
                        top:
                          handle.coordinate -
                          FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX / 2,
                        width: Math.max(
                          FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                          handleLengthPx +
                            FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                        ),
                        height: FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                      }
                }
                onPointerDown={(event) => {
                  onFloatingSnapResizePointerDown(event, handle);
                }}
                onPointerMove={onFloatingSnapResizePointerMove}
                onPointerUp={onFloatingSnapResizePointerUp}
                data-testid="project-chat-floating-snap-resize-handle"
                data-resize-axis={handle.axis}
              >
                <div
                  className="rounded-full bg-setta-300/80 transition-colors hover:bg-blue-500 dark:bg-setta-600/80 dark:hover:bg-blue-400"
                  style={
                    handle.axis === "vertical"
                      ? {
                          width: FLOATING_SNAP_RESIZE_HANDLE_LINE_THICKNESS_PX,
                          height: Math.max(24, handle.end - handle.start - 8),
                        }
                      : {
                          width: Math.max(24, handle.end - handle.start - 8),
                          height: FLOATING_SNAP_RESIZE_HANDLE_LINE_THICKNESS_PX,
                        }
                  }
                />
              </div>
            );
          })}
        </div>
      ) : null}
      {isCanvasVisibilitySuppressed ? null : (
        <div
          className="pointer-events-none fixed inset-0"
          style={{ zIndex: chromeLayerZIndex }}
        >
          {openFloatingPills.map((pill) => {
            const bounds = floatingBoundsById[pill.instanceId] ?? pill.bounds;
            const floatingExitAnimation =
              windowExitAnimationsById[pill.instanceId] ?? null;
            const floatingEnterAnimation =
              windowEnterAnimationsById[pill.instanceId] ?? null;
            const floatingEnterAnimationPrime =
              windowEnterAnimationPrimesById[pill.instanceId] ?? null;
            const floatingSnapPreset =
              floatingSnapPresetById[pill.instanceId] ?? null;
            const floatingActionSpecs = buildFloatingWindowActionSpecs({
              window: pill,
              onShowInCanvas,
              onDockWindow,
              onMaximizeWindow,
              onMinimizeWindow,
              onCloseWindow,
            });
            return (
              <article
                key={pill.instanceId}
                className={`pointer-events-auto absolute flex min-h-0 min-w-0 flex-col overflow-hidden ${
                  floatingSnapPreset
                    ? "rounded-none shadow-none"
                    : `${WINDOWED_CHAT_ROUNDED_CLASS} ${FLOATING_CHAT_WINDOW_SHADOW_CLASS}`
                } ${getChatWindowExitAnimationClass(
                  floatingExitAnimation,
                  ChatWindowPlacementEnum.floating,
                )} ${getChatWindowEnterAnimationClass(
                  floatingEnterAnimationPrime,
                  ChatWindowPlacementEnum.floating,
                )}`}
                style={{
                  left: bounds.x,
                  top: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                  zIndex: pill.zIndex,
                }}
                data-testid="project-chat-floating-window"
                data-chat-window-instance-id={pill.instanceId}
                data-chat-window-snap-preset={floatingSnapPreset ?? undefined}
                data-chat-window-exit-animation={
                  floatingExitAnimation ?? undefined
                }
                data-chat-window-enter-animation={
                  floatingEnterAnimation ?? undefined
                }
                onPointerDown={() => {
                  onFocusWindow(pill.instanceId);
                }}
              >
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                  <ProjectChatWindowShell
                    window={pill}
                    projectConfigId={projectConfigId}
                    host={ChatWindowPlacementEnum.floating}
                    allowLayoutMutations={canEditLayout}
                    roundedClassName={
                      floatingSnapPreset
                        ? "rounded-none"
                        : WINDOWED_CHAT_ROUNDED_CLASS
                    }
                    actionSpecs={floatingActionSpecs}
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
                    headerClassName="cursor-move"
                    dragHandleTestId="project-chat-floating-window-drag-handle"
                    onTitlePointerDown={(event) => {
                      onFloatingDragPointerDown(event, pill);
                    }}
                    onTitlePointerMove={onFloatingDragPointerMove}
                    onTitlePointerUp={onFloatingDragPointerUp}
                    showEmbeddedGitPaneToggle
                    showSectionWindowActions={canEditLayout}
                    sectionHeaderProps={
                      canEditLayout
                        ? {
                            "data-testid":
                              "project-chat-floating-window-drag-handle",
                            className: "cursor-move",
                            onPointerDown: (event) => {
                              if (
                                isInteractiveWindowHeaderTarget(event.target)
                              ) {
                                return;
                              }
                              onFloatingDragPointerDown(event, pill);
                            },
                            onPointerMove: onFloatingDragPointerMove,
                            onPointerUp: onFloatingDragPointerUp,
                          }
                        : undefined
                    }
                    onSetProjectChatId={onSetProjectChatId}
                  />
                  {floatingSnapPreset || !canEditLayout
                    ? null
                    : FLOATING_WINDOW_RESIZE_HANDLES.map((handle) => (
                        <div
                          key={`${pill.instanceId}-floating-${handle.direction}`}
                          role="separator"
                          aria-orientation={
                            handle.direction === "top" ||
                            handle.direction === "bottom"
                              ? "horizontal"
                              : "vertical"
                          }
                          className={`absolute z-10 flex items-center justify-center ${handle.className} ${handle.cursorClassName}`}
                          onPointerDown={(event) => {
                            onFloatingResizePointerDown(
                              event,
                              pill,
                              handle.direction,
                            );
                          }}
                          onPointerMove={onFloatingResizePointerMove}
                          onPointerUp={onFloatingResizePointerUp}
                          data-testid="project-chat-floating-window-resize-handle"
                          data-resize-direction={handle.direction}
                          data-chat-window-instance-id={pill.instanceId}
                        >
                          {handle.indicatorClassName ? (
                            <div className={handle.indicatorClassName} />
                          ) : null}
                        </div>
                      ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
