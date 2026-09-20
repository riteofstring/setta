import { type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { FiMaximize2, FiMinimize2, FiMinus, FiX } from "react-icons/fi";
import { MdFlipToFront, MdVerticalAlignBottom } from "react-icons/md";
import { WorkspaceSectionSurface } from "../section/WorkspaceSectionSurface";
import {
  WORKSPACE_WINDOW_FREE_RESIZE_DIRECTIONS,
  type WorkspaceFreeResizeDirection,
  type WorkspaceWindowSnapPreview,
} from "./workspaceWindowManagerInteractions";
import {
  WorkspaceWindowActionButton,
  WorkspaceWindowSurface,
  type WorkspaceWindowSurfaceAction,
} from "./WorkspaceWindowSurface";
import {
  classifyWorkspaceFloatingSnapPreset,
  resolveWorkspaceWindowWorkArea,
  type WorkspaceFloatingSnapResizeSeam,
} from "./windowingSnapLayout";
import {
  type WorkspaceFloatingSnapPreset,
  type WorkspaceFloatingWindow,
  type WorkspaceWindowBounds,
  type WorkspaceWindowViewport,
} from "./windowingTypes";

const SNAP_RESIZE_HIT_SIZE_PX = 8;

export type WorkspaceManagedWindowAction =
  "close" | "dock" | "maximize" | "minimize" | "restore" | "show_in_canvas";

export type WorkspaceWindowRenderer = (
  window: WorkspaceFloatingWindow,
) => ReactNode;

export type WorkspaceWindowRenderers = Readonly<
  Record<string, WorkspaceWindowRenderer>
>;

type WorkspaceManagedWindowProps = {
  window: WorkspaceFloatingWindow;
  bounds: WorkspaceWindowBounds;
  snapPreset: WorkspaceFloatingSnapPreset | null;
  zIndex: number;
  layoutEditable: boolean;
  focused: boolean;
  renderers: WorkspaceWindowRenderers;
  onFocus: (windowId: string) => void;
  onAction: (windowId: string, action: WorkspaceManagedWindowAction) => void;
  onTitleCommit: (windowId: string, title: string) => void;
  onTitlePointerDown: (
    event: PointerEvent<HTMLElement>,
    window: WorkspaceFloatingWindow,
  ) => void;
  onTitlePointerMove: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerUp: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onFreeResizePointerDown: (
    event: PointerEvent<HTMLDivElement>,
    window: WorkspaceFloatingWindow,
    direction: WorkspaceFreeResizeDirection,
  ) => void;
  onFreeResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onFreeResizeFinish: (
    event: PointerEvent<HTMLDivElement>,
    commit: boolean,
  ) => void;
};

type WorkspaceWindowTitlePointerProps = {
  onTitlePointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerMove?: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerUp?: (event: PointerEvent<HTMLElement>) => void;
  onTitlePointerCancel?: (event: PointerEvent<HTMLElement>) => void;
};

function getWindowStyle(
  bounds: WorkspaceWindowBounds,
  zIndex: number,
): CSSProperties {
  return {
    height: bounds.height,
    left: bounds.x,
    pointerEvents: "auto",
    top: bounds.y,
    width: bounds.width,
    zIndex,
  };
}

function getWindowActions(
  window: WorkspaceFloatingWindow,
  onAction: WorkspaceManagedWindowProps["onAction"],
): readonly WorkspaceWindowSurfaceAction[] {
  const actions: WorkspaceWindowSurfaceAction[] = [];
  if (window.sectionId !== null) {
    actions.push({
      icon: <MdFlipToFront aria-hidden="true" size={12} />,
      id: "show_in_canvas",
      isLayoutAction: true,
      label: `Show ${window.title} in canvas`,
      onClick: () => onAction(window.id, "show_in_canvas"),
      testId: "workspace-window-show-in-canvas",
    });
  }
  if (window.placement === "maximized") {
    actions.push({
      icon: <FiMinimize2 aria-hidden="true" size={12} />,
      id: "restore",
      isLayoutAction: true,
      label: `Restore ${window.title}`,
      onClick: () => onAction(window.id, "restore"),
      testId: "workspace-window-restore",
    });
  }
  actions.push({
    icon: <MdVerticalAlignBottom aria-hidden="true" size={12} />,
    id: "dock",
    isLayoutAction: true,
    label: `Dock ${window.title}`,
    onClick: () => onAction(window.id, "dock"),
    testId: "workspace-window-dock",
  });
  if (window.placement !== "maximized") {
    actions.push({
      icon: <FiMaximize2 aria-hidden="true" size={12} />,
      id: "maximize",
      isLayoutAction: true,
      label: `Maximize ${window.title}`,
      onClick: () => onAction(window.id, "maximize"),
      testId: "workspace-window-maximize",
    });
  }
  actions.push(
    {
      icon: <FiMinus aria-hidden="true" size={12} />,
      id: "minimize",
      isLayoutAction: true,
      label: `Minimize ${window.title}`,
      onClick: () => onAction(window.id, "minimize"),
      testId: "workspace-window-minimize",
      tone: "minimize",
    },
    {
      icon: <FiX aria-hidden="true" size={12} />,
      id: "close",
      isLayoutAction: true,
      label: `Close ${window.title}`,
      onClick: () => onAction(window.id, "close"),
      testId: "workspace-window-close",
      tone: "close",
    },
  );
  return actions;
}

function getWorkspaceWindowSurfaceDragProps({
  onTitlePointerCancel,
  onTitlePointerDown,
  onTitlePointerMove,
  onTitlePointerUp,
  window,
}: Pick<
  WorkspaceManagedWindowProps,
  | "onTitlePointerCancel"
  | "onTitlePointerDown"
  | "onTitlePointerMove"
  | "onTitlePointerUp"
  | "window"
>): WorkspaceWindowTitlePointerProps {
  if (window.placement !== "floating") return {};
  return {
    onTitlePointerCancel,
    onTitlePointerDown: (event) => onTitlePointerDown(event, window),
    onTitlePointerMove,
    onTitlePointerUp,
  };
}

function canWorkspaceWindowFreeResize(
  layoutEditable: boolean,
  window: WorkspaceFloatingWindow,
  snapPreset: WorkspaceFloatingSnapPreset | null,
): boolean {
  return (
    layoutEditable && window.placement === "floating" && snapPreset === null
  );
}

function WorkspaceWindowFreeResizeHandles({
  onFreeResizeFinish,
  onFreeResizePointerDown,
  onFreeResizePointerMove,
  window,
}: Pick<
  WorkspaceManagedWindowProps,
  | "onFreeResizeFinish"
  | "onFreeResizePointerDown"
  | "onFreeResizePointerMove"
  | "window"
>) {
  return (
    <>
      {WORKSPACE_WINDOW_FREE_RESIZE_DIRECTIONS.map((direction) => (
        <div
          key={direction}
          aria-hidden="true"
          className="setta-workspace-window-manager-free-resize-handle"
          style={{ pointerEvents: "auto" }}
          data-testid="workspace-window-free-resize-handle"
          data-direction={direction}
          onPointerCancel={(event) => onFreeResizeFinish(event, false)}
          onPointerDown={(event) =>
            onFreeResizePointerDown(event, window, direction)
          }
          onPointerMove={onFreeResizePointerMove}
          onPointerUp={(event) => onFreeResizeFinish(event, true)}
        />
      ))}
    </>
  );
}

function isInteractiveWorkspaceWindowHeaderTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false;

  const interactiveTarget = target.closest(
    "button, [role='button'], [role='menuitem'], input, textarea, select, a, [contenteditable='true']",
  );
  return (
    interactiveTarget !== null &&
    !interactiveTarget.matches(
      "[data-setta-workspace-section-title-display='true']",
    )
  );
}

