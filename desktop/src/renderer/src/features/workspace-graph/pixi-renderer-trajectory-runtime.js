import { createWorkspaceTrajectorySpriteLayer } from "./pixi-renderer-trajectory-sprites";

export function createWorkflowGraphTrajectoryRuntime({
  cameraSync,
  graphRecorder,
  handlers,
  interactionScheduler,
  nodesById,
  renderer,
}) {
  const { canvas, debugMetrics, loadedNodeLabelFont, trajectoryLayer, viewport } = renderer;
  const sprites = createWorkspaceTrajectorySpriteLayer({
    canvas,
    debugMetrics,
    getNode: (nodeId) => nodesById.get(nodeId) ?? null,
    layer: trajectoryLayer,
    loadedNodeLabelFont,
    onActivitySpriteClick: (target) => handlers.onActivitySpriteClick?.(target),
    recordActivitySpritePointerOut: graphRecorder.activitySpritePointerOut,
    recordActivitySpritePointerOver: graphRecorder.activitySpritePointerOver,
    recordActivitySpritePointerTap: graphRecorder.activitySpritePointerTap,
    viewport,
  });

  return {
    debugSnapshot: sprites.debugSnapshot,
    destroy: sprites.destroy,
    hitTestAtScreen: sprites.hitTestAtScreen,
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
