/* global performance */

import { cameraState, cameraStatesDiffer } from "./pixi-renderer-helpers";

const cameraPanSettleDelayMs = 64;
const cameraZoomSettleDelayMs = 48;

export function createWorkflowGraphCameraSync({
  animationCoordinator,
  debugMetrics,
  handlers,
  inputResponsiveness,
  interactionScheduler = { runLane: (_laneId, callback) => callback() },
  labelLayer,
  labels,
  sceneVisitCounters = null,
  syncFilterAreas,
  syncVisibleScene,
  viewport,
}) {
  let lastCameraState = cameraState(viewport);
  let cameraDependentSyncScheduled = false;
  let cameraDependentSyncRequiresMovingFrame = false;
  let cameraDependentSyncFrameCount = 0;
  let cameraMoving = false;
  let activeCameraInteractionCount = 0;
  let cameraMovingLabelHiddenFrameCount = 0;
  let cameraMovingSyncFrameCount = 0;
  let cameraSettleLabelSyncCount = 0;
  let cameraSettleRestoreFrameCount = 0;
  let cameraSettledSyncFrameCount = 0;
  let cameraUpdateCount = 0;
  let cameraMovingLabelDeferredFrameCount = 0;
  let lastCameraMovementAt = 0;
  let lastCameraMovementKind = "none";
  let cameraMovingLabelSyncedFrameCount = 0;
  let pendingCameraSyncIncludesZoom = false;
  let pendingSettledFidelityIncludesZoom = false;

  return {
    beginCameraInteraction,
    debugSnapshot,
    endCameraInteraction,
    hasCameraChanged,
    isCameraMoving,
    recordCameraState,
    runCameraDependentSyncFrame,
    scheduleCameraDependentSync,
  };

  function debugSnapshot() {
    return {
      activeCameraInteractionCount,
      cameraDependentSyncFrameCount,
      cameraDependentSyncRequiresMovingFrame,
      cameraDependentSyncScheduled,
      cameraMoving,
      cameraMovingLabelDeferredFrameCount,
      cameraMovingLabelHiddenFrameCount,
      cameraMovingLabelSyncedFrameCount,
      cameraMovingSyncFrameCount,
      cameraPanSettleDelayMs,
      cameraSettleDelayMs: currentCameraSettleDelayMs(),
      cameraSettleLabelSyncCount,
      cameraSettleRestoreFrameCount,
      cameraSettledSyncFrameCount,
      cameraUpdateCount,
      cameraZoomSettleDelayMs,
      lastCameraMovementKind,
      pendingCameraSyncIncludesZoom,
      pendingSettledFidelityIncludesZoom,
    };
  }

  function hasCameraChanged(nextCameraState = cameraState(viewport)) {
    return cameraStatesDiffer(nextCameraState, lastCameraState);
  }

  function isCameraMoving() {
    return cameraMoving;
  }

  function beginCameraInteraction({ interactionKind = "none", now } = {}) {
    activeCameraInteractionCount += 1;
    cameraMoving = true;
    lastCameraMovementAt = Number.isFinite(now) ? now : performance.now();
    lastCameraMovementKind = interactionKind;
  }

  function endCameraInteraction({ interactionKind = "none", now } = {}) {
    activeCameraInteractionCount = Math.max(0, activeCameraInteractionCount - 1);
    cameraMoving = true;
    lastCameraMovementAt = Number.isFinite(now) ? now : performance.now();
    lastCameraMovementKind = interactionKind;
  }

  function recordCameraState(
    nextCameraState = cameraState(viewport),
    { interactionKind = "none", moving, now } = {},
  ) {
    return interactionScheduler.runLane("camera-input", () =>
      debugMetrics.measure("record-camera-state", () => {
        if (!hasCameraChanged(nextCameraState)) {
          return false;
        }
        const recordedCameraState = { ...nextCameraState };
        pendingCameraSyncIncludesZoom =
          pendingCameraSyncIncludesZoom || recordedCameraState.zoom !== lastCameraState.zoom;
        cameraUpdateCount += 1;
        lastCameraState = recordedCameraState;
        handlers.onCameraStateChange(recordedCameraState);
        syncCameraMovementState({ interactionKind, moving, now });
        return true;
      }),
    );
  }

  function syncCameraMovementState({ interactionKind, moving, now }) {
    if (moving === true) {
      cameraMoving = true;
      lastCameraMovementAt = Number.isFinite(now) ? now : performance.now();
      lastCameraMovementKind = interactionKind;
      return;
    }
    if (moving === false) {
      cameraMoving = false;
      lastCameraMovementKind = interactionKind;
    }
  }

  function scheduleCameraDependentSync({ moving = cameraMoving } = {}) {
    cameraDependentSyncScheduled = true;
    cameraDependentSyncRequiresMovingFrame = cameraDependentSyncRequiresMovingFrame || moving;
  }

  function runCameraDependentSyncFrame(now = performance.now(), { force = false } = {}) {
    if (!cameraSyncNeeded(now, force)) {
      return false;
    }
    if (settleRestoreOnly(now, force)) {
      runCameraSettleFidelityRestore(now);
      return true;
    }
    runScheduledCameraSync(force);
    return true;
  }

  function cameraSyncNeeded(now, force) {
    return cameraDependentSyncScheduled || force || cameraSettleDue(now);
  }

  function settleRestoreOnly(now, force) {
    return !cameraDependentSyncScheduled && !force && cameraSettleDue(now);
  }

  function cameraSettleDue(now) {
    return (
      cameraMoving &&
      activeCameraInteractionCount === 0 &&
      Number.isFinite(lastCameraMovementAt) &&
      now - lastCameraMovementAt >= currentCameraSettleDelayMs()
    );
  }

  function currentCameraSettleDelayMs() {
    return lastCameraMovementKind === "wheel-zoom"
      ? cameraZoomSettleDelayMs
      : cameraPanSettleDelayMs;
  }

  function runScheduledCameraSync(force) {
    const cameraMotion = cameraDependentSyncRequiresMovingFrame && !force ? "moving" : "settled";
    if (cameraMotion === "moving") {
      sceneVisitCounters?.markCameraFrame();
    }
    const syncIncludesZoom = force || pendingCameraSyncIncludesZoom;
    cameraDependentSyncScheduled = false;
    cameraDependentSyncRequiresMovingFrame = false;
    debugMetrics.measure(
      "commit-camera-change",
      () => {
        interactionScheduler.runLane("visible-position-sync", () => {
          syncVisibleScene?.({
            cameraMotion,
            force,
            zoomChanged: syncIncludesZoom,
          });
        });
        if (cameraMotion === "moving") {
          syncMovingCameraFidelity(syncIncludesZoom);
        } else {
          syncSettledCameraFidelity(syncIncludesZoom);
        }
        pendingCameraSyncIncludesZoom = false;
      },
      { cameraMotion },
    );
    cameraDependentSyncFrameCount += 1;
    syncCameraMotionCounter(cameraMotion);
  }

  function syncCameraMotionCounter(cameraMotion) {
    if (cameraMotion === "moving") {
      cameraMovingSyncFrameCount += 1;
      return;
    }
    cameraSettledSyncFrameCount += 1;
    cameraMoving = false;
  }

  function runCameraSettleFidelityRestore(now) {
    cameraMoving = false;
    interactionScheduler.runLane(
      "settled-fidelity-restore",
      () => {
        debugMetrics.measure(
          "camera-settle-fidelity-restore",
          () => {
            syncVisibleScene?.({
              cameraMotion: "settled",
              force: false,
              zoomChanged: pendingSettledFidelityIncludesZoom,
            });
            syncLabelsForCameraMotion("settled");
            animationCoordinator.syncActiveSet({ cameraMotion: "settled" });
            syncFilterAreas({ force: pendingSettledFidelityIncludesZoom });
            pendingSettledFidelityIncludesZoom = false;
          },
          { now },
        );
      },
      { cameraMotion: "settled" },
    );
    inputResponsiveness?.recordSettleRestore(now);
    cameraSettleRestoreFrameCount += 1;
  }

  function syncMovingCameraFidelity(syncIncludesZoom) {
    syncLabelsForCameraMotion("moving");
    pendingSettledFidelityIncludesZoom = pendingSettledFidelityIncludesZoom || syncIncludesZoom;
  }

  function syncSettledCameraFidelity(syncIncludesZoom) {
    interactionScheduler.runLane(
      "settled-fidelity-restore",
      () => {
        syncLabelsForCameraMotion("settled");
        animationCoordinator.syncActiveSet({ cameraMotion: "settled" });
        syncFilterAreas({ force: syncIncludesZoom || pendingSettledFidelityIncludesZoom });
        pendingSettledFidelityIncludesZoom = false;
      },
      { cameraMotion: "settled" },
    );
  }

  function syncLabelsForCameraMotion(cameraMotion) {
    if (cameraMotion === "moving") {
      const visibleLabelCount = labels.visibleLabelSyncNodeCount();
      sceneVisitCounters?.record("labelsConsidered", visibleLabelCount);
      labelLayer.visible = false;
      cameraMovingLabelHiddenFrameCount += 1;
      cameraMovingLabelDeferredFrameCount += visibleLabelCount;
      return;
    }
    labelLayer.visible = true;
    labels.syncVisibleLabels();
    cameraSettleLabelSyncCount += 1;
  }
}