function renderSectionWindowActions(
  actions: readonly WorkspaceWindowSurfaceAction[],
  windowId: string,
): ReactNode {
  return actions.map((action) => (
    <WorkspaceWindowActionButton
      key={action.id}
      action={action}
      windowId={windowId}
    />
  ));
}

type WorkspaceManagedWindowFrameProps = {
  readonly actions: readonly WorkspaceWindowSurfaceAction[];
  readonly layoutEditable: boolean;
  readonly onFocus: () => void;
  readonly onTitleCommit: (title: string) => void;
  readonly renderers: WorkspaceWindowRenderers;
  readonly titlePointerProps?: WorkspaceWindowTitlePointerProps;
  readonly window: WorkspaceFloatingWindow;
};

export function WorkspaceManagedWindowFrame({
  actions,
  layoutEditable,
  onFocus,
  onTitleCommit,
  renderers,
  titlePointerProps = {},
  window,
}: WorkspaceManagedWindowFrameProps) {
  if (window.sectionId !== null) {
    const headerProps =
      layoutEditable && titlePointerProps.onTitlePointerDown
        ? {
            "data-testid": "workspace-window-title-drag-handle",
            "data-workspace-window-drag-handle": "true",
            className: "cursor-move",
            onPointerCancel: titlePointerProps.onTitlePointerCancel,
            onPointerDown: (event: PointerEvent<HTMLElement>) => {
              if (isInteractiveWorkspaceWindowHeaderTarget(event.target))
                return;
              titlePointerProps.onTitlePointerDown?.(event);
            },
            onPointerMove: titlePointerProps.onTitlePointerMove,
            onPointerUp: titlePointerProps.onTitlePointerUp,
          }
        : undefined;
    return (
      <WorkspaceSectionSurface
        dataTestId="section-window-surface"
        headerActions={
          layoutEditable ? renderSectionWindowActions(actions, window.id) : null
        }
        headerProps={headerProps}
        sectionId={window.sectionId}
      />
    );
  }
  return (
    <WorkspaceWindowSurface
      {...titlePointerProps}
      actions={actions}
      allowLayoutMutations={layoutEditable}
      dragHandleTestId="workspace-window-title-drag-handle"
      onFocus={onFocus}
      onTitleCommit={onTitleCommit}
      title={window.title}
      windowId={window.id}
    >
      {renderWorkspaceManagedWindowContent(window, renderers)}
    </WorkspaceWindowSurface>
  );
}

