/* global performance */

import {
  cameraState,
  classifyWheelNavigationIntent,
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
  recordWheelInput = null,
  recordWheelZoom,
  viewport,
  zoomCameraAtScreen,
}) {
  return (event) => {
    const handlerStartedAt = performance.now();
    if (interactionsBlockWheel()) {
      recordWheelInput?.({
        now: performance.now(),
        reason: "wheel-input-blocked",
        sample: {
          event: wheelEventDiagnostics(event, handlerStartedAt),
          handlerDurationMs: performance.now() - handlerStartedAt,
          kind: "wheel",
        },
      });
      return;
    }
    stopNativeInteraction(event);
    const screen = screenPointFromWheel(canvas, event);
    const delta = normalizedWheelDelta(event);
    const wheelIntent = classifyWheelNavigationIntent(event, delta);
    const zoomWheel = wheelIntent.treatment === "zoom";
    const zoomFactor = zoomWheel ? zoomFactorFromWheel(event, delta) : null;
    const wheelInput = inputResponsiveness.recordWheelEvent(event, {
      cameraBefore: cameraState(viewport),
      canvasPoint: screen,
      delta,
      treatment: wheelIntent.treatment,
      wheelIntent,
      zoomFactor,
    });
    const cameraOperationStartedAt = performance.now();
    const cameraChanged = zoomWheel
      ? zoomCameraAtScreen(screen, zoomFactor, {
          interactionKind: "wheel-zoom",
        })
      : panCameraByScreenDelta(delta.x, delta.y, {
          interactionKind: "wheel-pan",
        });
    const cameraOperationEndedAt = performance.now();
    if (zoomWheel) {
      recordWheelZoom();
    } else {
      recordWheelPan();
    }
    const inputSample = inputResponsiveness.recordWheelCameraResult({
      cameraAfter: cameraState(viewport),
      cameraChanged,
      sequence: wheelInput.sequence,
    });
    recordWheelInput?.({
      now: performance.now(),
      reason: "wheel-input",
      sample: {
        cameraOperationDurationMs: cameraOperationEndedAt - cameraOperationStartedAt,
        event: wheelEventDiagnostics(event, handlerStartedAt),
        handlerDurationMs: performance.now() - handlerStartedAt,
        inputSample,
        kind: "wheel",
        screen: pointDiagnostics(screen),
      },
    });
  };
}

function pointDiagnostics(point) {
  return {
    x: point.x,
    y: point.y,
  };
}

function wheelEventDiagnostics(event, now) {
  return {
    altKey: Boolean(event.altKey),
    button: event.button,
    buttons: event.buttons,
    cancelable: Boolean(event.cancelable),
    clientX: event.clientX,
    clientY: event.clientY,
    ctrlKey: Boolean(event.ctrlKey),
    deltaMode: Number.isFinite(event.deltaMode) ? event.deltaMode : null,
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    eventTimestampDeltaMs:
      typeof event.timeStamp === "number" && Number.isFinite(event.timeStamp)
        ? now - event.timeStamp
        : null,
    metaKey: Boolean(event.metaKey),
    shiftKey: Boolean(event.shiftKey),
    timeStamp: typeof event.timeStamp === "number" ? event.timeStamp : null,
  };
}
