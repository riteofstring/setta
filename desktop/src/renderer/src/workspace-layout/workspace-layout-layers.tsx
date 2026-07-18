import type { RefObject } from "react";

import type { WorkspaceRuntime } from "./workspace-runtime";
import { WorkspaceMobileControls } from "./workspace-mobile-controls";
import { overviewGhostLabel, type OverviewGhostTarget } from "./workspace-overview-ghost";
import { WorkspaceToolbar } from "./workspace-toolbar";
import { executeWorkspaceFrameAction } from "./workspace-frame-actions";
import type { Rect, WorkspacePresentationMode } from "./types";

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
      onFrameAction={(action, placement) => {
        void executeWorkspaceFrameAction({ action, placement, runLayoutAction, runtime });
      }}
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
  onOpenSettingsPage,
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
  onOpenSettingsPage: () => void;
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
      onOpenSettingsPage={() => {
        dismissProjectPaneOverlay();
        onOpenSettingsPage();
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
