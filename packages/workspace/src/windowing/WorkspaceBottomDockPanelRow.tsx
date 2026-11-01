import type { PointerEvent } from "react";
import type { WorkspaceBottomDockRenderWindow } from "./WorkspaceBottomDock.js";
import {
  WORKSPACE_BOTTOM_DOCK_TITLE_DRAG_AFFORDANCE,
  type WorkspaceBottomDockResizeDirection,
  type WorkspaceBottomDockResizeHandlers,
  type WorkspaceBottomDockWindowAction,
} from "./workspaceBottomDockInternal.js";
import type { WorkspaceFloatingWindow } from "./windowingTypes.js";
import { WORKSPACE_BOTTOM_DOCK_DEFAULT_WINDOW_WIDTH_PX } from "./workspaceBottomDockLayout.js";

const WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_HEIGHT_PX = 220;

const RESIZE_HANDLES: readonly {
  readonly direction: WorkspaceBottomDockResizeDirection;
  readonly orientation: "horizontal" | "vertical";
}[] = [
  { direction: "top", orientation: "horizontal" },
  { direction: "bottom", orientation: "horizontal" },
  { direction: "top_left", orientation: "vertical" },
  { direction: "top_right", orientation: "vertical" },
  { direction: "bottom_left", orientation: "vertical" },
  { direction: "bottom_right", orientation: "vertical" },
];

type WorkspaceBottomDockPanelRowProps = {
  readonly bottom: number;
  readonly focusedWindowId: string | null;
  readonly height: number;
  readonly layoutEditable: boolean;
  readonly onCloseWindow: (windowId: string) => void;
  readonly onFocusWindow: (windowId: string) => void;
  readonly onMaximizeWindow: (windowId: string) => void;
  readonly onMinimizeWindow: (windowId: string) => void;
  readonly onMoveWindowToCanvasSection: (windowId: string) => void;
  readonly onMoveWindowToFloating: (windowId: string) => void;
  readonly onShowNextWindow: () => void;
  readonly onShowPreviousWindow: () => void;
  readonly resizeHandlers: WorkspaceBottomDockResizeHandlers;
  readonly right: number;
  readonly renderWindow: WorkspaceBottomDockRenderWindow;
  readonly showHeaderCycleControls: boolean;
  readonly showNextWindowDisabled: boolean;
  readonly showPreviousWindowDisabled: boolean;
  readonly width: number;
  readonly windowHeightsById: Readonly<Record<string, number>>;
  readonly windowWidthsById: Readonly<Record<string, number>>;
  readonly windows: readonly WorkspaceFloatingWindow[];
};

type WorkspaceBottomDockPanelProps = Omit<
  WorkspaceBottomDockPanelRowProps,
  "bottom" | "height" | "right" | "width" | "windows"
> & {
  readonly window: WorkspaceFloatingWindow;
};

type WorkspaceBottomDockActionCallbacks = Pick<
  WorkspaceBottomDockPanelRowProps,
  | "onCloseWindow"
  | "onMaximizeWindow"
  | "onMinimizeWindow"
  | "onMoveWindowToCanvasSection"
  | "onMoveWindowToFloating"
  | "onShowNextWindow"
  | "onShowPreviousWindow"
  | "showHeaderCycleControls"
  | "showNextWindowDisabled"
  | "showPreviousWindowDisabled"
>;

function createCycleActions(
  callbacks: WorkspaceBottomDockActionCallbacks,
): WorkspaceBottomDockWindowAction[] {
  if (!callbacks.showHeaderCycleControls) return [];
  return [
    {
      disabled: callbacks.showPreviousWindowDisabled,
      icon: <span aria-hidden="true">‹</span>,
      id: "cycle_backward",
      isLayoutAction: true,
      label: "Show previous docked window",
      onClick: callbacks.onShowPreviousWindow,
      testId: "workspace-bottom-dock-window-cycle-backward",
    },
    {
      disabled: callbacks.showNextWindowDisabled,
      icon: <span aria-hidden="true">›</span>,
      id: "cycle_forward",
      isLayoutAction: true,
      label: "Show next docked window",
      onClick: callbacks.onShowNextWindow,
      testId: "workspace-bottom-dock-window-cycle-forward",
    },
  ];
}

