/* global performance */

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
  panCameraByScreenDelta,
  recordWheelPan,
  recordWheelZoom,
  viewport,
  zoomCameraAtScreen,
}) {
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
  };
}
