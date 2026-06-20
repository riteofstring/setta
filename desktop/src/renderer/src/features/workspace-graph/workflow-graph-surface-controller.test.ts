import { describe, expect, test, vi } from "vitest";

import type {
  WorkflowGraphCameraState,
  WorkflowGraphGraph,
  WorkflowGraphRenderer,
  WorkflowGraphRendererHandlers,
  createWorkflowGraphRenderer,
} from "./pixi-renderer";
import {
  destroyWorkflowGraphSurfaceController,
  workflowGraphSurfaceControllerForSurface,
  WorkflowGraphSurfaceController,
} from "./workflow-graph-surface-controller";
import type { WorkspaceTrajectoryFrameSnapshot } from "./workspace-trajectory-store";

type RendererStub = WorkflowGraphRenderer & {
  graphs: WorkflowGraphGraph[];
  setCamera: (camera: WorkflowGraphCameraState) => void;
  trajectories: WorkspaceTrajectoryFrameSnapshot[];
  transferHosts: HTMLElement[];
};

type RendererCreateOptions = Parameters<typeof createWorkflowGraphRenderer>[0];

describe("workflow graph surface controller", () => {
  test("returns one live controller per surface id", () => {
    const first = workflowGraphSurfaceControllerForSurface("surface-controller-single", {
      loadRenderer: async () => ({ createWorkflowGraphRenderer: rendererFactory().factory }),
    });
    const second = workflowGraphSurfaceControllerForSurface("surface-controller-single");

    expect(second).toBe(first);
    expect(() => new WorkflowGraphSurfaceController("surface-controller-single")).toThrow(
      /already exists/,
    );

    destroyWorkflowGraphSurfaceController("surface-controller-single");
  });

  test("creates one renderer and transfers host without recreating the Pixi app", async () => {
    const renderer = rendererStub();
    const factory = rendererFactory(renderer);
    const controller = workflowGraphSurfaceControllerForSurface("surface-controller-transfer", {
      loadRenderer: async () => ({ createWorkflowGraphRenderer: factory.factory }),
    });
    const firstHost = host("first");
    const secondHost = host("second");

    controller.configure(config());
    controller.mount(firstHost);
    controller.activate();
    controller.updateScene(graph("initial"));
    await flushPromises();

    controller.transferHost(secondHost);
    controller.updateScene(graph("next"));

    expect(factory.calls).toHaveLength(1);
    expect(factory.calls[0]?.host).toBe(firstHost);
    expect(renderer.transferHosts).toEqual([secondHost]);
    expect(renderer.graphs.map((nextGraph) => nextGraph.workflow?.definitionId)).toEqual(["next"]);
    expect(controller.snapshot()).toMatchObject({
      creationCount: 1,
      rendererReady: true,
      state: "active",
      transferCount: 1,
    });

    controller.destroy();
  });

  test("applies the latest queued scene and trajectory after async renderer creation", async () => {
    const renderer = rendererStub();
    const deferred = deferredFactory(renderer);
    const controller = workflowGraphSurfaceControllerForSurface("surface-controller-queued", {
      loadRenderer: deferred.loadRenderer,
    });
    const trajectory = trajectoryFrame(3);

    controller.configure(config());
    controller.mount(host("queued"));
    controller.updateScene(graph("first"));
    controller.updateScene(graph("latest"));
    controller.updateTrajectory(trajectory);
    deferred.resolve();
    await flushPromises();

    expect(renderer.graphs.map((nextGraph) => nextGraph.workflow?.definitionId)).toEqual([
      "latest",
    ]);
    expect(renderer.trajectories).toEqual([trajectory]);
    expect(controller.snapshot()).toMatchObject({
      creationCount: 1,
      state: "mounted",
    });

    controller.destroy();
  });

  test("destroy is idempotent and does not let stale creation mutate the controller", async () => {
    const renderer = rendererStub();
    const deferred = deferredFactory(renderer);
    const controller = workflowGraphSurfaceControllerForSurface("surface-controller-stale", {
      loadRenderer: deferred.loadRenderer,
    });

    controller.configure(config());
    controller.mount(host("stale"));
    controller.activate();
    controller.updateScene(graph("initial"));
    controller.destroy();
    controller.destroy();
    deferred.resolve();
    await flushPromises();

    expect(renderer.destroy).toHaveBeenCalledTimes(1);
    expect(controller.snapshot()).toMatchObject({
      destroyCount: 0,
      rendererReady: false,
      staleCallbackCount: 1,
      state: "destroyed",
    });

    destroyWorkflowGraphSurfaceController("surface-controller-stale");
  });

  test("keeps moving camera state local and captures it only after settle", async () => {
    const captureCameraState = vi.fn();
    const noteCameraMovement = vi.fn();
    const renderer = rendererStub();
    const factory = rendererFactory(renderer);
    const controller = workflowGraphSurfaceControllerForSurface("surface-controller-camera", {
      loadRenderer: async () => ({ createWorkflowGraphRenderer: factory.factory }),
    });

    controller.configure(
      config({
        captureCameraState,
        noteCameraMovement,
      }),
    );
    controller.mount(host("camera"));
    controller.updateScene(graph("initial"));
    await flushPromises();

    const camera = { x: 40, y: -20, zoom: 1.4 };
    renderer.setCamera(camera);
    factory.calls[0]?.options.onCameraStateChange?.(camera, {
      cameraMotion: "moving",
      interactionKind: "wheel-pan",
    });

    expect(noteCameraMovement).toHaveBeenCalledTimes(1);
    expect(captureCameraState).not.toHaveBeenCalled();

    factory.calls[0]?.options.onCameraStateChange?.(camera, {
      cameraMotion: "settled",
      interactionKind: "wheel-pan",
    });

    expect(captureCameraState).toHaveBeenCalledTimes(1);
    expect(captureCameraState).toHaveBeenLastCalledWith(camera);

    controller.destroy();
  });

  test("forwards node position save settlement to the live renderer", async () => {
    const renderer = rendererStub();
    const factory = rendererFactory(renderer);
    const controller = workflowGraphSurfaceControllerForSurface("surface-controller-settlement", {
      loadRenderer: async () => ({ createWorkflowGraphRenderer: factory.factory }),
    });

    controller.configure(config());
    controller.mount(host("settlement"));
    controller.updateScene(graph("initial"));
    await flushPromises();

    controller.settleNodePositionSave({ nodeIds: ["work"], status: "failed" });

    expect(renderer.settleNodePositionSave).toHaveBeenCalledWith({
      nodeIds: ["work"],
      status: "failed",
    });

    controller.destroy();
  });
});

