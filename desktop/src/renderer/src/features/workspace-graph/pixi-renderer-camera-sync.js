/* global performance */

import { cameraState, cameraStatesDiffer } from "./pixi-renderer-helpers";

const cameraPanSettleDelayMs = 64;
const cameraZoomSettleDelayMs = 48;
const movingLabelSyncNodeLimit = 120;

export function createWorkflowGraphCameraSync({
  animationCoordinator,
  debugMetrics,
  handlers,
  inputResponsiveness,
  labelLayer,
  labels,
  syncFilterAreas,
  syncVisibleScene,
  viewport,
}) {
  let lastCameraState = cameraState(viewport);
  let cameraDependentSyncScheduled = false;
  let cameraDependentSyncRequiresMovingFrame = false;
  let cameraDependentSyncFrameCount = 0;
  let cameraMoving = false;
  let cameraMovingLabelHiddenFrameCount = 0;
  let cameraMovingSyncFrameCount = 0;
  let cameraSettleLabelSyncCount = 0;
  let cameraSettleRestoreFrameCount = 0;
  let cameraSettledSyncFrameCount = 0;
  let cameraUpdateCount = 0;
  let lastCameraMovementAt = 0;
  let lastCameraMovementKind = "none";
  let cameraMovingLabelSyncedFrameCount = 0;
  let pendingCameraSyncIncludesZoom = false;

  return {
    debugSnapshot,
    hasCameraChanged,
    recordCameraState,
    runCameraDependentSyncFrame,
    scheduleCameraDependentSync,
  };

  function debugSnapshot() {
    return {
      cameraDependentSyncFrameCount,
      cameraDependentSyncRequiresMovingFrame,
      cameraDependentSyncScheduled,
      cameraMoving,
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
      movingLabelSyncNodeLimit,
      pendingCameraSyncIncludesZoom,
    };
  }

  function hasCameraChanged(nextCameraState = cameraState(viewport)) {
    return cameraStatesDiffer(nextCameraState, lastCameraState);
  }

  function recordCameraState(
    nextCameraState = cameraState(viewport),
    { interactionKind = "none", moving, now } = {},
  ) {
    return debugMetrics.measure("record-camera-state", () => {
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
    });
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
    const syncIncludesZoom = force || pendingCameraSyncIncludesZoom;
    cameraDependentSyncScheduled = false;
    cameraDependentSyncRequiresMovingFrame = false;
    debugMetrics.measure(
      "commit-camera-change",
      () => {
        syncVisibleScene?.({
          cameraMotion,
          force,
          zoomChanged: syncIncludesZoom,
        });
        syncLabelsForCameraMotion(cameraMotion);
        animationCoordinator.syncActiveSet({ cameraMotion });
        syncFilterAreas({ force: syncIncludesZoom });
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
    debugMetrics.measure(
      "camera-settle-fidelity-restore",
      () => {
        syncVisibleScene?.({
          cameraMotion: "settled",
          force: false,
          zoomChanged: false,
        });
        syncLabelsForCameraMotion("settled");
        animationCoordinator.syncActiveSet({ cameraMotion: "settled" });
      },
      { now },
    );
    inputResponsiveness?.recordSettleRestore(now);
    cameraSettleRestoreFrameCount += 1;
  }

  function syncLabelsForCameraMotion(cameraMotion) {
    if (cameraMotion === "moving") {
      if (labels.visibleLabelSyncNodeCount() <= movingLabelSyncNodeLimit) {
        labelLayer.visible = true;
        labels.syncVisibleLabels();
        cameraMovingLabelSyncedFrameCount += 1;
        return;
      }
      labelLayer.visible = false;
      cameraMovingLabelHiddenFrameCount += 1;
      return;
    }
    labelLayer.visible = true;
    labels.syncVisibleLabels();
    cameraSettleLabelSyncCount += 1;
  }
}
