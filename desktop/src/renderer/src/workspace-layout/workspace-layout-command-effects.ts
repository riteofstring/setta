import { useCallback, useEffect } from "react";

import { workspaceOpenPaneRequestEvent } from "./open-pane-events";
import {
  configurePaneOperation,
  focusOrOpenPaneBySurfaceKindOperation,
  focusPaneOperation,
  openEmptyFrameNearOperation,
  openPaneFromFocusedColumnOperation,
  type WorkspaceLayoutAction,
  type WorkspaceLayoutOperation,
} from "./workspace-layout-operations";
import { focusOrOpenPaneBySurfaceKind } from "./workspace-layout-layers";
import { openPaneActionForSurfaceKind } from "./workspace-toolbar";
import type { OpenPaneRequest, Rect, SurfaceKind } from "./types";
import type { OverviewGhostTarget } from "./workspace-overview-ghost";
import type { WorkspaceRuntime } from "./workspace-runtime";

export interface WorkspaceSurfaceFocusRequest {
  requestId: number;
  surfaceKind: SurfaceKind;
}

export function useWorkspaceLayoutCommandEffects({
  clearOverviewInsertPreview,
  focusSurfaceRequest,
  runLayoutAction,
  runtime,
  stageViewport,
}: {
  clearOverviewInsertPreview: () => void;
  focusSurfaceRequest: WorkspaceSurfaceFocusRequest | null;
  runLayoutAction: (action: WorkspaceLayoutAction) => void;
  runtime: WorkspaceRuntime;
  stageViewport: () => Rect;
}) {
  const openOverviewGhostPane = useCallback(
    (target: OverviewGhostTarget) => {
      clearOverviewInsertPreview();
      runLayoutAction(() => {
        const operation = openEmptyFrameNearOperation(
          runtime.store,
          target.paneId,
          target.placement,
        );
        if (operation === null) {
          return null;
        }
        runtime.store.openEmptyFrameNear(target.paneId, target.placement);
        runtime.store.toggleOverviewMode();
        runtime.store.ensureFocusedPaneVisible(stageViewport());
        runtime.store.snapScrollToTarget();
        return operation;
      });
    },
    [clearOverviewInsertPreview, runLayoutAction, runtime, stageViewport],
  );

  useEffect(() => {
    if (!focusSurfaceRequest || runtime.mode !== "workspace") {
      return;
    }
    runLayoutAction(() => {
      const action = openPaneActionForSurfaceKind(focusSurfaceRequest.surfaceKind);
      const operation = focusOrOpenPaneBySurfaceKindOperation(
        runtime.store,
        focusSurfaceRequest.surfaceKind,
        action?.request ?? null,
      );
      focusOrOpenPaneBySurfaceKind(runtime, focusSurfaceRequest.surfaceKind);
      runtime.store.ensureFocusedColumnVisible(stageViewport());
      runtime.store.snapScrollToTarget();
      return operation;
    });
  }, [focusSurfaceRequest, runLayoutAction, runtime, stageViewport]);

  useEffect(() => {
    if (runtime.mode !== "workspace") {
      return;
    }
    const handleOpenPaneRequest = (event: Event) => {
      const request = (event as CustomEvent<OpenPaneRequest>).detail;
      if (!request?.surfaceKind) {
        return;
      }
      runLayoutAction(() => openPaneRequestOperation(runtime, request, stageViewport));
    };
    window.addEventListener(workspaceOpenPaneRequestEvent, handleOpenPaneRequest);
    return () => {
      window.removeEventListener(workspaceOpenPaneRequestEvent, handleOpenPaneRequest);
    };
  }, [runLayoutAction, runtime, stageViewport]);

  return { openOverviewGhostPane };
}

function openPaneRequestOperation(
  runtime: WorkspaceRuntime,
  request: OpenPaneRequest,
  stageViewport: () => Rect,
): WorkspaceLayoutOperation {
  const maximizedPaneId = runtime.store.getSnapshot().maximizedPaneId;
  if (maximizedPaneId !== null) {
    runtime.store.togglePaneMaximized(maximizedPaneId);
  }
  const operation = openPaneRequestBackendOperation(runtime, request);
  runtime.store.ensureFocusedColumnVisible(stageViewport());
  runtime.store.snapScrollToTarget();
  return operation;
}

function openPaneRequestBackendOperation(
  runtime: WorkspaceRuntime,
  request: OpenPaneRequest,
): WorkspaceLayoutOperation {
  if (!request.surfaceKind) {
    return null;
  }
  if (runtime.store.canOpenPane(request)) {
    const operation = openPaneFromFocusedColumnOperation(runtime.store, request);
    runtime.store.openPane(request);
    return operation;
  }
  const paneId = runtime.store.focusPaneBySurfaceKind(request.surfaceKind);
  if (paneId !== null && request.workflowNodeDetailsConfig) {
    const operation = configurePaneOperation(paneId, request);
    runtime.store.configurePane(paneId, request);
    return operation;
  }
  return paneId === null ? null : focusPaneOperation(paneId);
}
