import { MdOutlineWindow } from "react-icons/md";
import type { WorkspaceFloatingWindow } from "./windowingTypes.js";

type WorkspaceBottomDockManagerProps = {
  readonly layoutEditable: boolean;
  readonly onFocusWindow: (windowId: string) => void;
  readonly onMinimizeWindow: (windowId: string) => void;
  readonly onMoveWindowToCanvasSection: (windowId: string) => void;
  readonly onMoveWindowToFloating: (windowId: string) => void;
  readonly onOpenWindow: (window: WorkspaceFloatingWindow) => void;
  readonly windows: readonly WorkspaceFloatingWindow[];
};

type WorkspaceBottomDockManagerRowProps = Omit<
  WorkspaceBottomDockManagerProps,
  "windows"
> & {
  readonly window: WorkspaceFloatingWindow;
};

function getPlacementLabel(window: WorkspaceFloatingWindow): string {
  if (window.placement === "canvas_section") return "Canvas";
  if (window.placement === "bottom_docked") return "Docked";
  if (window.placement === "maximized") return "Maximized";
  return "Floating";
}

function needsReopen(window: WorkspaceFloatingWindow): boolean {
  return window.isClosed || window.isMinimized;
}

function WorkspaceBottomDockManagerPlacementActions({
  layoutEditable,
  onMoveWindowToCanvasSection,
  onMoveWindowToFloating,
  window,
}: Pick<
  WorkspaceBottomDockManagerRowProps,
  | "layoutEditable"
  | "onMoveWindowToCanvasSection"
  | "onMoveWindowToFloating"
  | "window"
>) {
  if (!layoutEditable || window.sectionId === null) return null;
  if (window.placement === "canvas_section") {
    return (
      <button
        aria-label={`Float ${window.title}`}
        data-testid="workspace-bottom-dock-manager-float"
        onClick={() => onMoveWindowToFloating(window.id)}
        role="menuitem"
        type="button"
      >
        Float
      </button>
    );
  }
  return (
    <button
      aria-label={`Show ${window.title} in canvas`}
      data-testid="workspace-bottom-dock-manager-move-to-canvas"
      onClick={() => onMoveWindowToCanvasSection(window.id)}
      role="menuitem"
      type="button"
    >
      Canvas
    </button>
  );
}

function WorkspaceBottomDockManagerRow({
  layoutEditable,
  onFocusWindow,
  onMinimizeWindow,
  onMoveWindowToCanvasSection,
  onMoveWindowToFloating,
  onOpenWindow,
  window,
}: WorkspaceBottomDockManagerRowProps) {
  const windowNeedsReopen = needsReopen(window);
  const externallyVisible =
    !windowNeedsReopen && window.placement !== "canvas_section";
  return (
    <div
      className="setta-workspace-bottom-dock-manager-row"
      data-testid="workspace-bottom-dock-manager-row"
      data-workspace-window-id={window.id}
      role="none"
    >
      <span className="setta-workspace-bottom-dock-manager-description">
        <span>{window.title}</span>
        <span>{getPlacementLabel(window)}</span>
      </span>
      <span className="setta-workspace-bottom-dock-manager-actions">
        <WorkspaceBottomDockManagerPlacementActions
          layoutEditable={layoutEditable}
          onMoveWindowToCanvasSection={onMoveWindowToCanvasSection}
          onMoveWindowToFloating={onMoveWindowToFloating}
          window={window}
        />
        {windowNeedsReopen ? (
          <button
            aria-label={`Reopen ${window.title}`}
            data-testid="workspace-bottom-dock-manager-reopen"
            onClick={() => onOpenWindow(window)}
            role="menuitem"
            type="button"
          >
            Reopen
          </button>
        ) : null}
        {layoutEditable && externallyVisible ? (
          <button
            aria-label={`Hide ${window.title}`}
            data-testid="workspace-bottom-dock-manager-hide"
            onClick={() => onMinimizeWindow(window.id)}
            role="menuitem"
            type="button"
          >
            Hide
          </button>
        ) : null}
        {externallyVisible ? (
          <button
            aria-label={`Focus ${window.title}`}
            data-testid="workspace-bottom-dock-manager-focus"
            onClick={() => onFocusWindow(window.id)}
            role="menuitem"
            type="button"
          >
            Focus
          </button>
        ) : null}
      </span>
    </div>
  );
}

export function WorkspaceBottomDockManager({
  windows,
  ...rowProps
}: WorkspaceBottomDockManagerProps) {
  return (
    <details
      className="setta-workspace-bottom-dock-manager"
      data-testid="workspace-bottom-dock-manager"
    >
      <summary aria-label="Show windows" title="Show windows">
        <MdOutlineWindow aria-hidden="true" size={14} />
      </summary>
      <div className="setta-workspace-bottom-dock-manager-menu" role="menu">
        {windows.map((window) => (
          <WorkspaceBottomDockManagerRow
            key={window.id}
            window={window}
            {...rowProps}
          />
        ))}
      </div>
    </details>
  );
}
