/* global performance */

import { cameraState } from "./pixi-renderer-helpers";

export function createWorkflowGraphFrameRuntime({
  animationCoordinator,
  animationState,
  cameraSync,
  interactionScheduler,
  isDirectManipulationActive,
  replaceSceneGraph,
  sceneVisitCounters,
  trajectoryRuntime,
  viewport,
}) {
  const recentFrameMs = [];
  let deferredGraphUpdate = null;
  let deferredGraphApplyCount = 0;
  let deferredGraphUpdateCount = 0;
  let frameCount = 0;
  let lastFrameAt = performance.now();

  return {
    debugSnapshot,
    queueOrApplyGraphUpdate,
    recentFrameMs,
    runFrame,
    shouldContinue,
  };

  function runFrame(now) {
    const frameMs = now - lastFrameAt;
    lastFrameAt = now;
    frameCount += 1;
    recentFrameMs.push(frameMs);
    if (recentFrameMs.length > 90) {
      recentFrameMs.shift();
    }
    sceneVisitCounters.beginFrame({ frameCount });
    try {
      const nextCameraState = cameraState(viewport);
      if (cameraSync.hasCameraChanged(nextCameraState)) {
        if (
          cameraSync.recordCameraState(nextCameraState, {
            interactionKind: "viewport-plugin",
            moving: true,
            now,
          })
        ) {
          cameraSync.scheduleCameraDependentSync();
        }
      }
      cameraSync.runCameraDependentSyncFrame(now);
      applyDeferredGraphUpdateIfSettled();
      interactionScheduler.runLane(
        "semantic-runtime-visual",
        () => {
          animationCoordinator.tick(now, {
            cameraMotion: cameraSync.isCameraMoving() ? "moving" : "settled",
          });
        },
        { cameraMotion: cameraSync.isCameraMoving() ? "moving" : "settled" },
      );
      trajectoryRuntime.tick(now);
    } finally {
      sceneVisitCounters.endFrame({ frameMs });
    }
  }

  function shouldContinue() {
    return (
      cameraSync.isCameraMoving() ||
      animationState.debugSnapshot().animationActive ||
      trajectoryRuntime.debugSnapshot().trajectorySpriteDisplayCount > 0 ||
      deferredGraphUpdate !== null
    );
  }

  function queueOrApplyGraphUpdate(nextGraph) {
    if (graphUpdateShouldDefer()) {
      deferredGraphUpdate = nextGraph;
      deferredGraphUpdateCount += 1;
      return false;
    }
    replaceSceneGraph(nextGraph, { countUpdate: true });
    return true;
  }

  function applyDeferredGraphUpdateIfSettled() {
    if (deferredGraphUpdate === null || graphUpdateShouldDefer()) {
      return;
    }
    const nextGraph = deferredGraphUpdate;
    deferredGraphUpdate = null;
    deferredGraphApplyCount += 1;
    replaceSceneGraph(nextGraph, { countUpdate: true });
  }

  function debugSnapshot() {
    return {
      deferredGraphApplyCount,
      deferredGraphUpdateCount,
      frameCount,
    };
  }

  function graphUpdateShouldDefer() {
    return cameraSync.isCameraMoving() || isDirectManipulationActive();
  }
}
