import {
  type FloatingSnapPreset,
  type FloatingSnapResizeHandle,
} from "components/ChatWindowing/projectChatSnapLayout";
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
import { type ComponentPropsWithoutRef, type PointerEvent } from "react";
import { MdFlipToFront, MdVerticalAlignBottom } from "react-icons/md";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowBounds,
} from "utils/generatedTypes";

import {
  CHAT_WINDOW_CHROME_LAYER_Z_INDEX,
  CHAT_WINDOW_SNAP_PREVIEW_Z_INDEX,
  FLOATING_CHAT_WINDOW_SHADOW_CLASS,
  FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
  FLOATING_SNAP_RESIZE_HANDLE_LINE_THICKNESS_PX,
  ResolvedWindowPill,
  WINDOWED_CHAT_ROUNDED_CLASS,
  WINDOW_MAXIMIZE_ICON,
  WindowResizeDirection,
  canMoveProjectChatWindowToCanvas,
  getChatWindowEnterAnimationClass,
  getChatWindowExitAnimationClass,
  isInteractiveWindowHeaderTarget,
  type ChatWindowEnterAnimationKind,
  type ChatWindowExitAnimationKind,
} from "./shared";
import {
  FloatingWindowResizeHandles,
  ProjectChatWindowContent,
} from "./windowContent";

export type FloatingWindowPanelProps = {
  pill: ResolvedWindowPill;
  projectConfigId: string;
  canEditLayout: boolean;
  bounds: ChatWindowBounds;
  floatingSnapPreset: FloatingSnapPreset | null;
  floatingExitAnimation: ChatWindowExitAnimationKind | null;
  floatingEnterAnimation: ChatWindowEnterAnimationKind | null;
  floatingEnterAnimationPrime: ChatWindowEnterAnimationKind | null;
  onFocusWindow: (instanceId: string) => void;
  onShowInCanvas: (instanceId: string) => void;
  onDockWindow: (instanceId: string) => void;
  onMaximizeWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
  onSetWindowTitle: (instanceId: string, nextTitle: string) => void;
  onFloatingDragPointerDown: (
    event: PointerEvent<HTMLElement>,
    pill: ResolvedWindowPill,
  ) => void;
  onFloatingDragPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onFloatingDragPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onFloatingResizePointerDown: (
    event: PointerEvent<HTMLDivElement>,
    pill: ResolvedWindowPill,
    direction: WindowResizeDirection,
  ) => void;
  onFloatingResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onFloatingResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
};

export type FloatingWindowSurfaceProps = Omit<
  FloatingWindowPanelProps,
  | "bounds"
  | "floatingSnapPreset"
  | "floatingExitAnimation"
  | "floatingEnterAnimation"
  | "floatingEnterAnimationPrime"
> & {
  roundedClassName: string;
};

