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
    const cameraChanged = zoomWheel
      ? zoomCameraAtScreen(screen, zoomFactorFromWheel(event, delta), {
          interactionKind: "wheel-zoom",
        })
      : panCameraByScreenDelta(delta.x, delta.y, {
          interactionKind: "wheel-pan",
        });
    if (zoomWheel) {
      recordWheelZoom();
    } else {
      recordWheelPan();
    }
    inputResponsiveness.recordWheelCameraResult({
      cameraAfter: cameraState(viewport),
      cameraChanged,
      sequence: wheelInput.sequence,
    });
  };
}
