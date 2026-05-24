import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";
import { GPU_FLOW_BROWSER_VISUAL_CONTENT_RETRY_DELAY_MULTIPLIER } from "../projectionSchedulerPolicy";
import type {
  GpuFlowVisibleFrameCoordinatorResult,
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationDebtFrameRequest,
  GpuFlowVisiblePublicationOutcome,
} from "./visibleFrameCoordinator";
import {
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  type GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";
import type {
  GpuFlowSurfacePublicationPreparedFrame,
  RenderGpuFlowSurfaceFrameInput,
} from "./visibleFrameSurfaceFrame";

type GpuFlowBlockedVisibleReason = Extract<
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "blocked" }
>["token"]["blockedReasons"][number];

type GpuFlowDelayedPublicationDebtFrameTimer = {
  readonly frameReason: GpuFrameReason;
  readonly timer: number;
};

const deferredResolutionFrameTimers = new WeakMap<
  GpuSurfaceHandle,
  GpuFlowDelayedPublicationDebtFrameTimer
>();

export function requestGpuFlowSurfacePublicationFollowUpFrames({
  debtFrameRequest,
  followUpFrameRequests,
  surfaceRef,
}: {
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest | null;
  readonly followUpFrameRequests: GpuFlowVisibleFrameCoordinatorResult<GpuFlowSurfacePublicationPreparedFrame>["followUpFrameRequests"];
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  for (const frameReason of followUpFrameRequests) {
    if (debtFrameRequest?.frameReason === frameReason) {
      continue;
    }
    surfaceRef.current?.requestFrame(frameReason);
  }
}

export function createGpuFlowSurfacePublicationDebtFrameRequest({
  completion,
  debtFrameRequest,
  publicationDecision,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisiblePublicationDebtFrameRequest | null {
  if (debtFrameRequest === null) {
    return null;
  }
  if (
    !shouldDelayGpuFlowSurfacePublicationDebtFrame({
      completion,
      debtFrameRequest,
      publicationDecision,
    })
  ) {
    return debtFrameRequest;
  }
  return Object.freeze({
    ...debtFrameRequest,
    delayMs:
      DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.motionSettleWindowMs * 2,
  });
}

export function requestGpuFlowSurfacePublicationDebtFrame({
  debtFrameRequest,
  completion,
  outcome,
  publicationDecision,
  surfaceRef,
}: {
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest | null;
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  if (debtFrameRequest === null) {
    return;
  }
  if (debtFrameRequest.delayMs !== null) {
    scheduleDelayedGpuFlowPublicationDebtFrame({
      delayMs: debtFrameRequest.delayMs,
      frameReason: debtFrameRequest.frameReason,
      surfaceRef,
    });
    return;
  }
  surfaceRef.current?.requestFrame(debtFrameRequest.frameReason);
  scheduleGpuFlowContentRetryAfterBrowserVisualTextureUpload({
    completion,
    debtFrameRequest,
    outcome,
    publicationDecision,
    surfaceRef,
  });
}

function shouldDelayGpuFlowSurfacePublicationDebtFrame({
  completion,
  debtFrameRequest,
  publicationDecision,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): boolean {
  if (publicationDecision.schedulerState === "maintenance-deferred") {
    return true;
  }
  if (isGpuFlowDelayedMotionDebtFrame(debtFrameRequest, publicationDecision)) {
    return true;
  }
  if (debtFrameRequest.frameReason === "texture-upload") {
    return false;
  }
  return shouldDelayGpuFlowContentDebtFrame({
    completion,
    publicationDecision,
  });
}

function isGpuFlowDelayedMotionDebtFrame(
  debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest,
  publicationDecision: GpuFlowVisiblePublicationDecision,
): boolean {
  return (
    publicationDecision.schedulerState === "motion-active" &&
    debtFrameRequest.delayMs !== null
  );
}

function shouldDelayGpuFlowContentDebtFrame({
  completion,
  publicationDecision,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): boolean {
  if (publicationDecision.lane !== "content") {
    return false;
  }
  return (
    completion.debt.content ||
    (completion.debt.maintenance && !completion.debt.motion)
  );
}

function scheduleGpuFlowContentRetryAfterBrowserVisualTextureUpload({
  completion,
  debtFrameRequest,
  outcome,
  publicationDecision,
  surfaceRef,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  if (
    !shouldRetryGpuFlowContentAfterBrowserVisualTextureUpload({
      completion,
      debtFrameRequest,
      outcome,
      publicationDecision,
    })
  ) {
    return;
  }
  scheduleDelayedGpuFlowPublicationDebtFrame({
    delayMs:
      DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.motionSettleWindowMs *
      GPU_FLOW_BROWSER_VISUAL_CONTENT_RETRY_DELAY_MULTIPLIER,
    frameReason: "manual",
    surfaceRef,
  });
}

function shouldRetryGpuFlowContentAfterBrowserVisualTextureUpload({
  completion,
  debtFrameRequest,
  outcome,
  publicationDecision,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): boolean {
  return (
    debtFrameRequest.frameReason === "texture-upload" &&
    completion.debt.content &&
    publicationDecision.lane === "content" &&
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(isGpuFlowSnapshotPendingBlockedReason)
  );
}

function isGpuFlowSnapshotPendingBlockedReason(
  reason: GpuFlowBlockedVisibleReason,
): boolean {
  return (
    reason.family === "browser-text-snapshot" &&
    reason.reason === "snapshot-pending"
  );
}

function scheduleDelayedGpuFlowPublicationDebtFrame({
  delayMs,
  frameReason,
  surfaceRef,
}: {
  readonly delayMs: number;
  readonly frameReason: GpuFrameReason;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): boolean {
  const surface = surfaceRef.current;
  const ownerWindow =
    surface?.getRuntime()?.canvas.ownerDocument.defaultView ??
    (typeof window === "undefined" ? null : window);
  if (!surface || !ownerWindow) {
    return false;
  }
  const existingTimer = deferredResolutionFrameTimers.get(surface);
  if (existingTimer !== undefined) {
    if (existingTimer.frameReason === frameReason) {
      return true;
    }
    ownerWindow.clearTimeout(existingTimer.timer);
  }
  const timer = ownerWindow.setTimeout(
    () => {
      if (deferredResolutionFrameTimers.get(surface)?.timer === timer) {
        deferredResolutionFrameTimers.delete(surface);
      }
      surface.requestFrame(frameReason);
    },
    Math.max(0, delayMs),
  );
  deferredResolutionFrameTimers.set(surface, { frameReason, timer });
  return true;
}
