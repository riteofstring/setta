import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  GPU_FLOW_BROWSER_VISUAL_CONTENT_RETRY_DELAY_MULTIPLIER,
  isGpuFlowBrowserTextSnapshotPendingBlockedReason,
} from "../projectionSchedulerPolicy";
import type {
  GpuFlowVisibleFrameCoordinatorResult,
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationDebtFrameRequest,
  GpuFlowVisiblePublicationOutcome,
} from "./visibleFrameCoordinator";
import {
  DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY,
  type GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";
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
  activeEditorActivationPending = false,
  completion,
  debtFrameRequest,
  reducerDecision,
}: {
  readonly activeEditorActivationPending?: boolean | undefined;
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): GpuFlowVisiblePublicationDebtFrameRequest | null {
  if (debtFrameRequest === null) {
    return null;
  }
  if (activeEditorActivationPending && completion.debt.content) {
    return Object.freeze({
      ...debtFrameRequest,
      delayMs: null,
      frameReason: "dom-control-activation",
    });
  }
  if (
    !shouldDelayGpuFlowSurfacePublicationDebtFrame({
      completion,
      debtFrameRequest,
      reducerDecision,
    })
  ) {
    return debtFrameRequest;
  }
  return Object.freeze({
    ...debtFrameRequest,
    delayMs:
      DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY.motionSettleWindowMs * 2,
  });
}

export function requestGpuFlowSurfacePublicationDebtFrame({
  debtFrameRequest,
  completion,
  outcome,
  reducerDecision,
  surfaceRef,
}: {
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest | null;
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  recordGpuFlowSurfacePublicationDebtFrameRequestDiagnostic({
    completion,
    debtFrameRequest,
    outcome,
    reducerDecision,
  });
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
    reducerDecision,
    surfaceRef,
  });
}

function recordGpuFlowSurfacePublicationDebtFrameRequestDiagnostic({
  completion,
  debtFrameRequest,
  outcome,
  reducerDecision,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest | null;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): void {
  const view = globalThis as typeof globalThis & {
    __SETTA_GPU_FLOW_PUBLICATION_DEBT_FRAME_REQUESTS__?: unknown[];
  };
  const requests =
    view.__SETTA_GPU_FLOW_PUBLICATION_DEBT_FRAME_REQUESTS__ ?? [];
  requests.push({
    completionDebt: completion.debt,
    completionOutcome: completion.outcome,
    delayMs: debtFrameRequest?.delayMs ?? null,
    frameReason: debtFrameRequest?.frameReason ?? null,
    outcomeKind: outcome.kind,
    publicationLane: reducerDecision.lane,
    reducerState: reducerDecision.reducerState,
  });
  view.__SETTA_GPU_FLOW_PUBLICATION_DEBT_FRAME_REQUESTS__ =
    requests.slice(-20);
}

function shouldDelayGpuFlowSurfacePublicationDebtFrame({
  completion,
  debtFrameRequest,
  reducerDecision,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  if (reducerDecision.reducerState === "maintenance-deferred") {
    return true;
  }
  if (isGpuFlowDelayedMotionDebtFrame(debtFrameRequest, reducerDecision)) {
    return true;
  }
  if (debtFrameRequest.frameReason === "texture-upload") {
    return false;
  }
  if (debtFrameRequest.frameReason === "dom-control-activation") {
    return false;
  }
  return shouldDelayGpuFlowContentDebtFrame({
    completion,
    reducerDecision,
  });
}

function isGpuFlowDelayedMotionDebtFrame(
  debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest,
  reducerDecision: GpuFlowVisibleFrameReducerDecision,
): boolean {
  return (
    reducerDecision.reducerState === "motion-active" &&
    debtFrameRequest.delayMs !== null
  );
}

function shouldDelayGpuFlowContentDebtFrame({
  completion,
  reducerDecision,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  if (reducerDecision.lane !== "content") {
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
  reducerDecision,
  surfaceRef,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  if (
    !shouldRetryGpuFlowContentAfterBrowserVisualTextureUpload({
      completion,
      debtFrameRequest,
      outcome,
      reducerDecision,
    })
  ) {
    return;
  }
  scheduleDelayedGpuFlowPublicationDebtFrame({
    delayMs:
      DEFAULT_GPU_FLOW_VISIBLE_FRAME_REDUCER_POLICY.motionSettleWindowMs *
      GPU_FLOW_BROWSER_VISUAL_CONTENT_RETRY_DELAY_MULTIPLIER,
    frameReason: "manual",
    surfaceRef,
  });
}

function shouldRetryGpuFlowContentAfterBrowserVisualTextureUpload({
  completion,
  debtFrameRequest,
  outcome,
  reducerDecision,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  return (
    debtFrameRequest.frameReason === "texture-upload" &&
    completion.debt.content &&
    reducerDecision.lane === "content" &&
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(isGpuFlowSnapshotPendingBlockedReason)
  );
}

function isGpuFlowSnapshotPendingBlockedReason(
  reason: GpuFlowBlockedVisibleReason,
): boolean {
  return isGpuFlowBrowserTextSnapshotPendingBlockedReason(reason);
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
