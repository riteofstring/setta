import type { RefObject } from "react";

import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type { GpuFlowVisiblePublicationDecision } from "../projectionRuntime";

const deferredResolutionFrameTimers = new WeakMap<GpuSurfaceHandle, number>();
const GPU_FLOW_MOTION_ACTIVE_DEBT_RETRY_DELAY_MS = 160;

export function getDelayedGpuFlowPublicationDebtRequestMs({
  publicationDecision,
  schedulerMotionSettleWindowMs,
}: {
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly schedulerMotionSettleWindowMs: number;
}): number | null {
  if (publicationDecision.lane === "motion") {
    return null;
  }
  if (publicationDecision.schedulerState === "motion-active") {
    return GPU_FLOW_MOTION_ACTIVE_DEBT_RETRY_DELAY_MS;
  }
  if (publicationDecision.schedulerState === "motion-settling") {
    return schedulerMotionSettleWindowMs * 8;
  }
  return null;
}

export function scheduleDelayedGpuFlowPublicationDebtFrame({
  delayMs,
  frameReason,
  surfaceRef,
}: {
  readonly delayMs: number;
  readonly frameReason: GpuFrameReason;
  readonly surfaceRef: RefObject<GpuSurfaceHandle | null>;
}): boolean {
  const surface = surfaceRef.current;
  const ownerWindow = surface?.getRuntime()?.canvas.ownerDocument.defaultView;
  if (!surface || !ownerWindow) {
    return false;
  }
  const existingTimer = deferredResolutionFrameTimers.get(surface);
  if (existingTimer !== undefined) {
    ownerWindow.clearTimeout(existingTimer);
  }
  const timer = ownerWindow.setTimeout(
    () => {
      deferredResolutionFrameTimers.delete(surface);
      surface.requestFrame(frameReason);
    },
    Math.max(0, delayMs),
  );
  deferredResolutionFrameTimers.set(surface, timer);
  return true;
}
