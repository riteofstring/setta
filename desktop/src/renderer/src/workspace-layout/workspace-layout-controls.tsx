import type { RefObject } from "react";

import type { PaneDirection } from "./layout-engine-helpers";
import type { WorkspaceRuntime } from "./workspace-runtime";
import { WorkspaceMobileControls } from "./workspace-mobile-controls";
import { overviewGhostLabel, type OverviewGhostTarget } from "./workspace-overview-ghost";
import { WorkspaceToolbar, openPaneActionForSurfaceKind } from "./workspace-toolbar";
import type { Rect, SurfaceKind } from "./types";

export function WorkspaceOverviewGhostPane({
  onOpen,
  target,
}: {
  onOpen: (target: OverviewGhostTarget) => void;
  target: OverviewGhostTarget | null;
}) {
  if (!target) {
    return null;
  }
  return (
    <button
      aria-label={overviewGhostLabel(target.placement)}
      className="workspace-overview-ghost-pane app-no-drag"
      data-workspace-overview-ghost="true"
      data-overview-ghost-placement={target.placement}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen(target);
      }}
      style={{
        height: `${target.height.toFixed(2)}px`,
        left: `${target.left.toFixed(2)}px`,
        top: `${target.top.toFixed(2)}px`,
        width: `${target.width.toFixed(2)}px`,
      }}
      type="button"
    />
  );
}

export function WorkspaceDesktopToolbarLayer({
  debugRef,
  mobileLayout,
  overviewActive,
  runLayoutAction,
  runtime,
  showPerformanceStats,
}: {
  debugRef: RefObject<HTMLDivElement | null>;
  mobileLayout: boolean;
  overviewActive: boolean;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  showPerformanceStats: boolean;
}) {
  if (runtime.mode !== "workspace" || mobileLayout) {
    return null;
  }
  return (
    <WorkspaceToolbar
      openPane={(request) => runLayoutAction(() => runtime.store.openPane(request))}
      overviewActive={overviewActive}
      performanceStatsRef={showPerformanceStats ? debugRef : null}
      runLayoutAction={runLayoutAction}
      showPerformanceStats={showPerformanceStats}
      store={runtime.store}
    />
  );
}

export function WorkspaceMobileControlsLayer({
  dismissProjectPaneOverlay,
  mobileLayout,
  onToggleProjectPane,
  overviewActive,
  persistLayout,
  projectPaneOpen,
  runLayoutAction,
  runtime,
  stageViewport,
}: {
  dismissProjectPaneOverlay: () => void;
  mobileLayout: boolean;
  onToggleProjectPane: () => void;
  overviewActive: boolean;
  persistLayout: () => void;
  projectPaneOpen: boolean;
  runLayoutAction: (action: () => void) => void;
  runtime: WorkspaceRuntime;
  stageViewport: () => Rect;
}) {
  if (runtime.mode !== "workspace" || !mobileLayout) {
    return null;
  }
  const moveFocus = (direction: PaneDirection) => {
    dismissProjectPaneOverlay();
    runtime.store.moveFocus(direction, stageViewport());
    persistLayout();
  };
  const openNewPane = () => {
    dismissProjectPaneOverlay();
    runLayoutAction(() => runtime.store.openEmptyFrame());
  };
  const openSettingsPane = () => {
    dismissProjectPaneOverlay();
    runLayoutAction(() => {
      focusOrOpenPaneBySurfaceKind(runtime, "settings-dom");
      runtime.store.ensureFocusedColumnVisible(stageViewport());
      runtime.store.snapScrollToTarget();
    });
  };
  const toggleOverview = () => {
    dismissProjectPaneOverlay();
    runLayoutAction(() => runtime.store.toggleOverviewMode());
  };
  return (
    <WorkspaceMobileControls
      moveFocus={moveFocus}
      onNewPane={openNewPane}
      onOpenSettingsPane={openSettingsPane}
      onToggleOverview={toggleOverview}
      onToggleProjectPane={onToggleProjectPane}
      overviewActive={overviewActive}
      projectPaneOpen={projectPaneOpen}
    />
  );
}

export function overviewGhostTargetForPresentation(
  presentationMode: string,
  target: OverviewGhostTarget | null,
): OverviewGhostTarget | null {
  return presentationMode === "overview" ? target : null;
}

export function focusOrOpenPaneBySurfaceKind(
  runtime: WorkspaceRuntime,
  surfaceKind: SurfaceKind,
): void {
  const maximizedPaneId = runtime.store.getSnapshot().maximizedPaneId;
  if (maximizedPaneId !== null) {
    runtime.store.togglePaneMaximized(maximizedPaneId);
  }
  if (runtime.store.focusPaneBySurfaceKind(surfaceKind) !== null) {
    return;
  }
  const action = openPaneActionForSurfaceKind(surfaceKind);
  if (!action || !runtime.store.canOpenPane(action.request)) {
    return;
  }
  runtime.store.openPane(action.request);
}
