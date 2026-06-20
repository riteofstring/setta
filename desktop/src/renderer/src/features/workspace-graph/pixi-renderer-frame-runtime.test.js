import { describe, expect, test, vi } from "vitest";

import { createWorkflowGraphFrameRuntime } from "./pixi-renderer-frame-runtime";

describe("workflow graph frame runtime", () => {
  test("defers graph replacement while the camera is moving and applies latest after settle", () => {
    let cameraMoving = true;
    const replaceSceneGraph = vi.fn();
    const runtime = createWorkflowGraphFrameRuntime({
      animationCoordinator: { tick: vi.fn() },
      animationState: { debugSnapshot: () => ({ animationActive: false }) },
      cameraSync: {
        hasCameraChanged: () => false,
        isCameraMoving: () => cameraMoving,
        recordCameraState: vi.fn(),
        runCameraDependentSyncFrame: vi.fn(),
        scheduleCameraDependentSync: vi.fn(),
      },
      interactionScheduler: { runLane: (_laneId, callback) => callback() },
      replaceSceneGraph,
      sceneVisitCounters: { beginFrame: vi.fn(), endFrame: vi.fn() },
      trajectoryRuntime: {
        debugSnapshot: () => ({ trajectorySpriteDisplayCount: 0 }),
        tick: vi.fn(),
      },
      viewport: { corner: { x: 0, y: 0 }, scaled: 1 },
    });
    const firstGraph = { edges: [], nodes: [], workflow: { definitionId: "first" } };
    const latestGraph = { edges: [], nodes: [], workflow: { definitionId: "latest" } };

    expect(runtime.queueOrApplyGraphUpdate(firstGraph)).toBe(false);
    expect(runtime.queueOrApplyGraphUpdate(latestGraph)).toBe(false);
    expect(replaceSceneGraph).not.toHaveBeenCalled();

    cameraMoving = false;
    runtime.runFrame(32);

    expect(replaceSceneGraph).toHaveBeenCalledTimes(1);
    expect(replaceSceneGraph).toHaveBeenCalledWith(latestGraph, { countUpdate: true });
  });
});
