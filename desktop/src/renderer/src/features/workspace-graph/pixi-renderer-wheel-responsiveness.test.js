import { describe, expect, test } from "vitest";

import { createWorkflowGraphWheelResponsivenessTracker } from "./pixi-renderer-wheel-responsiveness";

describe("workflow graph wheel responsiveness tracker", () => {
  test("records wheel event timing, camera latency, Pixi render proxy latency, and tail candidates", () => {
    let time = 100;
    const tracker = createWorkflowGraphWheelResponsivenessTracker({
      now: () => time,
    });

    const first = tracker.recordWheelEvent(wheelEvent({ deltaY: -8, timeStamp: 97 }), {
      canvasX: 20,
      canvasY: 30,
      deltaX: 0,
      deltaY: -8,
      treatment: "zoom",
    });
    time = 101;
    tracker.recordWheelCameraResult({
      cameraChanged: true,
      sequence: first.sequence,
    });
    time = 116;
    tracker.recordPixiRenderFrame();

    time = 124;
    tracker.recordWheelEvent(wheelEvent({ deltaY: -2, timeStamp: 123 }), {
      canvasX: 20,
      canvasY: 30,
      deltaX: 0,
      deltaY: -2,
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
      firstWheelEventToFirstPixiRenderAfterCameraMs: 16,
      lastWheelEventToSettleRestoreMs: 48,
      tailCandidateDurationMs: 0,
      tailCandidateEventCount: 1,
    });
    expect(snapshot.wheelInput.samples[0]).toMatchObject({
      canvasX: 20,
      canvasY: 30,
      cameraChanged: true,
      ctrlKey: true,
      deltaMode: 0,
      eventTimestampDeltaMs: 3,
      eventToCameraUpdateMs: 1,
      eventToFirstPixiRenderAfterCameraMs: 16,
      metaKey: false,
      normalizedDeltaX: 0,
      normalizedDeltaY: -8,
      treatment: "zoom",
    });
    expect(snapshot.wheelInput.samples[0]).not.toHaveProperty("cameraBefore");
    expect(snapshot.wheelInput.samples[0]).not.toHaveProperty("cameraAfter");
    expect(snapshot.wheelInput.samples[0]).not.toHaveProperty("canvasPoint");
  });

  test("keeps wheel input samples in a fixed-size sequence-addressed ring", () => {
    let time = 100;
    const tracker = createWorkflowGraphWheelResponsivenessTracker({
      now: () => time,
    });

    for (let index = 1; index <= 170; index += 1) {
      time += 1;
      const wheelInput = tracker.recordWheelEvent(
        wheelEvent({ deltaY: -index, timeStamp: time - 1 }),
        {
          canvasX: index,
          canvasY: index + 1,
          deltaX: 0,
          deltaY: -index,
          treatment: "zoom",
        },
      );
      tracker.recordWheelCameraResult({
        cameraChanged: true,
        sequence: wheelInput.sequence,
        updateAt: time + 0.5,
      });
    }

    const snapshot = tracker.debugSnapshot();
    expect(snapshot.wheelInput.samples).toHaveLength(160);
    expect(snapshot.wheelInput.samples[0].sequence).toBe(11);
    expect(snapshot.wheelInput.samples.at(-1).sequence).toBe(170);
    expect(snapshot.wheelInput.samples.at(-1)).toMatchObject({
      canvasX: 170,
      eventToCameraUpdateMs: 0.5,
      normalizedDeltaY: -170,
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