export function FloatingSectionWindowSurface({
  pill,
  canEditLayout,
  roundedClassName,
  onShowInCanvas,
  onDockWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onCloseWindow,
  onFloatingDragPointerDown,
  onFloatingDragPointerMove,
  onFloatingDragPointerUp,
}: FloatingWindowSurfaceProps) {
  const canShowCanvasAction = canMoveProjectChatWindowToCanvas(pill.mode);
  const sectionId = pill.sectionId;
  if (!sectionId) {
    return null;
  }
  const headerProps = canEditLayout
    ? ({
        "data-testid": "project-chat-floating-window-drag-handle",
        className: "cursor-move",
        onPointerDown: (event: PointerEvent<HTMLElement>) => {
          if (isInteractiveWindowHeaderTarget(event.target)) {
            return;
          }
          onFloatingDragPointerDown(event, pill);
        },
        onPointerMove: onFloatingDragPointerMove,
        onPointerUp: onFloatingDragPointerUp,
      } as Omit<ComponentPropsWithoutRef<"header">, "children" | "ref">)
    : null;

  return (
    <SectionWindowSurface
      sectionId={sectionId}
      roundedClassName={roundedClassName}
      chatHost={ChatWindowPlacementEnum.floating}
      chatModeOverride={pill.mode}
      headerActions={
        canEditLayout ? (
          <>
            {canShowCanvasAction ? (
              <button
                type="button"
                className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
                onClick={() => {
                  onShowInCanvas(pill.instanceId);
                }}
                aria-label={getWindowControlQuickInfoText({
                  action: "show_in_canvas",
                  title: pill.title,
                })}
                data-testid="project-chat-window-show-in-canvas"
                data-chat-window-instance-id={pill.instanceId}
                {...getWindowControlQuickInfoHandlers({
                  action: "show_in_canvas",
                  title: pill.title,
                })}
              >
                <MdFlipToFront size={12} />
              </button>
            ) : null}
            <button
              type="button"
              className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
              onClick={() => {
                onDockWindow(pill.instanceId);
              }}
              aria-label={getWindowControlQuickInfoText({
                action: "dock_window",
                title: pill.title,
              })}
              data-testid="project-chat-window-dock"
              data-chat-window-instance-id={pill.instanceId}
              {...getWindowControlQuickInfoHandlers({
                action: "dock_window",
                title: pill.title,
              })}
            >
              <MdVerticalAlignBottom size={12} />
            </button>
            <button
              type="button"
              className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
              onClick={() => {
                onMaximizeWindow(pill.instanceId);
              }}
              aria-label={getWindowControlQuickInfoText({
                action: "maximize_window",
                title: pill.title,
              })}
              data-testid="project-chat-window-maximize"
              data-chat-window-instance-id={pill.instanceId}
              {...getWindowControlQuickInfoHandlers({
                action: "maximize_window",
                title: pill.title,
              })}
            >
              {WINDOW_MAXIMIZE_ICON}
            </button>
            <button
              type="button"
              className={SECTION_WINDOW_MINIMIZE_BUTTON_CLASS}
              onClick={() => {
                onMinimizeWindow(pill.instanceId);
              }}
              aria-label={getWindowControlQuickInfoText({
                action: "minimize_window",
                title: pill.title,
              })}
              data-testid="project-chat-window-minimize"
              data-chat-window-instance-id={pill.instanceId}
              {...getWindowControlQuickInfoHandlers({
                action: "minimize_window",
                title: pill.title,
              })}
            >
              <i className="gg-math-minus" />
            </button>
            <button
              type="button"
              className={SECTION_WINDOW_CLOSE_BUTTON_CLASS}
              onClick={() => {
                onCloseWindow(pill.instanceId);
              }}
              aria-label={getWindowControlQuickInfoText({
                action: "close_window",
                title: pill.title,
              })}
              data-testid="project-chat-window-close"
              data-chat-window-instance-id={pill.instanceId}
              {...getWindowControlQuickInfoHandlers({
                action: "close_window",
                title: pill.title,
              })}
            >
              <i className="gg-close" />
            </button>
          </>
        ) : null
      }
      {...(headerProps ? { headerProps } : {})}
    />
  );
}

export function FloatingProjectWindowSurface({
  pill,
  projectConfigId,
  canEditLayout,
  roundedClassName,
  onFocusWindow,
  onShowInCanvas,
  onDockWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onCloseWindow,
  onSetWindowTitle,
  onFloatingDragPointerDown,
  onFloatingDragPointerMove,
  onFloatingDragPointerUp,
}: FloatingWindowSurfaceProps) {
  const canShowCanvasAction = canMoveProjectChatWindowToCanvas(pill.mode);
  const titleCommit =
    pill.mode === ChatWindowModeEnum.git_graph_mode
      ? undefined
      : (nextTitle: string) => {
          onSetWindowTitle(pill.instanceId, nextTitle);
        };

  return (
    <ProjectChatWindowSurface
      title={pill.title}
      mode={pill.mode}
      instanceId={pill.instanceId}
      allowLayoutMutations={canEditLayout}
      roundedClassName={roundedClassName}
      headerClassName="cursor-move"
      onTitleClick={() => {
        onFocusWindow(pill.instanceId);
      }}
      {...(titleCommit ? { onTitleCommit: titleCommit } : {})}
      dragHandleTestId="project-chat-floating-window-drag-handle"
      onTitlePointerDown={(event) => {
        onFloatingDragPointerDown(event, pill);
      }}
      onTitlePointerMove={onFloatingDragPointerMove}
      onTitlePointerUp={onFloatingDragPointerUp}
      actions={[
        ...(canShowCanvasAction
          ? [
              {
                key: "show_in_canvas",
                label: `Show ${pill.title} in canvas`,
                testId: "project-chat-window-show-in-canvas",
                instanceId: pill.instanceId,
                icon: <MdFlipToFront size={12} />,
                onClick: () => {
                  onShowInCanvas(pill.instanceId);
                },
              },
            ]
          : []),
        {
          key: "dock",
          label: `Dock ${pill.title}`,
          testId: "project-chat-window-dock",
          instanceId: pill.instanceId,
          icon: <MdVerticalAlignBottom size={12} />,
          onClick: () => {
            onDockWindow(pill.instanceId);
          },
        },
        {
          key: "maximize",
          label: `Maximize ${pill.title}`,
          testId: "project-chat-window-maximize",
          instanceId: pill.instanceId,
          icon: WINDOW_MAXIMIZE_ICON,
          onClick: () => {
            onMaximizeWindow(pill.instanceId);
          },
        },
        {
          key: "minimize",
          label: `Minimize ${pill.title}`,
          testId: "project-chat-window-minimize",
          instanceId: pill.instanceId,
          className: SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
          icon: <i className="gg-math-minus" />,
          onClick: () => {
            onMinimizeWindow(pill.instanceId);
          },
        },
        {
          key: "close",
          label: `Close ${pill.title}`,
          testId: "project-chat-window-close",
          instanceId: pill.instanceId,
          className: SECTION_WINDOW_CLOSE_BUTTON_CLASS,
          icon: <i className="gg-close" />,
          onClick: () => {
            onCloseWindow(pill.instanceId);
          },
        },
      ]}
    >
      <ProjectChatWindowContent
        pill={pill}
        projectConfigId={projectConfigId}
        host={ChatWindowPlacementEnum.floating}
      />
    </ProjectChatWindowSurface>
  );
}

