import type { RefObject } from "react";

import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";

const deferredResolutionFrameTimers = new WeakMap<GpuSurfaceHandle, number>();

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