function config(
  overrides: Partial<Parameters<WorkflowGraphSurfaceController["configure"]>[0]> = {},
): Parameters<WorkflowGraphSurfaceController["configure"]>[0] {
  return {
    animationEnabled: true,
    captureCameraState: () => undefined,
    debugEnabled: false,
    handlers: handlers(),
    initialCameraState: null,
    reduceMotion: false,
    ...overrides,
  };
}

function handlers(): WorkflowGraphRendererHandlers {
  return {
    reactRenderCount: () => 0,
  };
}

function graph(definitionId: string): WorkflowGraphGraph {
  return {
    edges: [],
    nodes: [],
    workflow: {
      definitionId,
      definitionName: definitionId,
      definitionVersionId: "",
      definitionVersionNumber: 0,
      draftRevision: "",
      editable: true,
      executionId: "",
      executionStatus: "",
      versionMismatch: false,
      viewMode: "draft",
      workspaceId: "workspace",
    },
  };
}

function trajectoryFrame(version: number): WorkspaceTrajectoryFrameSnapshot {
  return {
    anchoredSpriteCount: 0,
    error: "",
    groups: [],
    loading: false,
    ready: true,
    recentLane: [],
    revision: version,
    totalSpriteCount: 0,
    version,
    workflowExecutionId: "",
    workspaceId: "workspace",
  };
}

function host(id: string): HTMLElement {
  return {
    dataset: {},
    id,
  } as unknown as HTMLElement;
}

function rendererFactory(renderer = rendererStub()) {
  const calls: Array<{
    graph: WorkflowGraphGraph;
    host: HTMLElement;
    options: RendererCreateOptions;
  }> = [];
  const factory: typeof createWorkflowGraphRenderer = vi.fn(async (options) => {
    if (options.graph === undefined) {
      throw new Error("test renderer factory requires an initial graph");
    }
    calls.push({ graph: options.graph, host: options.host, options });
    return renderer;
  });
  return {
    calls,
    factory,
  };
}

function deferredFactory(renderer: RendererStub) {
  let resolveLoad: (() => void) | null = null;
  const loadStarted = new Promise<void>((resolve) => {
    resolveLoad = resolve;
  });
  const factory = rendererFactory(renderer);
  return {
    loadRenderer: async () => {
      await loadStarted;
      return { createWorkflowGraphRenderer: factory.factory };
    },
    resolve: () => resolveLoad?.(),
  };
}

function rendererStub(): RendererStub {
  let camera: WorkflowGraphCameraState = { x: 0, y: 0, zoom: 1 };
  return {
    graphs: [],
    trajectories: [],
    transferHosts: [],
    activate: vi.fn(),
    cameraState: () => camera,
    destroy: vi.fn(),
    isCameraMoving: () => false,
    resize: vi.fn(),
    setCamera(nextCamera) {
      camera = nextCamera;
    },
    setHandlers: vi.fn(),
    settleNodePositionSave: vi.fn(),
    suspend: vi.fn(),
    transferHost(host) {
      this.transferHosts.push(host);
    },
    updateGraph(graph) {
      this.graphs.push(graph);
    },
    updateTrajectoryRuntime(frame) {
      this.trajectories.push(frame);
    },
  };
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