function createWindowActions(
  window: WorkspaceFloatingWindow,
  callbacks: WorkspaceBottomDockActionCallbacks,
  layoutEditable: boolean,
): readonly WorkspaceBottomDockWindowAction[] {
  if (!layoutEditable) return [];
  const actions = createCycleActions(callbacks);
  if (window.sectionId !== null) {
    actions.push({
      icon: <span aria-hidden="true">↙</span>,
      id: "show_in_canvas",
      isLayoutAction: true,
      label: `Show ${window.title} in canvas`,
      onClick: () => callbacks.onMoveWindowToCanvasSection(window.id),
      testId: "workspace-bottom-dock-window-show-in-canvas",
    });
  }
  actions.push(
    {
      icon: <span aria-hidden="true">↗</span>,
      id: "undock",
      isLayoutAction: true,
      label: `Undock ${window.title}`,
      onClick: () => callbacks.onMoveWindowToFloating(window.id),
      testId: "workspace-bottom-dock-window-undock",
    },
    {
      icon: <span aria-hidden="true">□</span>,
      id: "maximize",
      isLayoutAction: true,
      label: `Maximize ${window.title}`,
      onClick: () => callbacks.onMaximizeWindow(window.id),
      testId: "workspace-bottom-dock-window-maximize",
    },
    {
      icon: <span aria-hidden="true">−</span>,
      id: "minimize",
      isLayoutAction: true,
      label: `Minimize ${window.title}`,
      onClick: () => callbacks.onMinimizeWindow(window.id),
      testId: "workspace-bottom-dock-window-minimize",
    },
    {
      icon: <span aria-hidden="true">×</span>,
      id: "close",
      isLayoutAction: true,
      label: `Close ${window.title}`,
      onClick: () => callbacks.onCloseWindow(window.id),
      testId: "workspace-bottom-dock-window-close",
    },
  );
  return actions;
}

function WorkspaceBottomDockResizeHandles({
  layoutEditable,
  resizeHandlers,
  window,
}: Pick<
  WorkspaceBottomDockPanelProps,
  "layoutEditable" | "resizeHandlers" | "window"
>) {
  if (!layoutEditable) return null;
  return RESIZE_HANDLES.map((handle) => (
    <div
      key={`${window.id}-${handle.direction}`}
      aria-orientation={handle.orientation}
      className="setta-workspace-bottom-dock-resize-handle"
      role="separator"
      data-direction={handle.direction}
      data-testid="workspace-bottom-dock-resize-handle"
      data-workspace-window-id={window.id}
      onPointerCancel={(event) => resizeHandlers.finish(event, false)}
      onPointerDown={(event) =>
        resizeHandlers.begin(event, window, handle.direction)
      }
      onPointerMove={resizeHandlers.update}
      onPointerUp={(event) => resizeHandlers.finish(event, true)}
    />
  ));
}

function WorkspaceBottomDockPanel({
  focusedWindowId,
  layoutEditable,
  onFocusWindow,
  renderWindow,
  resizeHandlers,
  window,
  windowHeightsById,
  windowWidthsById,
  ...callbacks
}: WorkspaceBottomDockPanelProps) {
  const width =
    windowWidthsById[window.id] ??
    WORKSPACE_BOTTOM_DOCK_DEFAULT_WINDOW_WIDTH_PX;
  const height =
    windowHeightsById[window.id] ?? WORKSPACE_BOTTOM_DOCK_MIN_WINDOW_HEIGHT_PX;
  const focused = focusedWindowId === window.id;
  const focusWindow = () => onFocusWindow(window.id);
  return (
    <article
      aria-label={`Docked window ${window.title}`}
      className="setta-workspace-bottom-dock-panel"
      data-focused={String(focused)}
      data-testid="workspace-bottom-dock-window-panel"
      data-workspace-window-id={window.id}
      onPointerDown={focusWindow}
      style={{ height, width }}
    >
      <div className="setta-workspace-bottom-dock-panel-content">
        {renderWindow(window, {
          actions: createWindowActions(window, callbacks, layoutEditable),
          bounds: { ...window.bounds, height, width },
          focused,
          onFocus: focusWindow,
          titleDragAffordance: WORKSPACE_BOTTOM_DOCK_TITLE_DRAG_AFFORDANCE,
        })}
      </div>
      <WorkspaceBottomDockResizeHandles
        layoutEditable={layoutEditable}
        resizeHandlers={resizeHandlers}
        window={window}
      />
    </article>
  );
}

export function WorkspaceBottomDockPanelRow({
  bottom,
  height,
  right,
  width,
  windows,
  ...panelProps
}: WorkspaceBottomDockPanelRowProps) {
  if (windows.length === 0) return null;
  return (
    <section
      className="setta-workspace-bottom-dock-panels"
      data-testid="workspace-bottom-dock-window-grid"
      style={{ bottom, height, insetInlineEnd: right, width }}
    >
      {windows.map((window) => (
        <WorkspaceBottomDockPanel
          key={window.id}
          window={window}
          {...panelProps}
        />
      ))}
    </section>
  );
}
