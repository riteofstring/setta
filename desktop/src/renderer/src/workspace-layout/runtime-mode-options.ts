import type { SyntheticWorkflowGraphOptions } from "../features/workspace-graph/workflow-graph-camera-scope";
import type { WorkspaceUILayout } from "@generated/backend";
import { generateBenchmarkScene, phaseOneVisiblePaneCount } from "./benchmark-scene";
import type { WorkspaceLikeLayoutEngine } from "./layout-engine";
import { LocalStoragePerformanceReportWriter } from "./performance-report";
import {
  createRealWorkspaceScene,
  defaultRealWorkspacePaneLimits,
  type RealWorkspaceSceneResult,
} from "./workspace-scene";
import type { WorkspaceScene, PaneId } from "./types";

export type WorkspaceSceneMode = "benchmark" | "workspace";

const realWorkspaceHostPoolSize = 18;
const syncAllRenderedContentDuringMovementByMode = {
  benchmark: false,
  workspace: false,
} satisfies Record<WorkspaceSceneMode, boolean>;
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
  WorkspaceSceneMode,
  {
    degradeDuringMovement: boolean;
    degradeOverview: boolean;
  }
>;
const benchmarkWorkflowGraphSyntheticGraph = {
  edgesPerNode: 2,
  nodeCount: 500,
} satisfies NonNullable<SyntheticWorkflowGraphOptions>;

export function browserPaneCountForScene(scene: WorkspaceScene): number {
  return scene.panes.filter((pane) => pane.surfaceKind === "browser").length;
}

export function createRealSceneForRuntime({
  storedLayout,
  mode,
  workspaceId,
  workspaceName,
}: {
  mode: WorkspaceSceneMode;
  storedLayout: WorkspaceUILayout | null;
  workspaceId: string;
  workspaceName: string;
}): RealWorkspaceSceneResult | null {
  if (mode !== "workspace") {
    return null;
  }
  return createRealWorkspaceScene({
    storedLayout,
    workspaceId,
    workspaceName,
  });
}

export function hostPoolSizeForRuntime(mode: WorkspaceSceneMode): number {
  return mode === "benchmark" ? phaseOneVisiblePaneCount : realWorkspaceHostPoolSize;
}

export function initialFocusedPaneIdForRuntime(
  mode: WorkspaceSceneMode,
  engine: WorkspaceLikeLayoutEngine,
  realScene: RealWorkspaceSceneResult | null,
): PaneId | undefined {
  if (mode === "workspace") {
    return engine.firstPaneId() ?? realScene?.focusedPaneId;
  }
  return realScene?.focusedPaneId;
}

export function paneLimitsForRuntime(mode: WorkspaceSceneMode) {
  return mode === "workspace" ? defaultRealWorkspacePaneLimits : undefined;
}

export function presentationOptionsForRuntime(mode: WorkspaceSceneMode) {
  return { syncAllRenderedContentDuringMovement: syncAllRenderedContentDuringMovementByMode[mode] };
}

export function reportWriterForRuntime(mode: WorkspaceSceneMode) {
  return mode === "benchmark" ? new LocalStoragePerformanceReportWriter(5000) : null;
}

export function runtimePolicyOptionsForRuntime(mode: WorkspaceSceneMode) {
  return { ...runtimePolicyOptionsByMode[mode] };
}

export function sceneForRuntime(realScene: RealWorkspaceSceneResult | null): WorkspaceScene {
  return realScene?.scene ?? generateBenchmarkScene();
}

export function snapshotStaticFallbackForRuntime(mode: WorkspaceSceneMode): boolean {
  return mode === "workspace";
}

export function workflowGraphSyntheticGraphFallbackForRuntime(
  mode: WorkspaceSceneMode,
): SyntheticWorkflowGraphOptions | undefined {
  return mode === "benchmark" ? benchmarkWorkflowGraphSyntheticGraph : undefined;
}
