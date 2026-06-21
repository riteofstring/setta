/* global performance, window */

import {
  isZoomWheel,
  normalizedWheelDelta,
  screenPointFromWheel,
  stopNativeInteraction,
  zoomFactorFromWheel,
} from "./pixi-renderer-helpers";

const wheelBurstSettleDelayMs = 140;

export function createWorkflowGraphWheelHandler({
  canvas,
  inputResponsiveness,
  interactionsBlockWheel,
  now = () => performance.now(),
  onWheelBurstSettled,
  panCameraByScreenDelta,
  recordWheelPan,
  recordWheelZoom,
  zoomCameraAtScreen,
}) {
  let wheelBurstTimer = 0;
  let wheelBurstEventCount = 0;
  let wheelBurstTreatment = "";
  let wheelBurstSettleDeadlineAt = 0;
  return (event) => {
    const handlerStartedAt = now();
    if (interactionsBlockWheel()) {
      return;
    }
    stopNativeInteraction(event);
    const screen = screenPointFromWheel(canvas, event);
    const delta = normalizedWheelDelta(event);
    const zoomWheel = isZoomWheel(event, delta);
    const wheelInput = inputResponsiveness.recordWheelEvent(event, {
      canvasX: screen.x,
      canvasY: screen.y,
      deltaX: delta.x,
      deltaY: delta.y,
      eventNow: handlerStartedAt,
      treatment: zoomWheel ? "zoom" : "pan",
    });
    const cameraUpdateStartedAt = now();
    const cameraChanged = zoomWheel
      ? zoomCameraAtScreen(screen, zoomFactorFromWheel(event, delta), {
          interactionKind: "wheel-zoom",
        })
      : panCameraByScreenDelta(delta.x, delta.y, {
          interactionKind: "wheel-pan",
        });
    const cameraUpdatedAt = now();
    const cameraUpdateDurationMs = cameraUpdatedAt - cameraUpdateStartedAt;
    if (zoomWheel) {
      recordWheelZoom();
    } else {
      recordWheelPan();
    }
    inputResponsiveness.recordWheelCameraResult({
      cameraChanged,
      cameraUpdateDurationMs,
      handlerDurationMs: now() - handlerStartedAt,
      sequence: wheelInput.sequence,
      updateAt: cameraUpdatedAt,
    });
    scheduleWheelBurstSettled(zoomWheel ? "zoom" : "pan", handlerStartedAt);
  };

  function scheduleWheelBurstSettled(treatment, eventAt) {
    wheelBurstEventCount += 1;
    wheelBurstTreatment = treatment;
    wheelBurstSettleDeadlineAt = eventAt + wheelBurstSettleDelayMs;
    if (wheelBurstTimer !== 0) {
      return;
    }
    scheduleWheelBurstTimer();
  }

  function scheduleWheelBurstTimer() {
    const delayMs = Math.max(0, wheelBurstSettleDeadlineAt - now());
    wheelBurstTimer = window.setTimeout(flushWheelBurstIfSettled, delayMs);
  }

  function flushWheelBurstIfSettled() {
    wheelBurstTimer = 0;
    if (wheelBurstEventCount === 0) {
      return;
    }
    if (now() < wheelBurstSettleDeadlineAt) {
      scheduleWheelBurstTimer();
      return;
    }
    const eventCount = wheelBurstEventCount;
    const settledTreatment = wheelBurstTreatment;
    wheelBurstEventCount = 0;
    wheelBurstTreatment = "";
    onWheelBurstSettled?.({
      eventCount,
      treatment: settledTreatment,
    });
  }
}
