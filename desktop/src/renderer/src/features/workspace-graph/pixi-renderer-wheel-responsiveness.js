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
  let pendingFirstPixiRenderAfterCamera = null;
  let nextGestureId = 1;
  let nextWheelEventSequence = 1;
  let sampleCount = 0;
  let sampleCursor = 0;
  const samples = new Array(maxWheelInputSamples);

  return {
    debugSnapshot,
    recordPixiRenderFrame,
    recordSettleRestore,
    recordWheelCameraResult,
    recordWheelEvent,
  };

  function recordWheelEvent(
    event,
    { canvasX, canvasY, deltaX, deltaY, eventNow = now(), treatment },
  ) {
    const previousWheelGapMs = wheelGapMs(eventNow);
    activeGesture = activeGestureForWheelEvent(eventNow, previousWheelGapMs);
    const sequence = nextWheelEventSequence;
    nextWheelEventSequence += 1;
    const deltaMagnitude = Math.hypot(deltaX, deltaY);
    syncTailCandidateState(activeGesture, eventNow, deltaMagnitude);
    const sample = wheelEventSample(event, {
      canvasX,
      canvasY,
      deltaX,
      deltaY,
      deltaMagnitude,
      eventNow,
      previousWheelGapMs,
      sequence,
      treatment,
    });
    recordWheelEventOnGesture(activeGesture, sample, eventNow, treatment);
    appendSample(sample);
    return { gestureId: activeGesture.id, sequence };
  }

  function recordWheelCameraResult({
    cameraChanged,
    cameraUpdateDurationMs = null,
    handlerDurationMs = null,
    sequence,
    updateAt = now(),
  }) {
    const sample = sampleBySequence(sequence);
    if (!sample) {
      return;
    }
    sample.cameraChanged = Boolean(cameraChanged);
    sample.cameraUpdateDurationMs = finiteOrNull(cameraUpdateDurationMs);
    sample.handlerDurationMs = finiteOrNull(handlerDurationMs);
    if (!cameraChanged) {
      return;
    }
    recordChangedWheelCameraResult(sample, sequence, updateAt);
  }

  function recordChangedWheelCameraResult(sample, sequence, updateAt) {
    sample.cameraUpdateAt = updateAt;
    sample.eventToCameraUpdateMs = updateAt - sample.performanceNow;
    sample.eventTimestampToCameraUpdateMs =
      sample.eventTimestampDeltaMs === null
        ? null
        : sample.eventTimestampDeltaMs + sample.eventToCameraUpdateMs;
    const gesture = gestureForSample(sample);
    if (gesture && gesture.firstCameraUpdateAt === null) {
      gesture.firstCameraUpdateAt = updateAt;
      gesture.firstWheelEventToFirstCameraUpdateMs = updateAt - gesture.firstWheelEventAt;
    }
    if (pendingFirstPixiRenderAfterCamera === null) {
      pendingFirstPixiRenderAfterCamera = {
        cameraUpdateAt: updateAt,
        gestureId: sample.gestureId,
        sequence,
        wheelEventAt: sample.performanceNow,
      };
    }
  }

  function recordPixiRenderFrame(renderedAt = now()) {
    if (pendingFirstPixiRenderAfterCamera === null) {
      return;
    }
    const pending = pendingFirstPixiRenderAfterCamera;
    pendingFirstPixiRenderAfterCamera = null;
    const sample = sampleBySequence(pending.sequence);
    if (sample) {
      sample.firstPixiRenderAfterCameraAt = renderedAt;
      sample.cameraUpdateToFirstPixiRenderMs = renderedAt - pending.cameraUpdateAt;
      sample.eventToFirstPixiRenderAfterCameraMs = renderedAt - pending.wheelEventAt;
      sample.eventTimestampToFirstPixiRenderAfterCameraMs =
        sample.eventTimestampDeltaMs === null
          ? null
          : sample.eventTimestampDeltaMs + sample.eventToFirstPixiRenderAfterCameraMs;
    }
    const gesture = activeGesture?.id === pending.gestureId ? activeGesture : lastCompletedGesture;
    if (gesture && gesture.firstPixiRenderAfterCameraAt === null) {
      gesture.firstPixiRenderAfterCameraAt = renderedAt;
      gesture.firstWheelEventToFirstPixiRenderAfterCameraMs =
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
        pendingFirstPixiRenderAfterCamera: pendingFirstPixiRenderAfterCamera !== null,
        samples: orderedSamples().map((sample) => ({ ...sample })),
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
      firstPixiRenderAfterCameraAt: null,
      firstWheelEventAt: startedAt,
      firstWheelEventToFirstCameraUpdateMs: null,
      firstWheelEventToFirstPixiRenderAfterCameraMs: null,
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
      canvasX,
      canvasY,
      deltaX,
      deltaY,
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
      canvasX,
      canvasY,
      ctrlKey: Boolean(event.ctrlKey),
      deltaMode: Number.isFinite(event.deltaMode) ? event.deltaMode : null,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      eventTimestampDeltaMs: eventTimeStamp === null ? null : eventNow - eventTimeStamp,
      eventTimeStamp,
      gestureId: activeGesture.id,
      isTailCandidate: isTailCandidate(activeGesture, eventNow, deltaMagnitude),
      metaKey: Boolean(event.metaKey),
      normalizedDeltaX: deltaX,
      normalizedDeltaY: deltaY,
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
    const slot = sampleSlot(sample.sequence);
    samples[slot] = sample;
    sampleCursor = (slot + 1) % maxWheelInputSamples;
    sampleCount = Math.min(maxWheelInputSamples, sampleCount + 1);
  }

  function sampleBySequence(sequence) {
    const sample = samples[sampleSlot(sequence)] ?? null;
    return sample?.sequence === sequence ? sample : null;
  }

  function orderedSamples() {
    const ordered = [];
    const start = sampleCount === maxWheelInputSamples ? sampleCursor : 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = samples[(start + index) % maxWheelInputSamples];
      if (sample) {
        ordered.push(sample);
      }
    }
    return ordered;
  }

  function sampleSlot(sequence) {
    return (sequence - 1) % maxWheelInputSamples;
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
    firstWheelEventToFirstPixiRenderAfterCameraMs:
      gesture.firstWheelEventToFirstPixiRenderAfterCameraMs,
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
