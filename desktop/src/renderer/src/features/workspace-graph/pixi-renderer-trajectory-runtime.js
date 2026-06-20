import { createWorkspaceTrajectorySpriteLayer } from "./pixi-renderer-trajectory-sprites";

export function createWorkflowGraphTrajectoryRuntime({
  cameraSync,
  debugMetrics,
  getNode,
  interactionScheduler,
  loadedNodeLabelFont,
  trajectoryLayer,
  viewport,
}) {
  const sprites = createWorkspaceTrajectorySpriteLayer({
    debugMetrics,
    getNode,
    layer: trajectoryLayer,
    loadedNodeLabelFont,
    viewport,
  });

  return {
    debugSnapshot: sprites.debugSnapshot,
    destroy: sprites.destroy,
    syncPositions: sprites.syncPositions,
    tick: (now) => {
      const cameraMotion = cameraSync.isCameraMoving() ? "moving" : "settled";
      interactionScheduler.runLane(
        "trajectory-runtime-visual",
        () => {
          sprites.tick(now);
        },
        { cameraMotion },
      );
    },
    updateFrame: sprites.updateFrame,
  };
}
