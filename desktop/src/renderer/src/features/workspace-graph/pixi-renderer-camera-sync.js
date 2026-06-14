/* global performance */

import { cameraState, cameraStatesDiffer } from "./pixi-renderer-helpers";

const cameraSettleDelayMs = 96;

export function createWorkflowGraphCameraSync({
  animationCoordinator,
  debugMetrics,
  handlers,
  labelLayer,
  labels,
  syncFilterAreas,
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
      cameraMovingSyncFrameCount,
      cameraSettleDelayMs,
      cameraSettleLabelSyncCount,
      cameraSettleRestoreFrameCount,
      cameraSettledSyncFrameCount,
      cameraUpdateCount,
    };
  }

  function hasCameraChanged(nextCameraState = cameraState(viewport)) {
    return cameraStatesDiffer(nextCameraState, lastCameraState);
  }

  function recordCameraState(nextCameraState = cameraState(viewport), { moving, now } = {}) {
    return debugMetrics.measure("record-camera-state", () => {
      if (!hasCameraChanged(nextCameraState)) {
        return false;
      }
      const recordedCameraState = { ...nextCameraState };
      cameraUpdateCount += 1;
      lastCameraState = recordedCameraState;
      handlers.onCameraStateChange(recordedCameraState);
      syncCameraMovementState({ moving, now });
      return true;
    });
  }

  function syncCameraMovementState({ moving, now }) {
    if (moving === true) {
      cameraMoving = true;
      lastCameraMovementAt = Number.isFinite(now) ? now : performance.now();
      return;
    }
    if (moving === false) {
      cameraMoving = false;
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
      now - lastCameraMovementAt >= cameraSettleDelayMs
    );
  }

  function runScheduledCameraSync(force) {
    const cameraMotion = cameraDependentSyncRequiresMovingFrame && !force ? "moving" : "settled";
    cameraDependentSyncScheduled = false;
    cameraDependentSyncRequiresMovingFrame = false;
    debugMetrics.measure(
      "commit-camera-change",
      () => {
        syncLabelsForCameraMotion(cameraMotion);
        animationCoordinator.syncActiveSet({ cameraMotion });
        syncFilterAreas();
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
        syncLabelsForCameraMotion("settled");
        animationCoordinator.syncActiveSet({ cameraMotion: "settled" });
      },
      { now },
    );
    cameraSettleRestoreFrameCount += 1;
  }

  function syncLabelsForCameraMotion(cameraMotion) {
    if (cameraMotion === "moving") {
      labelLayer.visible = false;
      cameraMovingLabelHiddenFrameCount += 1;
      return;
    }
    labelLayer.visible = true;
    labels.syncAllLabels();
    cameraSettleLabelSyncCount += 1;
  }
}
