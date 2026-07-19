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
    return realScene?.focusedPaneId ?? engine.firstPaneId() ?? undefined;
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
  return mode === "benchmark" ? benchmarkRuntimeBudget() : workspaceRuntimeBudgetForScene(scene);
}

// The workspace runtime budget must track the LIVE pane count, not the count from
// the scene the runtime was first created with — otherwise a workspace that opened
// with a single pane keeps a budget of 1 and freezes every unfocused pane.
export function runtimePolicyBudgetForPaneCount(
  mode: WorkspaceSceneMode,
  paneCount: number,
): PaneRuntimeBudget {
  if (mode === "benchmark") {
    return benchmarkRuntimeBudget();
  }
  const visiblePaneBudget = Math.max(1, paneCount);
  return {
    maxLiveHeavyDomPanes: visiblePaneBudget,
    maxSnapshotPanes: visiblePaneBudget,
  };
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

function workspaceRuntimeBudgetForScene(scene: WorkspaceScene): PaneRuntimeBudget {
  const visiblePaneBudget = Math.max(1, scene.totalPanes);
  return {
    maxLiveHeavyDomPanes: visiblePaneBudget,
    maxSnapshotPanes: visiblePaneBudget,
  };
}

function benchmarkRuntimeBudget(): PaneRuntimeBudget {
  return { ...DEFAULT_PANE_BUDGET };
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
