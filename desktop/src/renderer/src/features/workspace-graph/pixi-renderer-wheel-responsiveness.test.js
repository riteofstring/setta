import { describe, expect, test } from "vitest";

import { createWorkflowGraphWheelResponsivenessTracker } from "./pixi-renderer-wheel-responsiveness";

describe("workflow graph wheel responsiveness tracker", () => {
  test("records wheel event timing, camera latency, render latency, and tail candidates", () => {
    let time = 100;
    const tracker = createWorkflowGraphWheelResponsivenessTracker({
      now: () => time,
    });

    const first = tracker.recordWheelEvent(wheelEvent({ deltaY: -8, timeStamp: 97 }), {
      cameraBefore: camera(1),
      canvasPoint: { x: 20, y: 30 },
      delta: { x: 0, y: -8 },
      treatment: "zoom",
    });
    time = 101;
    tracker.recordWheelCameraResult({
      cameraAfter: camera(1.1),
      cameraChanged: true,
      sequence: first.sequence,
    });
    time = 116;
    tracker.recordRenderedFrame();

    time = 124;
    tracker.recordWheelEvent(wheelEvent({ deltaY: -2, timeStamp: 123 }), {
      cameraBefore: camera(1.1),
      canvasPoint: { x: 20, y: 30 },
      delta: { x: 0, y: -2 },
      treatment: "zoom",
    });
    time = 172;
    tracker.recordSettleRestore();

    const snapshot = tracker.debugSnapshot();
    expect(snapshot.wheelInputEventCount).toBe(2);
    expect(snapshot.wheelInputGestureCount).toBe(1);
    expect(snapshot.wheelInputLastEventToSettleRestoreMs).toBe(48);
    expect(snapshot.wheelInputTailCandidateEventCount).toBe(1);
    expect(snapshot.wheelInput.lastCompletedGesture).toMatchObject({
      eventCount: 2,
      firstWheelEventToFirstCameraUpdateMs: 1,
      firstWheelEventToFirstRenderedFrameAfterCameraMs: 16,
      lastWheelEventToSettleRestoreMs: 48,
      tailCandidateDurationMs: 0,
      tailCandidateEventCount: 1,
    });
    expect(snapshot.wheelInput.samples[0]).toMatchObject({
      cameraChanged: true,
      ctrlKey: true,
      deltaMode: 0,
      eventTimestampDeltaMs: 3,
      eventToCameraUpdateMs: 1,
      eventToFirstRenderedFrameAfterCameraMs: 16,
      metaKey: false,
      treatment: "zoom",
    });
  });
});

function wheelEvent({ deltaY, timeStamp }) {
  return {
    altKey: false,
    ctrlKey: true,
    deltaMode: 0,
    deltaX: 0,
    deltaY,
    metaKey: false,
    shiftKey: false,
    timeStamp,
  };
}

function camera(zoom) {
  return { x: 0, y: 0, zoom };
}