function WorkspaceManagedWindow({
  bounds,
  focused,
  layoutEditable,
  onAction,
  onFocus,
  onFreeResizeFinish,
  onFreeResizePointerDown,
  onFreeResizePointerMove,
  onTitleCommit,
  onTitlePointerDown,
  onTitlePointerMove,
  onTitlePointerCancel,
  onTitlePointerUp,
  renderers,
  snapPreset,
  window,
  zIndex,
}: WorkspaceManagedWindowProps) {
  const isMaximized = window.placement === "maximized";
  const titlePointerProps = getWorkspaceWindowSurfaceDragProps({
    onTitlePointerCancel,
    onTitlePointerDown,
    onTitlePointerMove,
    onTitlePointerUp,
    window,
  });
  const canFreeResize = canWorkspaceWindowFreeResize(
    layoutEditable,
    window,
    snapPreset,
  );
  return (
    <article
      aria-label={`Window ${window.title}`}
      className="setta-workspace-window-manager-window"
      style={getWindowStyle(bounds, zIndex)}
      data-testid="workspace-window-manager-window"
      data-focused={String(focused)}
      data-workspace-window-id={window.id}
      data-workspace-window-maximized={isMaximized || undefined}
      data-workspace-window-snap-preset={snapPreset ?? undefined}
      onClick={() => globalThis.setTimeout(() => onFocus(window.id), 0)}
      onKeyDown={() => globalThis.setTimeout(() => onFocus(window.id), 0)}
    >
      <WorkspaceManagedWindowFrame
        actions={getWindowActions(window, onAction)}
        layoutEditable={layoutEditable}
        onFocus={() => onFocus(window.id)}
        onTitleCommit={(title) => onTitleCommit(window.id, title)}
        renderers={renderers}
        titlePointerProps={titlePointerProps}
        window={window}
      />
      {canFreeResize ? (
        <WorkspaceWindowFreeResizeHandles
          onFreeResizeFinish={onFreeResizeFinish}
          onFreeResizePointerDown={onFreeResizePointerDown}
          onFreeResizePointerMove={onFreeResizePointerMove}
          window={window}
        />
      ) : null}
    </article>
  );
}