export function FloatingWindowPanel({
  pill,
  projectConfigId,
  canEditLayout,
  bounds,
  floatingSnapPreset,
  floatingExitAnimation,
  floatingEnterAnimation,
  floatingEnterAnimationPrime,
  onFocusWindow,
  onShowInCanvas,
  onDockWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onCloseWindow,
  onSetWindowTitle,
  onFloatingDragPointerDown,
  onFloatingDragPointerMove,
  onFloatingDragPointerUp,
  onFloatingResizePointerDown,
  onFloatingResizePointerMove,
  onFloatingResizePointerUp,
}: FloatingWindowPanelProps) {
  const roundedClassName = floatingSnapPreset
    ? "rounded-none"
    : WINDOWED_CHAT_ROUNDED_CLASS;

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
      data-chat-window-exit-animation={floatingExitAnimation ?? undefined}
      data-chat-window-enter-animation={floatingEnterAnimation ?? undefined}
      onPointerDown={() => {
        onFocusWindow(pill.instanceId);
      }}
    >
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {pill.sectionId ? (
          <FloatingSectionWindowSurface
            pill={pill}
            projectConfigId={projectConfigId}
            canEditLayout={canEditLayout}
            roundedClassName={roundedClassName}
            onFocusWindow={onFocusWindow}
            onShowInCanvas={onShowInCanvas}
            onDockWindow={onDockWindow}
            onMaximizeWindow={onMaximizeWindow}
            onMinimizeWindow={onMinimizeWindow}
            onCloseWindow={onCloseWindow}
            onSetWindowTitle={onSetWindowTitle}
            onFloatingDragPointerDown={onFloatingDragPointerDown}
            onFloatingDragPointerMove={onFloatingDragPointerMove}
            onFloatingDragPointerUp={onFloatingDragPointerUp}
            onFloatingResizePointerDown={onFloatingResizePointerDown}
            onFloatingResizePointerMove={onFloatingResizePointerMove}
            onFloatingResizePointerUp={onFloatingResizePointerUp}
          />
        ) : (
          <FloatingProjectWindowSurface
            pill={pill}
            projectConfigId={projectConfigId}
            canEditLayout={canEditLayout}
            roundedClassName={roundedClassName}
            onFocusWindow={onFocusWindow}
            onShowInCanvas={onShowInCanvas}
            onDockWindow={onDockWindow}
            onMaximizeWindow={onMaximizeWindow}
            onMinimizeWindow={onMinimizeWindow}
            onCloseWindow={onCloseWindow}
            onSetWindowTitle={onSetWindowTitle}
            onFloatingDragPointerDown={onFloatingDragPointerDown}
            onFloatingDragPointerMove={onFloatingDragPointerMove}
            onFloatingDragPointerUp={onFloatingDragPointerUp}
            onFloatingResizePointerDown={onFloatingResizePointerDown}
            onFloatingResizePointerMove={onFloatingResizePointerMove}
            onFloatingResizePointerUp={onFloatingResizePointerUp}
          />
        )}
        {floatingSnapPreset || !canEditLayout ? null : (
          <FloatingWindowResizeHandles
            pill={pill}
            onPointerDown={onFloatingResizePointerDown}
            onPointerMove={onFloatingResizePointerMove}
            onPointerUp={onFloatingResizePointerUp}
          />
        )}
      </div>
    </article>
  );
}

