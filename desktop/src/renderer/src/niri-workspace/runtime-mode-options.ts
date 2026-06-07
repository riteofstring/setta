import { generateBenchmarkScene, phaseOneVisiblePaneCount } from "./benchmark-scene";
import type { NiriLikeLayoutEngine } from "./layout-engine";
import { LocalStoragePerformanceReportWriter } from "./performance-report";
import {
  createRealWorkspaceScene,
  defaultRealWorkspacePaneLimits,
  type RealWorkspaceSceneResult,
} from "./workspace-scene";
import type { NiriWorkspaceScene, PaneId } from "./types";

export type NiriSceneMode = "benchmark" | "workspace";

const realWorkspaceHostPoolSize = 18;
const syncAllRenderedContentDuringMovementByMode = {
  benchmark: false,
  workspace: false,
} satisfies Record<NiriSceneMode, boolean>;
const runtimePolicyOptionsByMode = {
  benchmark: {
    degradeDuringMovement: true,
    degradeOverview: true,
  },
  workspace: {
    degradeDuringMovement: false,
    degradeOverview: true,
  },
} satisfies Record<
  NiriSceneMode,
  {
    degradeDuringMovement: boolean;
    degradeOverview: boolean;
  }
>;

export function browserPaneCountForScene(scene: NiriWorkspaceScene): number {
  return scene.panes.filter((pane) => pane.surfaceKind === "browser").length;
}

export function createRealSceneForRuntime({
  layoutStorageKey,
  mode,
  workspaceName,
}: {
  layoutStorageKey: string;
  mode: NiriSceneMode;
  workspaceName: string;
}): RealWorkspaceSceneResult | null {
  if (mode !== "workspace") {
    return null;
  }
  return createRealWorkspaceScene({
    storageKey: layoutStorageKey,
    workspaceName,
  });
}

export function hostPoolSizeForRuntime(mode: NiriSceneMode): number {
  return mode === "benchmark" ? phaseOneVisiblePaneCount : realWorkspaceHostPoolSize;
}

export function initialFocusedPaneIdForRuntime(
  mode: NiriSceneMode,
  engine: NiriLikeLayoutEngine,
  realScene: RealWorkspaceSceneResult | null,
): PaneId | undefined {
  if (mode === "workspace") {
    return engine.firstPaneId() ?? realScene?.focusedPaneId;
  }
  return realScene?.focusedPaneId;
}

export function paneLimitsForRuntime(mode: NiriSceneMode) {
  return mode === "workspace" ? defaultRealWorkspacePaneLimits : undefined;
}

export function presentationOptionsForRuntime(mode: NiriSceneMode) {
  return { syncAllRenderedContentDuringMovement: syncAllRenderedContentDuringMovementByMode[mode] };
}

export function reportWriterForRuntime(mode: NiriSceneMode) {
  return mode === "benchmark" ? new LocalStoragePerformanceReportWriter(5000) : null;
}

export function runtimePolicyOptionsForRuntime(mode: NiriSceneMode) {
  return { ...runtimePolicyOptionsByMode[mode] };
}

export function sceneForRuntime(realScene: RealWorkspaceSceneResult | null): NiriWorkspaceScene {
  return realScene?.scene ?? generateBenchmarkScene();
}

export function snapshotStaticFallbackForRuntime(mode: NiriSceneMode): boolean {
  return mode === "workspace";
}
