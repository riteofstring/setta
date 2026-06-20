import type { SemanticGraph } from "@generated/backend";

import type { WorkflowGraphGraph } from "./pixi-renderer";
import {
  rendererGraphFromSemanticGraph,
  type SemanticActivityByNodeId,
} from "./semantic-graph-projection";
import {
  type SemanticRuntimeFrameSnapshot,
  type SemanticRuntimeStore,
  emptySemanticRuntimeFrameSnapshot,
} from "./semantic-runtime-store";
import type { SyntheticWorkflowGraphOptions } from "./workflow-graph-camera-scope";
import {
  workflowRendererGraphForSurface,
  type WorkflowGraphRendererGraph,
} from "./workflow-graph-surface-helpers";
import {
  type WorkspaceTrajectoryFrameSnapshot,
  type WorkspaceTrajectoryStore,
} from "./workspace-trajectory-store";

export interface WorkspaceGraphSceneInputs {
  semanticActivities: SemanticActivityByNodeId;
  semanticGraph: SemanticGraph | null;
  semanticRuntimeStore: SemanticRuntimeStore | null;
  syntheticGraph: SyntheticWorkflowGraphOptions;
  trajectoryStore: WorkspaceTrajectoryStore | null;
  workflowGraph: WorkflowGraphRendererGraph | undefined;
  workflowProjectionReady: boolean;
  workflowWorkspaceId: string;
}

interface WorkspaceGraphSceneFrame {
  graph: WorkflowGraphGraph | undefined;
  graphVersion: number;
  ready: boolean;
  semanticRuntime: SemanticRuntimeFrameSnapshot;
  trajectory: WorkspaceTrajectoryFrameSnapshot | null;
  trajectoryVersion: number;
  version: number;
  workflowWorkspaceId: string;
}

export interface WorkspaceGraphSceneStore {
  destroy: () => void;
  getFrameSnapshot: () => WorkspaceGraphSceneFrame;
  noteCameraMovement: () => void;
  subscribe: (listener: () => void) => () => void;
  updateInputs: (inputs: WorkspaceGraphSceneInputs) => void;
}

interface CreateWorkspaceGraphSceneStoreRequest {
  scheduleFrame?: (callback: () => void) => () => void;
}

const emptySceneInputs: WorkspaceGraphSceneInputs = {
  semanticActivities: new Map(),
  semanticGraph: null,
  semanticRuntimeStore: null,
  syntheticGraph: null,
  trajectoryStore: null,
  workflowGraph: undefined,
  workflowProjectionReady: false,
  workflowWorkspaceId: "",
};

const emptySceneFrame: WorkspaceGraphSceneFrame = {
  graph: undefined,
  graphVersion: 0,
  ready: false,
  semanticRuntime: emptySemanticRuntimeFrameSnapshot,
  trajectory: null,
  trajectoryVersion: 0,
  version: 0,
  workflowWorkspaceId: "",
};

