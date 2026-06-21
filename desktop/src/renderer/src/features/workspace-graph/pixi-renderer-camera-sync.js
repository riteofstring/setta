/* global performance */

import { cameraState, cameraStatesDiffer } from "./pixi-renderer-helpers";

const cameraPanSettleDelayMs = 64;
const cameraZoomSettleDelayMs = 48;
const maxCameraWorkAuditSamples = 64;
const maxRecordedCameraFastPathViolations = 16;

export function createWorkflowGraphCameraSync({
  animationCoordinator,
  debugMetrics,
  edgeLayer = { visible: true },
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
  let cameraMovingLabelTransformFrameCount = 0;
  let cameraMovingLabelTransformCount = 0;
  let cameraFastPathViolationCount = 0;
  let pendingCameraSyncIncludesZoom = false;
  let pendingSettledFidelityIncludesZoom = false;
  const cameraWorkAuditSamples = [];
  const recordedCameraFastPathViolations = [];

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
      cameraFastPathViolationCount,
      cameraFastPathViolations: [...recordedCameraFastPathViolations],
      cameraMoving,
      cameraMovingLabelDeferredFrameCount,
      cameraMovingLabelHiddenFrameCount,
      cameraMovingLabelSyncedFrameCount,
      cameraMovingLabelTransformCount,
      cameraMovingLabelTransformFrameCount,
      cameraMovingSyncFrameCount,
      cameraPanSettleDelayMs,
      cameraSettleDelayMs: currentCameraSettleDelayMs(),
      cameraSettleLabelSyncCount,
      cameraSettleRestoreFrameCount,
      cameraSettledSyncFrameCount,
      cameraUpdateCount,
      cameraWorkAuditSamples: cameraWorkAuditSamples.map((entry) => ({ ...entry })),
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
        const cameraMotion = cameraMotionForChange(moving);
        syncCameraMovementState({ interactionKind, moving, now });
        handlers.onCameraStateChange(recordedCameraState, {
          cameraMotion,
          interactionKind,
        });
        return true;
      }),
    );
  }

  function cameraMotionForChange(moving) {
    if (moving === true) {
      return "moving";
    }
    if (moving === false) {
      return "settled";
    }
    return cameraMoving ? "moving" : "settled";
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
    let sceneRebuilt = false;
    let transformTierLabelCount = 0;
    debugMetrics.measure(
      "commit-camera-change",
      () => {
        interactionScheduler.runLane("visible-position-sync", () => {
          sceneRebuilt =
            syncVisibleScene?.({
              cameraMotion,
              force,
              zoomChanged: syncIncludesZoom,
            }) === true;
        });
        if (cameraMotion === "moving") {
          transformTierLabelCount = syncMovingCameraFidelity(syncIncludesZoom);
        } else {
          syncSettledCameraFidelity(syncIncludesZoom);
        }
        pendingCameraSyncIncludesZoom = false;
      },
      { cameraMotion },
    );
    cameraDependentSyncFrameCount += 1;
    syncCameraMotionCounter(cameraMotion);
    recordCameraSyncAudit({
      cameraMotion,
      sceneRebuilt,
      syncIncludesZoom,
      transformTierLabelCount,
    });
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
    const zoomChanged = pendingSettledFidelityIncludesZoom;
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
            syncSettledLabels();
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
    handlers.onCameraStateChange(lastCameraState, {
      cameraMotion: "settled",
      interactionKind: lastCameraMovementKind,
    });
    cameraSettleRestoreFrameCount += 1;
    recordCameraWorkAudit({
      cameraMotion: "settle-restore",
      edgesHidden: edgeLayer.visible !== true,
      labelsHidden: labelLayer.visible !== true,
      labelTransformCount: 0,
      sceneRebuilt: false,
      zoomChanged,
    });
  }

  function syncMovingCameraFidelity(syncIncludesZoom) {
    const transformedLabelCount = runCameraTransformTier();
    pendingSettledFidelityIncludesZoom = pendingSettledFidelityIncludesZoom || syncIncludesZoom;
    return transformedLabelCount;
  }

  // Zoom/pan transform tier: the only graph-content work permitted while the
  // camera is moving. Retained labels (and base edges) ride the camera as a
  // bounded, measured numeric transform; nothing is hidden, no visibility,
  // declutter, content, edge-path, or scene work runs. Measured separately from
  // dirty geometry via the label manager's `label-transform-tier` bucket.
  function runCameraTransformTier() {
    ensureCameraCarriedLayersVisible();
    const transformedLabelCount = labels.syncVisibleLabelTransforms();
    cameraMovingLabelTransformFrameCount += 1;
    cameraMovingLabelTransformCount += transformedLabelCount;
    return transformedLabelCount;
  }

  // Camera fast-path invariant: camera motion must never hide node labels or base
  // edges. Nothing in the moving path hides them today; this guard keeps the
  // contract even if a future change does, and records the offense so tests and
  // the performance gate catch it instead of users seeing a flash.
  function ensureCameraCarriedLayersVisible() {
    if (labelLayer.visible !== true) {
      recordFastPathViolation("labels-hidden-during-camera-motion");
      labelLayer.visible = true;
    }
    if (edgeLayer.visible !== true) {
      recordFastPathViolation("base-edges-hidden-during-camera-motion");
      edgeLayer.visible = true;
    }
  }

  function syncSettledCameraFidelity(syncIncludesZoom) {
    interactionScheduler.runLane(
      "settled-fidelity-restore",
      () => {
        syncSettledLabels();
        animationCoordinator.syncActiveSet({ cameraMotion: "settled" });
        syncFilterAreas({ force: syncIncludesZoom || pendingSettledFidelityIncludesZoom });
        pendingSettledFidelityIncludesZoom = false;
      },
      { cameraMotion: "settled" },
    );
  }

  function syncSettledLabels() {
    labelLayer.visible = true;
    labels.syncVisibleLabels();
    cameraSettleLabelSyncCount += 1;
  }

  function recordCameraSyncAudit({
    cameraMotion,
    sceneRebuilt,
    syncIncludesZoom,
    transformTierLabelCount,
  }) {
    recordCameraWorkAudit({
      cameraMotion,
      edgesHidden: edgeLayer.visible !== true,
      labelsHidden: labelLayer.visible !== true,
      labelTransformCount: transformTierLabelCount,
      sceneRebuilt,
      zoomChanged: syncIncludesZoom,
    });
    if (cameraMotion === "moving" && sceneRebuilt) {
      recordFastPathViolation("scene-rebuilt-during-camera-motion");
    }
  }

  function recordCameraWorkAudit(entry) {
    cameraWorkAuditSamples.push(entry);
    if (cameraWorkAuditSamples.length > maxCameraWorkAuditSamples) {
      cameraWorkAuditSamples.shift();
    }
  }

  function recordFastPathViolation(reason) {
    cameraFastPathViolationCount += 1;
    recordedCameraFastPathViolations.push(reason);
    if (recordedCameraFastPathViolations.length > maxRecordedCameraFastPathViolations) {
      recordedCameraFastPathViolations.shift();
    }
  }
}
