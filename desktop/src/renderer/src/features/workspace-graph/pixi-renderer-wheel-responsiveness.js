/* global performance */

const maxWheelInputSamples = 160;
const maxCompletedWheelGestures = 12;
const wheelGestureIdleGapMs = 120;
const tailCandidateMagnitudeRatio = 0.35;

export function createWorkflowGraphWheelResponsivenessTracker({
  now = () => performance.now(),
} = {}) {
  let activeGesture = null;
  const completedGestures = [];
  let lastCompletedGesture = null;
  let pendingFirstRenderAfterCamera = null;
  let nextGestureId = 1;
  let nextWheelEventSequence = 1;
  const samples = [];

  return {
    debugSnapshot,
    recordRenderedFrame,
    recordSettleRestore,
    recordWheelCameraResult,
    recordWheelEvent,
  };

  function recordWheelEvent(event, { cameraBefore, canvasPoint, delta, treatment }) {
    const eventNow = now();
    const previousWheelGapMs = wheelGapMs(eventNow);
    activeGesture = activeGestureForWheelEvent(eventNow, previousWheelGapMs);
    const sequence = nextWheelEventSequence;
    nextWheelEventSequence += 1;
    const deltaMagnitude = Math.hypot(delta.x, delta.y);
    syncTailCandidateState(activeGesture, eventNow, deltaMagnitude);
    const sample = wheelEventSample(event, {
      cameraBefore,
      canvasPoint,
      delta,
      deltaMagnitude,
      eventNow,
      previousWheelGapMs,
      sequence,
      treatment,
    });
    recordWheelEventOnGesture(activeGesture, sample, eventNow, treatment);
    appendSample(sample);
    markWorkflowGraphTiming("wheel-handler-entry", {
      eventTimeStamp: sample.eventTimeStamp,
      gestureId: sample.gestureId,
      sequence,
      treatment,
    });
    return { gestureId: activeGesture.id, sequence };
  }

  function recordWheelCameraResult({
    cameraAfter,
    cameraChanged,
    cameraUpdateDurationMs = null,
    handlerDurationMs = null,
    sequence,
  }) {
    const sample = sampleBySequence(sequence);
    if (!sample) {
      return;
    }
    const updateAt = now();
    sample.cameraAfter = cameraAfter;
    sample.cameraChanged = Boolean(cameraChanged);
    sample.cameraUpdateDurationMs = finiteOrNull(cameraUpdateDurationMs);
    sample.handlerDurationMs = finiteOrNull(handlerDurationMs);
    markWorkflowGraphTiming("wheel-handler-exit", {
      cameraChanged: sample.cameraChanged,
      cameraUpdateDurationMs: sample.cameraUpdateDurationMs,
      gestureId: sample.gestureId,
      handlerDurationMs: sample.handlerDurationMs,
      sequence,
      treatment: sample.treatment,
    });
    if (!cameraChanged) {
      return;
    }
    sample.cameraUpdateAt = updateAt;
    sample.eventToCameraUpdateMs = updateAt - sample.performanceNow;
    sample.eventTimestampToCameraUpdateMs =
      sample.eventTimestampDeltaMs === null
        ? null
        : sample.eventTimestampDeltaMs + sample.eventToCameraUpdateMs;
    markWorkflowGraphTiming("camera-transform-commit", {
      eventToCameraUpdateMs: sample.eventToCameraUpdateMs,
      eventTimestampToCameraUpdateMs: sample.eventTimestampToCameraUpdateMs,
      gestureId: sample.gestureId,
      sequence,
      treatment: sample.treatment,
    });
    const gesture = gestureForSample(sample);
    if (gesture && gesture.firstCameraUpdateAt === null) {
      gesture.firstCameraUpdateAt = updateAt;
      gesture.firstWheelEventToFirstCameraUpdateMs = updateAt - gesture.firstWheelEventAt;
    }
    if (pendingFirstRenderAfterCamera === null) {
      pendingFirstRenderAfterCamera = {
        cameraUpdateAt: updateAt,
        gestureId: sample.gestureId,
        sequence,
        wheelEventAt: sample.performanceNow,
      };
    }
  }

  function recordRenderedFrame(renderedAt = now()) {
    if (pendingFirstRenderAfterCamera === null) {
      return;
    }
    const pending = pendingFirstRenderAfterCamera;
    pendingFirstRenderAfterCamera = null;
    const sample = sampleBySequence(pending.sequence);
    if (sample) {
      sample.firstRenderedFrameAfterCameraAt = renderedAt;
      sample.cameraUpdateToFirstRenderedFrameMs = renderedAt - pending.cameraUpdateAt;
      sample.eventToFirstRenderedFrameAfterCameraMs = renderedAt - pending.wheelEventAt;
      sample.eventTimestampToFirstRenderedFrameAfterCameraMs =
        sample.eventTimestampDeltaMs === null
          ? null
          : sample.eventTimestampDeltaMs + sample.eventToFirstRenderedFrameAfterCameraMs;
      markWorkflowGraphTiming("first-pixi-render-after-input", {
        cameraUpdateToFirstRenderedFrameMs: sample.cameraUpdateToFirstRenderedFrameMs,
        eventToFirstRenderedFrameAfterCameraMs: sample.eventToFirstRenderedFrameAfterCameraMs,
        eventTimestampToFirstRenderedFrameAfterCameraMs:
          sample.eventTimestampToFirstRenderedFrameAfterCameraMs,
        gestureId: sample.gestureId,
        sequence: pending.sequence,
      });
    }
    const gesture = activeGesture?.id === pending.gestureId ? activeGesture : lastCompletedGesture;
    if (gesture && gesture.firstRenderedFrameAfterCameraAt === null) {
      gesture.firstRenderedFrameAfterCameraAt = renderedAt;
      gesture.firstWheelEventToFirstRenderedFrameAfterCameraMs =
        renderedAt - gesture.firstWheelEventAt;
    }
  }

  function recordSettleRestore(restoredAt = now()) {
    if (activeGesture === null || activeGesture.lastWheelEventAt === null) {
      return;
    }
    activeGesture.settleRestoreAt = restoredAt;
    activeGesture.lastWheelEventToSettleRestoreMs = restoredAt - activeGesture.lastWheelEventAt;
    activeGesture.tailCandidateDurationMs =
      activeGesture.tailCandidateStartAt === null
        ? 0
        : activeGesture.lastWheelEventAt - activeGesture.tailCandidateStartAt;
    lastCompletedGesture = summarizeGesture(activeGesture);
    completedGestures.push(lastCompletedGesture);
    if (completedGestures.length > maxCompletedWheelGestures) {
      completedGestures.shift();
    }
    activeGesture = null;
  }

  function debugSnapshot() {
    const active = activeGesture ? summarizeGesture(activeGesture) : null;
    return {
      wheelInput: {
        activeGesture: active,
        completedGestures: completedGestures.map((gesture) => ({ ...gesture })),
        eventCount: nextWheelEventSequence - 1,
        gestureCount: nextGestureId - 1,
        gestureIdleGapMs: wheelGestureIdleGapMs,
        lastCompletedGesture,
        pendingFirstRenderAfterCamera: pendingFirstRenderAfterCamera !== null,
        samples: samples.map((sample) => ({ ...sample })),
        tailCandidateMagnitudeRatio,
      },
      wheelInputEventCount: nextWheelEventSequence - 1,
      wheelInputGestureCount: nextGestureId - 1,
      wheelInputLastEventToSettleRestoreMs:
        lastCompletedGesture?.lastWheelEventToSettleRestoreMs ?? null,
      wheelInputTailCandidateDurationMs: lastCompletedGesture?.tailCandidateDurationMs ?? 0,
      wheelInputTailCandidateEventCount: lastCompletedGesture?.tailCandidateEventCount ?? 0,
    };
  }

  function createGesture(startedAt) {
    const gesture = {
      eventCount: 0,
      firstCameraUpdateAt: null,
      firstRenderedFrameAfterCameraAt: null,
      firstWheelEventAt: startedAt,
      firstWheelEventToFirstCameraUpdateMs: null,
      firstWheelEventToFirstRenderedFrameAfterCameraMs: null,
      id: nextGestureId,
      lastTreatment: "",
      lastWheelEventAt: null,
      lastWheelEventToSettleRestoreMs: null,
      peakDeltaAt: startedAt,
      peakDeltaMagnitude: 0,
      settleRestoreAt: null,
      tailCandidateDurationMs: 0,
      tailCandidateEventCount: 0,
      tailCandidateStartAt: null,
    };
    nextGestureId += 1;
    return gesture;
  }

  function wheelGapMs(eventNow) {
    if (activeGesture?.lastWheelEventAt === null || activeGesture?.lastWheelEventAt === undefined) {
      return null;
    }
    return eventNow - activeGesture.lastWheelEventAt;
  }

  function activeGestureForWheelEvent(eventNow, previousWheelGapMs) {
    if (shouldStartWheelGesture(previousWheelGapMs)) {
      return createGesture(eventNow);
    }
    return activeGesture;
  }

  function shouldStartWheelGesture(previousWheelGapMs) {
    return (
      activeGesture === null ||
      activeGesture.settleRestoreAt !== null ||
      (previousWheelGapMs !== null && previousWheelGapMs > wheelGestureIdleGapMs)
    );
  }

  function syncTailCandidateState(gesture, eventNow, deltaMagnitude) {
    if (deltaMagnitude > gesture.peakDeltaMagnitude) {
      gesture.peakDeltaAt = eventNow;
      gesture.peakDeltaMagnitude = deltaMagnitude;
      gesture.tailCandidateEventCount = 0;
      gesture.tailCandidateStartAt = null;
    }
  }

  function isTailCandidate(gesture, eventNow, deltaMagnitude) {
    return (
      gesture.eventCount > 0 &&
      eventNow > gesture.peakDeltaAt &&
      gesture.peakDeltaMagnitude > 0 &&
      deltaMagnitude <= gesture.peakDeltaMagnitude * tailCandidateMagnitudeRatio
    );
  }

  function wheelEventSample(
    event,
    {
      cameraBefore,
      canvasPoint,
      delta,
      deltaMagnitude,
      eventNow,
      previousWheelGapMs,
      sequence,
      treatment,
    },
  ) {
    const eventTimeStamp = wheelEventTimeStamp(event);
    return {
      altKey: Boolean(event.altKey),
      cameraBefore,
      canvasPoint,
      ctrlKey: Boolean(event.ctrlKey),
      deltaMode: Number.isFinite(event.deltaMode) ? event.deltaMode : null,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      eventTimestampDeltaMs: eventTimeStamp === null ? null : eventNow - eventTimeStamp,
      eventTimeStamp,
      gestureId: activeGesture.id,
      isTailCandidate: isTailCandidate(activeGesture, eventNow, deltaMagnitude),
      metaKey: Boolean(event.metaKey),
      normalizedDeltaX: delta.x,
      normalizedDeltaY: delta.y,
      performanceNow: eventNow,
      previousWheelGapMs,
      sequence,
      shiftKey: Boolean(event.shiftKey),
      treatment,
    };
  }

  function wheelEventTimeStamp(event) {
    return typeof event.timeStamp === "number" && Number.isFinite(event.timeStamp)
      ? event.timeStamp
      : null;
  }

  function recordWheelEventOnGesture(gesture, sample, eventNow, treatment) {
    gesture.eventCount += 1;
    gesture.lastWheelEventAt = eventNow;
    gesture.lastTreatment = treatment;
    if (!sample.isTailCandidate) {
      return;
    }
    gesture.tailCandidateEventCount += 1;
    if (gesture.tailCandidateStartAt === null) {
      gesture.tailCandidateStartAt = eventNow;
    }
  }

  function appendSample(sample) {
    samples.push(sample);
    if (samples.length > maxWheelInputSamples) {
      samples.shift();
    }
  }

  function sampleBySequence(sequence) {
    return samples.find((sample) => sample.sequence === sequence) ?? null;
  }

  function gestureForSample(sample) {
    if (activeGesture?.id === sample.gestureId) {
      return activeGesture;
    }
    if (lastCompletedGesture?.id === sample.gestureId) {
      return lastCompletedGesture;
    }
    return null;
  }
}

function summarizeGesture(gesture) {
  return {
    eventCount: gesture.eventCount,
    firstWheelEventToFirstCameraUpdateMs: gesture.firstWheelEventToFirstCameraUpdateMs,
    firstWheelEventToFirstRenderedFrameAfterCameraMs:
      gesture.firstWheelEventToFirstRenderedFrameAfterCameraMs,
    id: gesture.id,
    lastTreatment: gesture.lastTreatment,
    lastWheelEventToSettleRestoreMs: gesture.lastWheelEventToSettleRestoreMs,
    peakDeltaMagnitude: gesture.peakDeltaMagnitude,
    tailCandidateDurationMs: gesture.tailCandidateDurationMs,
    tailCandidateEventCount: gesture.tailCandidateEventCount,
  };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function markWorkflowGraphTiming(name, detail) {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") {
    return;
  }
  performance.mark(`setta.workflow-graph.${name}`, { detail });
}
