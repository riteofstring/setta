import type { SyntheticWorkflowGraphOptions } from "../features/workspace-graph/workflow-graph-camera-scope";
import type { WorkspaceUILayout } from "@generated/backend";
import {
  generateBenchmarkScene,
  phaseOneVisiblePaneCount,
  type BenchmarkSceneOptions,
} from "./benchmark-scene";
import type { WorkspaceLikeLayoutEngine } from "./layout-engine";
import { LocalStoragePerformanceReportWriter } from "./performance-report";
import { DEFAULT_PANE_BUDGET } from "./runtime-policy";
import {
  createRealWorkspaceScene,
  defaultRealWorkspacePaneLimits,
  type RealWorkspaceSceneResult,
} from "./workspace-scene";
import type { WorkspaceScene, PaneId, PaneRuntimeBudget } from "./types";

export type WorkspaceSceneMode = "benchmark" | "workspace";

const syncAllRenderedContentDuringMovementByMode = {
  benchmark: false,
  workspace: true,
} satisfies Record<WorkspaceSceneMode, boolean>;
const runtimePolicyOptionsByMode = {
  benchmark: {
    degradeDuringMovement: true,
    degradeDuringResize: true,
    degradeOverview: true,
    degradeOverviewDuringResize: true,
  },
  workspace: {
    degradeDuringMovement: false,
    degradeDuringResize: false,
    degradeOverview: false,
    degradeOverviewDuringResize: false,
  },
} satisfies Record<
  WorkspaceSceneMode,
  {
    degradeDuringMovement: boolean;
    degradeDuringResize: boolean;
    degradeOverview: boolean;
    degradeOverviewDuringResize: boolean;
  }
>;
const benchmarkWorkflowGraphSyntheticGraph = {
  edgesPerNode: 2,
  nodeCount: 500,
} satisfies NonNullable<SyntheticWorkflowGraphOptions>;
const benchmarkPaneRuntimeBudget = {
  ...DEFAULT_PANE_BUDGET,
  maxLiveWebGpuCanvases: 0,
} satisfies PaneRuntimeBudget;

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

export function hostPoolSizeForRuntime(mode: WorkspaceSceneMode, scene: WorkspaceScene): number {
  return mode === "benchmark"
    ? benchmarkHostPoolSizeFromSearch(currentLocationSearch())
    : scene.totalPanes;
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

export function runtimePolicyBudgetForRuntime(
  mode: WorkspaceSceneMode,
  scene: WorkspaceScene,
): PaneRuntimeBudget {
  if (mode === "benchmark") {
    return benchmarkPaneRuntimeBudget;
  }
  return workspaceRuntimeBudgetForScene(scene);
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

function workspaceRuntimeBudgetForScene(scene: WorkspaceScene): PaneRuntimeBudget {
  const visiblePaneBudget = Math.max(1, scene.totalPanes);
  return {
    maxLiveBrowserPanes: visiblePaneBudget,
    maxLiveHeavyDomPanes: visiblePaneBudget,
    maxLiveTerminalRenderers: visiblePaneBudget,
    maxLiveWebGpuCanvases: visiblePaneBudget,
    maxSnapshotPanes: visiblePaneBudget,
  };
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