type WorkspaceWindowManagerWindowsProps = Omit<
  WorkspaceManagedWindowProps,
  | "bounds"
  | "focused"
  | "onTitlePointerCancel"
  | "onTitlePointerUp"
  | "snapPreset"
  | "window"
  | "zIndex"
> & {
  readonly focusedWindowId: string | null;
  readonly previewBoundsByWindowId: Readonly<
    Record<string, WorkspaceWindowBounds>
  >;
  readonly presentationZIndexByWindowId: Readonly<Record<string, number>>;
  readonly readOnlyResizeBoundsByWindowId: Readonly<
    Record<string, WorkspaceWindowBounds>
  >;
  readonly renderers: WorkspaceWindowRenderers;
  readonly viewport: WorkspaceWindowViewport | null;
  readonly windows: readonly WorkspaceFloatingWindow[];
  onTitlePointerFinish: (
    event: PointerEvent<HTMLElement>,
    commit: boolean,
  ) => void;
};

function getWorkspaceWindowMaximizedBounds(
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowBounds {
  const workArea = resolveWorkspaceWindowWorkArea(viewport);
  return {
    height: workArea.height,
    width: workArea.width,
    x: workArea.minX,
    y: workArea.minY,
  };
}

function getWorkspaceManagedWindowBounds({
  layoutEditable,
  previewBoundsByWindowId,
  readOnlyResizeBoundsByWindowId,
  viewport,
  window,
}: Pick<
  WorkspaceWindowManagerWindowsProps,
  | "layoutEditable"
  | "previewBoundsByWindowId"
  | "readOnlyResizeBoundsByWindowId"
  | "viewport"
> & { readonly window: WorkspaceFloatingWindow }): WorkspaceWindowBounds {
  if (window.placement === "maximized") {
    return viewport
      ? getWorkspaceWindowMaximizedBounds(viewport)
      : window.bounds;
  }
  const previewBounds = previewBoundsByWindowId[window.id];
  if (previewBounds) return previewBounds;
  return layoutEditable
    ? window.bounds
    : (readOnlyResizeBoundsByWindowId[window.id] ?? window.bounds);
}

function getWorkspaceManagedWindowSnapPreset(
  window: WorkspaceFloatingWindow,
  bounds: WorkspaceWindowBounds,
  viewport: WorkspaceWindowViewport | null,
): WorkspaceFloatingSnapPreset | null {
  if (!viewport || window.placement !== "floating") return null;
  return classifyWorkspaceFloatingSnapPreset(bounds, viewport);
}

function renderWorkspaceManagedWindowContent(
  window: WorkspaceFloatingWindow,
  renderers: WorkspaceWindowRenderers,
): ReactNode {
  const renderer = renderers[window.surfaceKind];
  return renderer ? (
    renderer(window)
  ) : (
    <div
      className="setta-workspace-window-manager-missing-renderer"
      role="status"
      data-testid="workspace-window-missing-renderer"
    >
      No renderer is registered for {window.surfaceKind}.
    </div>
  );
}

export function WorkspaceWindowManagerWindows({
  focusedWindowId,
  layoutEditable,
  onAction,
  onFocus,
  onFreeResizeFinish,
  onFreeResizePointerDown,
  onFreeResizePointerMove,
  onTitleCommit,
  onTitlePointerDown,
  onTitlePointerFinish,
  onTitlePointerMove,
  presentationZIndexByWindowId,
  previewBoundsByWindowId,
  readOnlyResizeBoundsByWindowId,
  renderers,
  viewport,
  windows,
}: WorkspaceWindowManagerWindowsProps) {
  return (
    <>
      {windows.map((window) => {
        const bounds = getWorkspaceManagedWindowBounds({
          layoutEditable,
          previewBoundsByWindowId,
          readOnlyResizeBoundsByWindowId,
          viewport,
          window,
        });
        return (
          <WorkspaceManagedWindow
            key={window.id}
            bounds={bounds}
            focused={focusedWindowId === window.id}
            layoutEditable={layoutEditable}
            onAction={onAction}
            onFocus={onFocus}
            onFreeResizeFinish={onFreeResizeFinish}
            onFreeResizePointerDown={onFreeResizePointerDown}
            onFreeResizePointerMove={onFreeResizePointerMove}
            onTitleCommit={onTitleCommit}
            onTitlePointerCancel={(event) => onTitlePointerFinish(event, false)}
            onTitlePointerDown={onTitlePointerDown}
            onTitlePointerMove={onTitlePointerMove}
            onTitlePointerUp={(event) => onTitlePointerFinish(event, true)}
            renderers={renderers}
            snapPreset={getWorkspaceManagedWindowSnapPreset(
              window,
              bounds,
              viewport,
            )}
            window={window}
            zIndex={presentationZIndexByWindowId[window.id] ?? window.zIndex}
          />
        );
      })}
    </>
  );
}

export function WorkspaceWindowManagerSnapPreview({
  preview,
  zIndex,
}: {
  preview: WorkspaceWindowSnapPreview;
  zIndex: number;
}) {
  return (
    <div
      aria-hidden="true"
      className="setta-workspace-window-manager-snap-preview"
      style={{
        height: preview.bounds.height,
        left: preview.bounds.x,
        top: preview.bounds.y,
        width: preview.bounds.width,
        zIndex,
      }}
      data-testid="workspace-window-snap-preview"
      data-workspace-window-snap-preset={preview.preset}
    />
  );
}

function getSnapResizeStyle(
  seam: WorkspaceFloatingSnapResizeSeam,
): CSSProperties {
  const length = Math.max(SNAP_RESIZE_HIT_SIZE_PX, seam.end - seam.start);
  return seam.axis === "vertical"
    ? {
        height: length,
        left: seam.coordinate - SNAP_RESIZE_HIT_SIZE_PX / 2,
        top: seam.start,
        width: SNAP_RESIZE_HIT_SIZE_PX,
      }
    : {
        height: SNAP_RESIZE_HIT_SIZE_PX,
        left: seam.start,
        top: seam.coordinate - SNAP_RESIZE_HIT_SIZE_PX / 2,
        width: length,
      };
}

export function WorkspaceWindowManagerSnapResizeHandle({
  seam,
  onPointerDown,
  onPointerMove,
  onPointerFinish,
  zIndex,
}: {
  seam: WorkspaceFloatingSnapResizeSeam;
  onPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    seam: WorkspaceFloatingSnapResizeSeam,
  ) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerFinish: (
    event: PointerEvent<HTMLDivElement>,
    commit: boolean,
  ) => void;
  zIndex: number;
}) {
  return (
    <div
      aria-orientation={seam.axis === "vertical" ? "vertical" : "horizontal"}
      className="setta-workspace-window-manager-snap-resize-handle"
      role="separator"
      style={{ ...getSnapResizeStyle(seam), pointerEvents: "auto", zIndex }}
      data-testid="workspace-window-snap-resize-handle"
      data-axis={seam.axis}
      onPointerCancel={(event) => onPointerFinish(event, false)}
      onPointerDown={(event) => onPointerDown(event, seam)}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => onPointerFinish(event, true)}
    />
  );
}
