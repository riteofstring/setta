/* global CustomEvent, window */

import { recordingWorkspaceGraphPerformanceEventName } from "@shared/recording";

const movingSampleIntervalMs = 250;
const slowFrameSampleIntervalMs = 250;
const movingSlowFrameThresholdMs = 24;
const idleSlowFrameThresholdMs = 50;

export function createWorkflowGraphPerformanceRecorder({
  enabled,
  getSample,
  surfaceId,
  windowTarget = typeof window === "undefined" ? null : window,
}) {
  if (!enabled || !windowTarget) {
    return noopWorkflowGraphPerformanceRecorder();
  }

  let lastCameraMoving = false;
  let lastMovingSampleAt = -Infinity;
  let lastSlowFrameSampleAt = -Infinity;

  return {
    recordLifecycle,
    recordFrame,
    recordInput,
  };

  function recordLifecycle({ now, reason }) {
    emit(reason, now);
  }

  function recordInput({ now, reason, sample }) {
    emit(reason, now, null, sample);
  }

  function recordFrame({ cameraMoving, frameMs, now }) {
    const reason = emissionReason({
      cameraMoving,
      frameMs,
      now,
    });
    lastCameraMoving = cameraMoving;
    if (reason === null) {
      return;
    }
    emit(reason, now, frameMs);
  }

  function emit(reason, now, frameMs = null, explicitSample = null) {
    windowTarget.dispatchEvent(
      new CustomEvent(recordingWorkspaceGraphPerformanceEventName, {
        detail: {
          reason,
          sample: explicitSample ?? getSample({ frameMs, now, reason }),
          surfaceId,
        },
      }),
    );
  }

  function emissionReason({ cameraMoving, frameMs, now }) {
    if (cameraMoving && !lastCameraMoving) {
      lastMovingSampleAt = now;
      return "camera-start";
    }
    if (!cameraMoving && lastCameraMoving) {
      return "camera-settled";
    }
    if (cameraMoving && now - lastMovingSampleAt >= movingSampleIntervalMs) {
      lastMovingSampleAt = now;
      return "camera-moving";
    }
    if (
      frameMs >= slowFrameThreshold(cameraMoving) &&
      now - lastSlowFrameSampleAt >= slowFrameSampleIntervalMs
    ) {
      lastSlowFrameSampleAt = now;
      return "slow-frame";
    }
    return null;
  }
}

function slowFrameThreshold(cameraMoving) {
  return cameraMoving ? movingSlowFrameThresholdMs : idleSlowFrameThresholdMs;
}

function noopWorkflowGraphPerformanceRecorder() {
  return {
    recordLifecycle() {},
    recordFrame() {},
    recordInput() {},
  };
}
