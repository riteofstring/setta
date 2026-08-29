import { WorkspaceBottomDockManager } from "./WorkspaceBottomDockManager";
import type { WorkspaceBottomDockPillDisplayMode } from "./workspaceBottomDockLayout";
import type { WorkspaceFloatingWindow } from "./windowingTypes";

type WorkspaceBottomDockRecoveryStripProps = {
  readonly bottom: number;
  readonly layoutEditable: boolean;
  readonly maxPillCycleStartIndex: number;
  readonly onFocusWindow: (windowId: string) => void;
  readonly onMinimizeWindow: (windowId: string) => void;
  readonly onMoveWindowToCanvasSection: (windowId: string) => void;
  readonly onMoveWindowToFloating: (windowId: string) => void;
  readonly onOpenWindow: (window: WorkspaceFloatingWindow) => void;
  readonly onShowNextPills: () => void;
  readonly onShowPreviousPills: () => void;
  readonly panelWidth: number;
  readonly pillCycleStartIndex: number;
  readonly pillDisplayMode: WorkspaceBottomDockPillDisplayMode;
  readonly recoveryWindows: readonly WorkspaceFloatingWindow[];
  readonly right: number;
  readonly showManager: boolean;
  readonly stripAvailableWidth: number;
  readonly visibleDockedWindowCount: number;
  readonly visibleRecoveryWindows: readonly WorkspaceFloatingWindow[];
  readonly windows: readonly WorkspaceFloatingWindow[];
};

function isRestorePill(window: WorkspaceFloatingWindow): boolean {
  return window.isMinimized || window.isClosed;
}

function WorkspaceBottomDockOverflowMenu({
  recoveryWindows,
  onOpenWindow,
}: Pick<
  WorkspaceBottomDockRecoveryStripProps,
  "recoveryWindows" | "onOpenWindow"
>) {
  return (
    <details
      className="setta-workspace-bottom-dock-overflow-menu"
      data-testid="workspace-bottom-dock-overflow-menu"
    >
      <summary aria-label="Show more windows">⋯</summary>
      <div role="menu">
        {recoveryWindows.map((window) => (
          <button
            key={window.id}
            data-testid="workspace-bottom-dock-overflow-menu-item"
            data-workspace-window-id={window.id}
            onClick={() => onOpenWindow(window)}
            role="menuitem"
            type="button"
          >
            {window.title}
          </button>
        ))}
      </div>
    </details>
  );
}

function WorkspaceBottomDockRecoveryPill({
  compact,
  onOpenWindow,
  window,
}: {
  readonly compact: boolean;
  readonly onOpenWindow: (window: WorkspaceFloatingWindow) => void;
  readonly window: WorkspaceFloatingWindow;
}) {
  const label = isRestorePill(window)
    ? `Restore ${window.title}`
    : `Focus ${window.title}`;
  return (
    <button
      aria-label={label}
      className="setta-workspace-bottom-dock-pill"
      data-compact={compact ? "true" : undefined}
      data-testid="workspace-bottom-dock-pill"
      data-workspace-window-id={window.id}
      onClick={() => onOpenWindow(window)}
      title={window.title}
      type="button"
    >
      {compact ? (
        <span aria-hidden="true">□</span>
      ) : (
        <span>{window.title}</span>
      )}
    </button>
  );
}

function WorkspaceBottomDockPillCycleControls({
  maxPillCycleStartIndex,
  onShowNextPills,
  onShowPreviousPills,
  pillCycleStartIndex,
}: Pick<
  WorkspaceBottomDockRecoveryStripProps,
  | "maxPillCycleStartIndex"
  | "onShowNextPills"
  | "onShowPreviousPills"
  | "pillCycleStartIndex"
>) {
  return (
    <>
      <button
        aria-label="Show previous windows"
        className="setta-workspace-bottom-dock-cycle-button"
        data-testid="workspace-bottom-dock-pill-cycle-backward"
        disabled={pillCycleStartIndex <= 0}
        onClick={onShowPreviousPills}
        type="button"
      >
        ‹
      </button>
      <button
        aria-label="Show more windows"
        className="setta-workspace-bottom-dock-cycle-button"
        data-testid="workspace-bottom-dock-pill-cycle-forward"
        disabled={pillCycleStartIndex >= maxPillCycleStartIndex}
        onClick={onShowNextPills}
        type="button"
      >
        ›
      </button>
    </>
  );
}

function WorkspaceBottomDockRecoveryControls({
  maxPillCycleStartIndex,
  onOpenWindow,
  onShowNextPills,
  onShowPreviousPills,
  pillCycleStartIndex,
  pillDisplayMode,
  recoveryWindows,
  visibleRecoveryWindows,
}: Pick<
  WorkspaceBottomDockRecoveryStripProps,
  | "maxPillCycleStartIndex"
  | "onOpenWindow"
  | "onShowNextPills"
  | "onShowPreviousPills"
  | "pillCycleStartIndex"
  | "pillDisplayMode"
  | "recoveryWindows"
  | "visibleRecoveryWindows"
>) {
  if (recoveryWindows.length === 0) return null;
  if (pillDisplayMode === "menu") {
    return (
      <WorkspaceBottomDockOverflowMenu
        onOpenWindow={onOpenWindow}
        recoveryWindows={recoveryWindows}
      />
    );
  }
  const compact = pillDisplayMode === "compact" || pillDisplayMode === "cycle";
  const cycleControls =
    pillDisplayMode === "cycle" ? (
      <WorkspaceBottomDockPillCycleControls
        maxPillCycleStartIndex={maxPillCycleStartIndex}
        onShowNextPills={onShowNextPills}
        onShowPreviousPills={onShowPreviousPills}
        pillCycleStartIndex={pillCycleStartIndex}
      />
    ) : null;
  return (
    <>
      {cycleControls}
      {visibleRecoveryWindows.map((window) => (
        <WorkspaceBottomDockRecoveryPill
          key={window.id}
          compact={compact}
          onOpenWindow={onOpenWindow}
          window={window}
        />
      ))}
    </>
  );
}

export function WorkspaceBottomDockRecoveryStrip({
  bottom,
  panelWidth,
  right,
  showManager,
  stripAvailableWidth,
  visibleDockedWindowCount,
  ...props
}: WorkspaceBottomDockRecoveryStripProps) {
  const panelOffset = visibleDockedWindowCount > 0 ? panelWidth + 12 : 0;
  return (
    <nav
      aria-label="Window recovery and manager"
      className="setta-workspace-bottom-dock-strip"
      data-pill-display-mode={props.pillDisplayMode}
      data-testid="workspace-bottom-dock-strip"
      style={{
        bottom,
        insetInlineEnd: right + panelOffset,
        maxWidth: Math.max(0, stripAvailableWidth),
      }}
    >
      <WorkspaceBottomDockRecoveryControls {...props} />
      {showManager ? (
        <WorkspaceBottomDockManager
          layoutEditable={props.layoutEditable}
          onFocusWindow={props.onFocusWindow}
          onMinimizeWindow={props.onMinimizeWindow}
          onMoveWindowToCanvasSection={props.onMoveWindowToCanvasSection}
          onMoveWindowToFloating={props.onMoveWindowToFloating}
          onOpenWindow={props.onOpenWindow}
          windows={props.windows}
        />
      ) : null}
    </nav>
  );
}
