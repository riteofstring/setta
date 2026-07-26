import type { RefObject } from "react";

import type { WorkspaceRuntime } from "./workspace-runtime";
import { WorkspaceMobileControls } from "./workspace-mobile-controls";
import { overviewGhostLabel, type OverviewGhostTarget } from "./workspace-overview-ghost";
import { WorkspaceToolbar, openPaneActionForSurfaceKind } from "./workspace-toolbar";
import type { Rect, SurfaceKind, WorkspacePresentationMode } from "./types";

export function WorkspaceOverviewGhostButton({
  onOpen,
  presentationMode,
  target,
}: {
  onOpen: (target: OverviewGhostTarget) => void;
  presentationMode: WorkspacePresentationMode;
  target: OverviewGhostTarget | null;
}) {
  if (presentationMode !== "overview" || !target) {
    return null;
  }
  return (
    <button
      aria-label={overviewGhostLabel(target.placement)}
      className="workspace-overview-ghost-pane app-no-drag"
      data-workspace-overview-ghost="true"
      data-overview-ghost-pane-id={target.paneId}
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

export function WorkspaceToolbarLayer({
  debugRef,
  mobileLayout,
  onNativeOverlayActiveChange,
  overviewActive,
  runLayoutAction,
  runtime,
  showPerformanceStats,
}: {
  debugRef: RefObject<HTMLDivElement | null>;
  mobileLayout: boolean;
  onNativeOverlayActiveChange: (active: boolean) => void;
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
      onNativeOverlayActiveChange={onNativeOverlayActiveChange}
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
  return (
    <WorkspaceMobileControls
      moveFocus={(direction) => {
        dismissProjectPaneOverlay();
        runtime.store.moveFocus(direction, stageViewport());
        persistLayout();
      }}
      onNewPane={() => {
        dismissProjectPaneOverlay();
        runLayoutAction(() => runtime.store.openEmptyFrame());
      }}
      onOpenSettingsPane={() => {
        dismissProjectPaneOverlay();
        runLayoutAction(() => {
          focusOrOpenPaneBySurfaceKind(runtime, "settings-dom");
          runtime.store.ensureFocusedColumnVisible(stageViewport());
          runtime.store.snapScrollToTarget();
        });
      }}
      onToggleOverview={() => {
        dismissProjectPaneOverlay();
        runLayoutAction(() => runtime.store.toggleOverviewMode());
      }}
      onToggleProjectPane={onToggleProjectPane}
      overviewActive={overviewActive}
      projectPaneOpen={projectPaneOpen}
    />
  );
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
