/* global performance */

import { cameraState } from "./pixi-renderer-helpers";

export function createWorkflowGraphFrameRuntime({
  activeInteractionKind,
  animationCoordinator,
  animationState,
  cameraSync,
  interactionScheduler,
  isDirectManipulationActive,
  recordGraphReplacement,
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
  let nextGraphVersion = 1;
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
    const graphVersion = nextGraphVersion;
    nextGraphVersion += 1;
    const deferral = graphUpdateDeferral();
    if (deferral !== null) {
      if (deferredGraphUpdate !== null) {
        recordGraphReplacement?.({
          activeInteraction: deferral.activeInteraction,
          graphVersion: deferredGraphUpdate.graphVersion,
          phase: "dropped",
          reason: "superseded_deferred_update",
        });
      }
      deferredGraphUpdate = { graph: nextGraph, graphVersion };
      deferredGraphUpdateCount += 1;
      recordGraphReplacement?.({
        activeInteraction: deferral.activeInteraction,
        graphVersion,
        phase: "queued",
        reason: deferral.reason,
      });
      return false;
    }
    replaceSceneGraph(nextGraph, { countUpdate: true });
    recordGraphReplacement?.({
      activeInteraction: "",
      graphVersion,
      phase: "applied",
      reason: "immediate",
    });
    return true;
  }

  function applyDeferredGraphUpdateIfSettled() {
    if (deferredGraphUpdate === null || graphUpdateDeferral() !== null) {
      return;
    }
    const nextGraph = deferredGraphUpdate;
    deferredGraphUpdate = null;
    deferredGraphApplyCount += 1;
    replaceSceneGraph(nextGraph.graph, { countUpdate: true });
    recordGraphReplacement?.({
      activeInteraction: "",
      graphVersion: nextGraph.graphVersion,
      phase: "applied",
      reason: "deferred_settled",
    });
  }

  function debugSnapshot() {
    return {
      deferredGraphApplyCount,
      deferredGraphUpdateCount,
      frameCount,
    };
  }

  function graphUpdateDeferral() {
    if (cameraSync.isCameraMoving()) {
      return {
        activeInteraction: "camera",
        reason: "camera_moving",
      };
    }
    if (isDirectManipulationActive()) {
      return {
        activeInteraction: activeInteractionKind?.() ?? "direct_manipulation",
        reason: "direct_manipulation_active",
      };
    }
    return null;
  }
}
