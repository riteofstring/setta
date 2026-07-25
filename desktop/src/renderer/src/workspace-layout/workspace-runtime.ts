import type { DesktopPlatform } from "@shared/types";
import type { AppShellMasterController } from "../features/global-master/app-shell-master-controller";
import type { AppShellSpeechCaptureController } from "../features/global-speech/app-shell-speech-capture-controller";
import type { AppShellSpeechPlaybackController } from "../features/global-speech/app-shell-speech-playback-controller";
import type { GlobalSpeechPresentationSource } from "../features/global-speech/global-speech-presentation";
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
  type WorkspaceSceneMode,
} from "./runtime-mode-options";
import { PaneRuntimePolicy } from "./runtime-policy";
import { createDefaultSurfaceAdapter, EmptyFrameSurfaceAdapter } from "./surface-adapters";
import { SurfaceRegistry } from "./surface-registry";
import type { WorkspacePane } from "./types";
import type { RealWorkspaceStoredLayout } from "./workspace-scene";

export function createWorkspaceRuntime({
  allowResizedPanesToOverflowViewport,
  masterController,
  masterSpeechCapture,
  masterSpeechPlayback,
  mode,
  onOpenVoiceCredentialSettings,
  overviewCardMaxWidthPx,
  overviewCardMinWidthPx,
  platform,
  speechCapture,
  speechPresentation,
  initialMaximizedPaneId,
  storedLayout,
  workspaceId,
  workspaceName,
}: {
  allowResizedPanesToOverflowViewport: boolean;
  initialMaximizedPaneId?: string | null;
  masterController?: AppShellMasterController;
  masterSpeechCapture?: AppShellSpeechCaptureController;
  masterSpeechPlayback?: AppShellSpeechPlaybackController;
  mode: WorkspaceSceneMode;
  onOpenVoiceCredentialSettings?: () => void;
  overviewCardMaxWidthPx?: number;
  overviewCardMinWidthPx?: number;
  platform: DesktopPlatform;
  speechCapture?: SpeechCaptureRequester;
  speechPresentation?: GlobalSpeechPresentationSource;
  storedLayout: RealWorkspaceStoredLayout | null;
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
      initialMaximizedPaneId,
      paneLimits: paneLimitsForRuntime(mode),
    },
  );
  const metrics = new WorkspaceMetricsCollector();
  const browserPaneCount = browserPaneCountForScene(scene);
  const nativeViewBoundsBatcher = new NativeViewBoundsBatcher({
    totalBrowserPanes: browserPaneCount,
    workspaceId: scene.id,
  });
  const createSurfaceAdapter = createSurfaceAdapterFactory(store, nativeViewBoundsBatcher, {
    masterController,
    masterSpeechCapture,
    masterSpeechPlayback,
    onOpenVoiceCredentialSettings,
    platform,
    speechCapture,
    speechPresentation,
    workspaceId,
  });
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
  options: {
    masterController: AppShellMasterController | undefined;
    masterSpeechCapture: AppShellSpeechCaptureController | undefined;
    masterSpeechPlayback: AppShellSpeechPlaybackController | undefined;
    onOpenVoiceCredentialSettings: (() => void) | undefined;
    platform: DesktopPlatform;
    speechCapture: SpeechCaptureRequester | undefined;
    speechPresentation: GlobalSpeechPresentationSource | undefined;
    workspaceId: string;
  },
) {
  return (pane: WorkspacePane) => {
    if (pane.surfaceKind === "browser") {
      return new BrowserSurfaceProxyAdapter(pane, nativeViewBoundsBatcher);
    }
    if (pane.surfaceKind === "empty-frame") {
      return new EmptyFrameSurfaceAdapter(pane, () => emptyFrameOptionsForStore(store));
    }
    return createDefaultSurfaceAdapter(pane, {
      masterController: options.masterController,
      masterSpeechCapture: options.masterSpeechCapture,
      masterSpeechPlayback: options.masterSpeechPlayback,
      onOpenVoiceCredentialSettings: options.onOpenVoiceCredentialSettings,
      platform: options.platform,
      speechCapture: options.speechCapture,
      speechPresentation: options.speechPresentation,
      workspaceId: options.workspaceId,
    });
  };
}
