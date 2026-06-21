/* global performance, window */

import {
  cameraState,
  isZoomWheel,
  normalizedWheelDelta,
  screenPointFromWheel,
  stopNativeInteraction,
  zoomFactorFromWheel,
} from "./pixi-renderer-helpers";

export function createWorkflowGraphWheelHandler({
  canvas,
  inputResponsiveness,
  interactionsBlockWheel,
  onWheelBurstSettled,
  panCameraByScreenDelta,
  recordWheelPan,
  recordWheelZoom,
  viewport,
  zoomCameraAtScreen,
}) {
  let wheelBurstTimer = 0;
  let wheelBurstEventCount = 0;
  let wheelBurstTreatment = "";
  return (event) => {
    const handlerStartedAt = performance.now();
    if (interactionsBlockWheel()) {
      return;
    }
    stopNativeInteraction(event);
    const screen = screenPointFromWheel(canvas, event);
    const delta = normalizedWheelDelta(event);
    const zoomWheel = isZoomWheel(event, delta);
    const wheelInput = inputResponsiveness.recordWheelEvent(event, {
      cameraBefore: cameraState(viewport),
      canvasPoint: screen,
      delta,
      treatment: zoomWheel ? "zoom" : "pan",
    });
    const cameraUpdateStartedAt = performance.now();
    const cameraChanged = zoomWheel
      ? zoomCameraAtScreen(screen, zoomFactorFromWheel(event, delta), {
          interactionKind: "wheel-zoom",
        })
      : panCameraByScreenDelta(delta.x, delta.y, {
          interactionKind: "wheel-pan",
        });
    const cameraUpdateDurationMs = performance.now() - cameraUpdateStartedAt;
    if (zoomWheel) {
      recordWheelZoom();
    } else {
      recordWheelPan();
    }
    inputResponsiveness.recordWheelCameraResult({
      cameraAfter: cameraState(viewport),
      cameraChanged,
      cameraUpdateDurationMs,
      handlerDurationMs: performance.now() - handlerStartedAt,
      sequence: wheelInput.sequence,
    });
    scheduleWheelBurstSettled(zoomWheel ? "zoom" : "pan");
  };

  function scheduleWheelBurstSettled(treatment) {
    wheelBurstEventCount += 1;
    wheelBurstTreatment = treatment;
    if (wheelBurstTimer !== 0) {
      window.clearTimeout(wheelBurstTimer);
    }
    wheelBurstTimer = window.setTimeout(() => {
      const eventCount = wheelBurstEventCount;
      const settledTreatment = wheelBurstTreatment;
      wheelBurstEventCount = 0;
      wheelBurstTreatment = "";
      wheelBurstTimer = 0;
      onWheelBurstSettled?.({
        eventCount,
        treatment: settledTreatment,
      });
    }, 140);
  }
}
