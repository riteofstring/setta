import type { Transform } from "../types";

type FrameId = number;

type RenderTransformScheduler = {
  cancel: () => void;
  flush: (transform: Transform) => void;
  schedule: (transform: Transform) => void;
};

type CreateRenderTransformSchedulerOptions = {
  applyTransform: (transform: Transform) => void;
  cancelFrame: (frameId: FrameId) => void;
  getNow: () => number;
  maxFps?: number;
  scheduleFrame: (onFrame: () => void) => FrameId;
};

function cloneTransform(transform: Transform): Transform {
  return [transform[0], transform[1], transform[2]];
}

export function createRenderTransformScheduler({
  applyTransform,
  cancelFrame,
  getNow,
  maxFps,
  scheduleFrame,
}: CreateRenderTransformSchedulerOptions): RenderTransformScheduler {
  let pendingFrameId: FrameId | null = null;
  let pendingTransform: Transform | null = null;
  const minFrameIntervalMs =
    typeof maxFps === "number" && maxFps > 0 ? 1000 / maxFps : 0;
  let lastCommittedAtMs = Number.NEGATIVE_INFINITY;

  const commitPendingTransform = () => {
    if (!pendingTransform) {
      return;
    }
    const nextTransform = pendingTransform;
    pendingTransform = null;
    applyTransform(nextTransform);
    lastCommittedAtMs = getNow();
  };

  const queueNextFrame = () => {
    if (pendingFrameId !== null) {
      return;
    }
    pendingFrameId = scheduleFrame(() => {
      pendingFrameId = null;

      if (!pendingTransform) {
        return;
      }

      if (minFrameIntervalMs > 0) {
        const now = getNow();
        if (now - lastCommittedAtMs < minFrameIntervalMs) {
          queueNextFrame();
          return;
        }
      }

      commitPendingTransform();
    });
  };

  return {
    schedule(transform: Transform) {
      pendingTransform = cloneTransform(transform);
      queueNextFrame();
    },
    flush(transform: Transform) {
      pendingTransform = null;
      if (pendingFrameId !== null) {
        cancelFrame(pendingFrameId);
        pendingFrameId = null;
      }
      applyTransform(cloneTransform(transform));
      lastCommittedAtMs = getNow();
    },
    cancel() {
      pendingTransform = null;
      if (pendingFrameId !== null) {
        cancelFrame(pendingFrameId);
        pendingFrameId = null;
      }
    },
  };
}
