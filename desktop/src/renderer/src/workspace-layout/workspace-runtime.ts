import type { WorkspaceUILayout } from "@generated/backend";
import type { SpeechCaptureRequester } from "../features/global-speech/speech-capture-destination";

import { BrowserSurfaceProxyAdapter } from "./browser-surface-proxy-adapter";
import { WorkspaceLikeLayoutEngine } from "./layout-engine";
import { WorkspaceLayoutStore } from "./layout-store";
import { WorkspaceMetricsCollector } from "./metrics";
import { NativeViewBoundsBatcher } from "./native-view-bounds-batcher";
import { emptyFrameOptionsForStore } from "./workspace-toolbar";
import { LocalStorageResizePerformanceReportWriter } from "./performance-report";
import { PresentationEngine } from "./presentation-engine";
import {
  browserPaneCountForScene,
  createRealSceneForRuntime,
  initialFocusedPaneIdForRuntime,
  paneLimitsForRuntime,
  presentationOptionsForRuntime,
  reportWriterForRuntime,
  runtimePolicyBudgetForRuntime,
  runtimePolicyOptionsForRuntime,
  sceneForRuntime,
  snapshotStaticFallbackForRuntime,
  workflowGraphSyntheticGraphFallbackForRuntime,
  type WorkspaceSceneMode,
} from "./runtime-mode-options";
import { PaneRuntimePolicy } from "./runtime-policy";
import { createDefaultSurfaceAdapter, EmptyFrameSurfaceAdapter } from "./surface-adapters";
import { SurfaceRegistry } from "./surface-registry";
import { TerminalSurfaceAdapter } from "./terminal-surface-adapter";
import type { WorkspacePane } from "./types";

export function createWorkspaceRuntime({
  allowResizedPanesToOverflowViewport,
  mode,
  overviewCardMaxWidthPx,
  overviewCardMinWidthPx,
  speechCapture,
  storedLayout,
  workspaceId,
  workspaceName,
}: {
  allowResizedPanesToOverflowViewport: boolean;
  mode: WorkspaceSceneMode;
  overviewCardMaxWidthPx?: number;
  overviewCardMinWidthPx?: number;
  speechCapture?: SpeechCaptureRequester;
  storedLayout: WorkspaceUILayout | null;
  workspaceId: string;
  workspaceName: string;
}) {
  const realScene = createRealSceneForRuntime({ mode, storedLayout, workspaceId, workspaceName });
  const scene = sceneForRuntime(realScene, mode);
  const engine = new WorkspaceLikeLayoutEngine(scene, {
    allowResizedPanesToOverflowViewport,
    overviewCardMaxWidthPx,
    overviewCardMinWidthPx,
  });
  const store = new WorkspaceLayoutStore(
    engine,
    scene,
    initialFocusedPaneIdForRuntime(mode, engine, realScene),
    {
      paneLimits: paneLimitsForRuntime(mode),
    },
  );
  const metrics = new WorkspaceMetricsCollector();
  const browserPaneCount = browserPaneCountForScene(scene);
  const nativeViewBoundsBatcher = new NativeViewBoundsBatcher({
    totalBrowserPanes: browserPaneCount,
    workspaceId: scene.id,
  });
  const createSurfaceAdapter = createSurfaceAdapterFactory(
    store,
    nativeViewBoundsBatcher,
    mode,
    speechCapture,
    workspaceId,
  );
  const surfaceRegistry = new SurfaceRegistry(scene.panes, createSurfaceAdapter, {
    metrics,
    snapshotAdapter: {
      staticFallback: snapshotStaticFallbackForRuntime(mode),
    },
  });
  return {
    browserPaneCount,
    engine,
    layoutRecovery: realScene?.layoutRecovery ?? null,
    metrics,
    mode,
    presentation: new PresentationEngine(
      scene.panes,
      metrics,
      surfaceRegistry,
      nativeViewBoundsBatcher,
      presentationOptionsForRuntime(mode),
    ),
    reportWriter: reportWriterForRuntime(mode),
    resizeReportWriter: new LocalStorageResizePerformanceReportWriter(1500),
    runtimePolicy: new PaneRuntimePolicy(
      runtimePolicyBudgetForRuntime(mode, scene),
      runtimePolicyOptionsForRuntime(mode),
    ),
    scene,
    surfaceRegistry,
    store,
  };
}

export type WorkspaceRuntime = ReturnType<typeof createWorkspaceRuntime>;

function createSurfaceAdapterFactory(
  store: WorkspaceLayoutStore,
  nativeViewBoundsBatcher: NativeViewBoundsBatcher,
  mode: WorkspaceSceneMode,
  speechCapture: SpeechCaptureRequester | undefined,
  workspaceId: string,
) {
  const workflowGraphSyntheticGraphFallback = workflowGraphSyntheticGraphFallbackForRuntime(mode);
  return (pane: WorkspacePane) => {
    if (pane.surfaceKind === "browser") {
      return new BrowserSurfaceProxyAdapter(pane, nativeViewBoundsBatcher);
    }
    if (pane.surfaceKind === "empty-frame") {
      return new EmptyFrameSurfaceAdapter(pane, () => emptyFrameOptionsForStore(store));
    }
    if (pane.surfaceKind === "terminal") {
      return new TerminalSurfaceAdapter(pane, workspaceId);
    }
    return createDefaultSurfaceAdapter(pane, {
      speechCapture,
      workflowGraphSyntheticGraphFallback,
      workspaceId,
    });
  };
}
