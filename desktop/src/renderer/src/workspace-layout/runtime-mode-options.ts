import type { SyntheticWorkflowGraphOptions } from "../features/workspace-graph/workflow-graph-camera-scope";
import type { WorkspaceUILayout } from "@generated/backend";
import {
  generateBenchmarkScene,
  phaseOneVisiblePaneCount,
  type BenchmarkSceneOptions,
} from "./benchmark-scene";
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
    degradeDuringMovement: true,
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
  return mode === "benchmark"
    ? benchmarkHostPoolSizeFromSearch(currentLocationSearch())
    : realWorkspaceHostPoolSize;
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

export function benchmarkSceneOptionsFromSearch(search: string): BenchmarkSceneOptions {
  const params = new URLSearchParams(search);
  const paneCount = optionalPositiveIntegerParam(params, "workspaceBenchmarkPaneCount");
  const targetVisiblePanes = optionalPositiveIntegerParam(params, "workspaceBenchmarkVisiblePanes");
  return {
    ...(paneCount === undefined ? {} : { paneCount }),
    ...(targetVisiblePanes === undefined ? {} : { targetVisiblePanes }),
  };
}

export function benchmarkHostPoolSizeFromSearch(search: string): number {
  return benchmarkSceneOptionsFromSearch(search).targetVisiblePanes ?? phaseOneVisiblePaneCount;
}

export function sceneForRuntime(
  realScene: RealWorkspaceSceneResult | null,
  mode: WorkspaceSceneMode,
): WorkspaceScene {
  if (realScene) {
    return realScene.scene;
  }
  return mode === "benchmark"
    ? generateBenchmarkScene(benchmarkSceneOptionsFromSearch(currentLocationSearch()))
    : generateBenchmarkScene();
}

export function snapshotStaticFallbackForRuntime(mode: WorkspaceSceneMode): boolean {
  return mode === "workspace";
}

export function workflowGraphSyntheticGraphFallbackForRuntime(
  mode: WorkspaceSceneMode,
): SyntheticWorkflowGraphOptions | undefined {
  return mode === "benchmark" ? benchmarkWorkflowGraphSyntheticGraph : undefined;
}

function optionalPositiveIntegerParam(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer: ${raw}`);
  }
  return value;
}

function currentLocationSearch(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location?.search ?? "";
}