export function createWorkspaceGraphSceneStore({
  scheduleFrame = defaultScheduleFrame,
}: CreateWorkspaceGraphSceneStoreRequest = {}): WorkspaceGraphSceneStore {
  let destroyed = false;
  let frame: WorkspaceGraphSceneFrame = emptySceneFrame;
  let graphDirty = true;
  let inputs = emptySceneInputs;
  let sceneGraph: WorkflowGraphGraph | undefined;
  let unsubscribeSemanticRuntime: (() => void) | null = null;
  let unsubscribeTrajectory: (() => void) | null = null;
  let cancelFrame: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const store: WorkspaceGraphSceneStore = {
    destroy,
    getFrameSnapshot: () => frame,
    noteCameraMovement,
    subscribe,
    updateInputs,
  };
  return store;

  function updateInputs(nextInputs: WorkspaceGraphSceneInputs) {
    if (destroyed) {
      return;
    }
    const runtimeStoreChanged = semanticRuntimeStoreChanged(inputs, nextInputs);
    syncSemanticRuntimeSubscription(nextInputs, runtimeStoreChanged);
    syncTrajectorySubscription(nextInputs);
    graphDirty = graphDirty || sceneGraphInputsChanged(inputs, nextInputs, runtimeStoreChanged);
    inputs = nextInputs;
    scheduleSceneFrame();
  }

  function syncSemanticRuntimeSubscription(
    nextInputs: WorkspaceGraphSceneInputs,
    runtimeStoreChanged: boolean,
  ) {
    if (!runtimeStoreChanged) {
      return;
    }
    unsubscribeSemanticRuntime?.();
    unsubscribeSemanticRuntime =
      nextInputs.semanticRuntimeStore?.subscribe(handleSemanticRuntimeFrame) ?? null;
  }

  function syncTrajectorySubscription(nextInputs: WorkspaceGraphSceneInputs) {
    if (inputs.trajectoryStore === nextInputs.trajectoryStore) {
      return;
    }
    unsubscribeTrajectory?.();
    unsubscribeTrajectory = nextInputs.trajectoryStore?.subscribe(handleTrajectoryFrame) ?? null;
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    unsubscribeSemanticRuntime?.();
    unsubscribeSemanticRuntime = null;
    unsubscribeTrajectory?.();
    unsubscribeTrajectory = null;
    cancelFrame?.();
    cancelFrame = null;
    listeners.clear();
  }

  function subscribe(listener: () => void) {
    if (destroyed) {
      return () => undefined;
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function noteCameraMovement() {
    inputs.semanticRuntimeStore?.noteCameraMovement();
  }

  function handleSemanticRuntimeFrame() {
    graphDirty = true;
    scheduleSceneFrame();
  }

  function handleTrajectoryFrame() {
    scheduleSceneFrame();
  }

  function scheduleSceneFrame() {
    if (destroyed || cancelFrame !== null) {
      return;
    }
    cancelFrame = scheduleFrame(publishSceneFrame);
  }

  function publishSceneFrame() {
    cancelFrame = null;
    if (destroyed) {
      return;
    }
    const semanticRuntime = currentSemanticRuntimeFrame(inputs);
    const trajectory = currentTrajectoryFrame(inputs);
    const graphVersion = refreshSceneGraph(semanticRuntime);
    frame = sceneFrame({
      graph: sceneGraph,
      graphVersion,
      previousVersion: frame.version,
      semanticRuntime,
      trajectory,
      workflowWorkspaceId: inputs.workflowWorkspaceId,
    });
    notifyListeners(listeners);
  }

  function refreshSceneGraph(semanticRuntime: SemanticRuntimeFrameSnapshot) {
    if (!graphDirty) {
      return frame.graphVersion;
    }
    sceneGraph = materializeSceneGraph(inputs, semanticRuntime);
    graphDirty = false;
    return frame.graphVersion + 1;
  }
}

export function materializeWorkspaceGraphSceneGraph(
  inputs: WorkspaceGraphSceneInputs,
  semanticRuntime: SemanticRuntimeFrameSnapshot = emptySemanticRuntimeFrameSnapshot,
): WorkflowGraphGraph | undefined {
  return materializeSceneGraph(inputs, semanticRuntime);
}

function materializeSceneGraph(
  inputs: WorkspaceGraphSceneInputs,
  semanticRuntime: SemanticRuntimeFrameSnapshot,
) {
  const semanticRendererGraph =
    inputs.syntheticGraph === null && inputs.semanticGraph !== null
      ? rendererGraphFromSemanticGraph({
          semanticActivities: inputs.semanticActivities,
          semanticGraph: inputs.semanticGraph,
          semanticWorkingSet: semanticRuntime.workingSet,
          workflowGraph: inputs.workflowGraph,
        })
      : undefined;
  return workflowRendererGraphForSurface({
    semanticGraph: semanticRendererGraph,
    syntheticGraph: inputs.syntheticGraph,
    workflowGraph: inputs.workflowGraph,
    workflowProjectionReady: inputs.workflowProjectionReady,
    workflowWorkspaceId: inputs.workflowWorkspaceId,
  });
}

function semanticRuntimeStoreChanged(
  current: WorkspaceGraphSceneInputs,
  next: WorkspaceGraphSceneInputs,
) {
  return current.semanticRuntimeStore !== next.semanticRuntimeStore;
}

function sceneGraphInputsChanged(
  current: WorkspaceGraphSceneInputs,
  next: WorkspaceGraphSceneInputs,
  runtimeStoreChanged: boolean,
) {
  return (
    runtimeStoreChanged ||
    [
      current.semanticActivities !== next.semanticActivities,
      current.semanticGraph !== next.semanticGraph,
      current.syntheticGraph !== next.syntheticGraph,
      current.workflowGraph !== next.workflowGraph,
      current.workflowProjectionReady !== next.workflowProjectionReady,
      current.workflowWorkspaceId !== next.workflowWorkspaceId,
    ].some(Boolean)
  );
}

function currentSemanticRuntimeFrame(inputs: WorkspaceGraphSceneInputs) {
  return inputs.semanticRuntimeStore?.getFrameSnapshot() ?? emptySemanticRuntimeFrameSnapshot;
}

function currentTrajectoryFrame(inputs: WorkspaceGraphSceneInputs) {
  return inputs.trajectoryStore?.getFrameSnapshot() ?? null;
}

function sceneFrame({
  graph,
  graphVersion,
  previousVersion,
  semanticRuntime,
  trajectory,
  workflowWorkspaceId,
}: {
  graph: WorkflowGraphGraph | undefined;
  graphVersion: number;
  previousVersion: number;
  semanticRuntime: SemanticRuntimeFrameSnapshot;
  trajectory: WorkspaceTrajectoryFrameSnapshot | null;
  workflowWorkspaceId: string;
}): WorkspaceGraphSceneFrame {
  return {
    graph,
    graphVersion,
    ready: graph !== undefined,
    semanticRuntime,
    trajectory,
    trajectoryVersion: trajectory?.version ?? 0,
    version: previousVersion + 1,
    workflowWorkspaceId,
  };
}

function notifyListeners(listeners: ReadonlySet<() => void>) {
  for (const listener of listeners) {
    listener();
  }
}

function defaultScheduleFrame(callback: () => void) {
  if (
    typeof globalThis.requestAnimationFrame === "function" &&
    typeof globalThis.cancelAnimationFrame === "function"
  ) {
    const frameId = globalThis.requestAnimationFrame(() => callback());
    return () => globalThis.cancelAnimationFrame(frameId);
  }
  const timeoutId = globalThis.setTimeout(callback, 16);
  return () => globalThis.clearTimeout(timeoutId);
}
