import { recordingWorkspaceGraphPerformanceEventName } from "@shared/recording";
import { describe, expect, test, vi } from "vitest";

import { createWorkflowGraphPerformanceRecorder } from "./pixi-renderer-performance-recorder";

describe("workflow graph performance recorder", () => {
  test("does not emit events when disabled", () => {
    const windowTarget = recordingWindowTarget();
    const recorder = createWorkflowGraphPerformanceRecorder({
      enabled: false,
      getSample: () => ({ value: 1 }),
      surfaceId: "surface-api",
      windowTarget,
    });

    recorder.recordFrame({ cameraMoving: true, frameMs: 8, now: 10 });
    recorder.recordInput({ now: 12, reason: "wheel-input", sample: { value: 2 } });

    expect(windowTarget.dispatchEvent).not.toHaveBeenCalled();
  });

  test("records camera transition, moving, settled, and slow-frame samples", () => {
    const windowTarget = recordingWindowTarget();
    const recorder = createWorkflowGraphPerformanceRecorder({
      enabled: true,
      getSample: ({ reason }) => ({ reason }),
      surfaceId: "surface-api",
      windowTarget,
    });

    recorder.recordFrame({ cameraMoving: true, frameMs: 8, now: 10 });
    recorder.recordFrame({ cameraMoving: true, frameMs: 8, now: 120 });
    recorder.recordFrame({ cameraMoving: true, frameMs: 8, now: 260 });
    recorder.recordFrame({ cameraMoving: true, frameMs: 35, now: 300 });
    recorder.recordFrame({ cameraMoving: true, frameMs: 34, now: 340 });
    recorder.recordFrame({ cameraMoving: false, frameMs: 9, now: 360 });

    expect(recordedReasons(windowTarget)).toEqual([
      "camera-start",
      "camera-moving",
      "slow-frame",
      "camera-settled",
    ]);
    expect(recordedDetails(windowTarget).at(0)).toEqual({
      reason: "camera-start",
      sample: { reason: "camera-start" },
      surfaceId: "surface-api",
    });
  });

  test("records renderer lifecycle samples", () => {
    const windowTarget = recordingWindowTarget();
    const recorder = createWorkflowGraphPerformanceRecorder({
      enabled: true,
      getSample: ({ now, reason }) => ({ now, reason }),
      surfaceId: "surface-api",
      windowTarget,
    });

    recorder.recordLifecycle({ now: 42, reason: "renderer-created" });
    recorder.recordLifecycle({ now: 84, reason: "renderer-destroyed" });

    expect(recordedDetails(windowTarget)).toEqual([
      {
        reason: "renderer-created",
        sample: { now: 42, reason: "renderer-created" },
        surfaceId: "surface-api",
      },
      {
        reason: "renderer-destroyed",
        sample: { now: 84, reason: "renderer-destroyed" },
        surfaceId: "surface-api",
      },
    ]);
  });

  test("records immediate input diagnostics without sampling throttle", () => {
    const windowTarget = recordingWindowTarget();
    const recorder = createWorkflowGraphPerformanceRecorder({
      enabled: true,
      getSample: () => ({ sampled: true }),
      surfaceId: "surface-api",
      windowTarget,
    });

    recorder.recordInput({
      now: 42,
      reason: "wheel-input",
      sample: { eventSequence: 7, treatment: "pan" },
    });

    expect(recordedDetails(windowTarget)).toEqual([
      {
        reason: "wheel-input",
        sample: { eventSequence: 7, treatment: "pan" },
        surfaceId: "surface-api",
      },
    ]);
  });
});

function recordingWindowTarget() {
  return {
    dispatchEvent: vi.fn(),
  };
}

function recordedDetails(windowTarget) {
  return windowTarget.dispatchEvent.mock.calls.map(([event]) => {
    expect(event.type).toBe(recordingWorkspaceGraphPerformanceEventName);
    return event.detail;
  });
}

function recordedReasons(windowTarget) {
  return recordedDetails(windowTarget).map((detail) => detail.reason);
}