export type FloatingWindowsLayerProps = {
  openFloatingPills: ResolvedWindowPill[];
  projectConfigId: string;
  canEditLayout: boolean;
  floatingBoundsById: Record<string, ChatWindowBounds>;
  floatingSnapPresetById: Record<string, FloatingSnapPreset>;
  windowExitAnimationsById: Record<string, ChatWindowExitAnimationKind>;
  windowEnterAnimationsById: Record<string, ChatWindowEnterAnimationKind>;
  windowEnterAnimationPrimesById: Record<string, ChatWindowEnterAnimationKind>;
  onFocusWindow: (instanceId: string) => void;
  onShowInCanvas: (instanceId: string) => void;
  onDockWindow: (instanceId: string) => void;
  onMaximizeWindow: (instanceId: string) => void;
  onMinimizeWindow: (instanceId: string) => void;
  onCloseWindow: (instanceId: string) => void;
  onSetWindowTitle: (instanceId: string, nextTitle: string) => void;
  onFloatingDragPointerDown: (
    event: PointerEvent<HTMLElement>,
    pill: ResolvedWindowPill,
  ) => void;
  onFloatingDragPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onFloatingDragPointerUp: (event: PointerEvent<HTMLElement>) => void;
  onFloatingResizePointerDown: (
    event: PointerEvent<HTMLDivElement>,
    pill: ResolvedWindowPill,
    direction: WindowResizeDirection,
  ) => void;
  onFloatingResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onFloatingResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
};

export function FloatingWindowsLayer({
  openFloatingPills,
  projectConfigId,
  canEditLayout,
  floatingBoundsById,
  floatingSnapPresetById,
  windowExitAnimationsById,
  windowEnterAnimationsById,
  windowEnterAnimationPrimesById,
  onFocusWindow,
  onShowInCanvas,
  onDockWindow,
  onMaximizeWindow,
  onMinimizeWindow,
  onCloseWindow,
  onSetWindowTitle,
  onFloatingDragPointerDown,
  onFloatingDragPointerMove,
  onFloatingDragPointerUp,
  onFloatingResizePointerDown,
  onFloatingResizePointerMove,
  onFloatingResizePointerUp,
}: FloatingWindowsLayerProps) {
  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: CHAT_WINDOW_CHROME_LAYER_Z_INDEX }}
    >
      {openFloatingPills.map((pill) => (
        <FloatingWindowPanel
          key={pill.instanceId}
          pill={pill}
          projectConfigId={projectConfigId}
          canEditLayout={canEditLayout}
          bounds={floatingBoundsById[pill.instanceId] ?? pill.bounds}
          floatingSnapPreset={floatingSnapPresetById[pill.instanceId] ?? null}
          floatingExitAnimation={
            windowExitAnimationsById[pill.instanceId] ?? null
          }
          floatingEnterAnimation={
            windowEnterAnimationsById[pill.instanceId] ?? null
          }
          floatingEnterAnimationPrime={
            windowEnterAnimationPrimesById[pill.instanceId] ?? null
          }
          onFocusWindow={onFocusWindow}
          onShowInCanvas={onShowInCanvas}
          onDockWindow={onDockWindow}
          onMaximizeWindow={onMaximizeWindow}
          onMinimizeWindow={onMinimizeWindow}
          onCloseWindow={onCloseWindow}
          onSetWindowTitle={onSetWindowTitle}
          onFloatingDragPointerDown={onFloatingDragPointerDown}
          onFloatingDragPointerMove={onFloatingDragPointerMove}
          onFloatingDragPointerUp={onFloatingDragPointerUp}
          onFloatingResizePointerDown={onFloatingResizePointerDown}
          onFloatingResizePointerMove={onFloatingResizePointerMove}
          onFloatingResizePointerUp={onFloatingResizePointerUp}
        />
      ))}
    </div>
  );
}

export type FloatingSnapResizeOverlayProps = {
  handles: FloatingSnapResizeHandle[];
  onPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    handle: FloatingSnapResizeHandle,
  ) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
};

export function FloatingSnapResizeOverlay({
  handles,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: FloatingSnapResizeOverlayProps) {
  return (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: CHAT_WINDOW_SNAP_PREVIEW_Z_INDEX }}
    >
      {handles.map((handle) => {
        const handleLengthPx = Math.max(
          0,
          handle.end - handle.start - FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
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
                      handleLengthPx + FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                    ),
                  }
                : {
                    left: handle.start,
                    top:
                      handle.coordinate -
                      FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX / 2,
                    width: Math.max(
                      FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                      handleLengthPx + FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                    ),
                    height: FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                  }
            }
            onPointerDown={(event) => {
              onPointerDown(event, handle);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
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
  );
}
