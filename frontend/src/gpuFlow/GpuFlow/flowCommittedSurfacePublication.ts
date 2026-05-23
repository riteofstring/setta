import type { MutableRefObject } from "react";
import { postChromeReproEvent } from "state/actions/chromeRepro";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import {
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  applyGpuFlowProjectionDebugAttributes,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuFlowVisibleProjectionStateForRetainedPublication } from "./flowVisibleProjectionState";
import {
  GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  createGpuFlowBlockedPublicationToken,
  createGpuFlowCommitPublicationToken,
  createGpuFlowHoldPreviousToken,
  createGpuFlowPresentableCommit,
} from "./visibleFramePublicationAuthority";
import type {
  GpuFlowBlockedFrozenFrame,
  GpuFlowBlockedPublicationToken,
  GpuFlowCommitPublicationToken,
  GpuFlowHoldPreviousToken,
} from "./visibleFramePublicationTokens";

type GpuFlowCommittedSurfacePublicationGateResult =
  | {
      readonly kind: "publish";
      readonly token: GpuFlowCommitPublicationToken | null;
    }
  | {
      readonly kind: "blocked";
      readonly token: GpuFlowBlockedPublicationToken;
    }
  | {
      readonly kind: "held-previous";
      readonly token: GpuFlowHoldPreviousToken;
      readonly visibleProjectionState: GpuFlowVisibleProjectionState;
    };

type GpuFlowBrowserVisualStarvationOutcome = "blocked" | "held-previous";

type GpuFlowBrowserVisualStarvationReport = {
  readonly actorId: string;
  readonly actorKind: string;
  readonly ageMs: number;
  readonly blockedFrameCount: number;
  readonly blockedReason: string;
  readonly budget: "browser-visual-coverage";
  readonly generationId: string;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
  readonly pendingWorkId: string;
  readonly requiredRepresentation: string;
  readonly visibleActorCount: number;
};

type GpuFlowBlockedVisiblePublicationEvent = {
  readonly blockedReasons: readonly {
    readonly actorId: string | null;
    readonly family: string;
    readonly reason: string;
  }[];
  readonly candidateFrameId: number;
  readonly frozenFrame: GpuFlowBlockedFrozenFrame;
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
  readonly projectionSampleId: number;
  readonly tokenTransactionId: string;
};

type GpuFlowBrowserVisualActorGeneration =
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number];

type GpuFlowBrowserVisualTextCoverageProof = NonNullable<
  GpuFlowBrowserVisualActorGeneration["textCoverageProof"]
>;
type OptionalGpuFlowBrowserVisualTextCoverageProof =
  | GpuFlowBrowserVisualTextCoverageProof
  | null
  | undefined;

type GpuFlowBrowserVisualStarvationDebt = {
  readonly actorIdsKey: string;
  readonly firstBlockedAtMs: number;
  readonly frameCount: number;
};

const browserVisualStarvationDebtByCanvas = new WeakMap<
  HTMLCanvasElement,
  GpuFlowBrowserVisualStarvationDebt
>();
const browserVisualRetryFrameTimers = new WeakMap<GpuSurfaceHandle, number>();
const GPU_FLOW_BROWSER_VISUAL_DEFERRED_RETRY_MS = 160;

export function resolveGpuFlowCommittedSurfacePublicationGate({
  committedGpuNativeVisuals,
  deferBrowserVisualRetry,
  frameReasons,
  heldPreviousProjectionState,
  liveProjectionSample,
  publicationLane,
  publishedCommittedSurfaceFrame,
  publishedRetainedFrame,
  previousRetainedDisplayFrame,
  retainedDisplayFrameRef,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly deferBrowserVisualRetry?: boolean | undefined;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
  readonly previousRetainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: MutableRefObject<RetainedDisplayFrame | null>;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): GpuFlowCommittedSurfacePublicationGateResult {
  if (
    !publishedCommittedSurfaceFrame ||
    publishedCommittedSurfaceFrame.publishability.kind === "publishable"
  ) {
    clearGpuFlowBrowserVisualStarvationDebt(runtimeCanvas);
    clearGpuFlowBrowserVisualRetryFrame({
      runtimeCanvas,
      surface: surfaceRef.current,
    });
    return {
      kind: "publish",
      token: publishedCommittedSurfaceFrame
        ? createGpuFlowCommitPublicationToken({
            presentableCommit: createGpuFlowPresentableCommit({
              frame: publishedCommittedSurfaceFrame,
              projectionSample: liveProjectionSample,
            }),
          })
        : null,
    };
  }
  retainedDisplayFrameRef.current = previousRetainedDisplayFrame;
  if (publishedCommittedSurfaceFrame.publishability.kind === "true-hole") {
    recordGpuFlowBrowserVisualStarvation({
      frame: publishedCommittedSurfaceFrame,
      nowMs: liveProjectionSample.timestamp,
      outcome: "blocked",
      runtimeCanvas,
    });
    recordGpuFlowBlockedVisiblePublication({
      frame: publishedCommittedSurfaceFrame,
      frozenFrameId: resolveGpuFlowBlockedVisibleFrozenFrameId({
        heldPreviousProjectionState,
      }),
      projectionSample: liveProjectionSample,
      runtimeCanvas,
    });
    throw new Error(
      `GPU Flow committed surface frame has true-hole browser visual coverage: ${getGpuFlowCommittedSurfacePublishabilityActorIds(
        publishedCommittedSurfaceFrame,
      ).join(", ")}.`,
    );
  }
  requestGpuFlowBrowserVisualRetryFrame({
    deferRetry: deferBrowserVisualRetry === true,
    runtimeCanvas,
    surfaceRef,
  });
  if (
    publishedCommittedSurfaceFrame.publishability.kind !== "hold-previous" ||
    !heldPreviousProjectionState
  ) {
    recordGpuFlowBrowserVisualStarvation({
      frame: publishedCommittedSurfaceFrame,
      nowMs: liveProjectionSample.timestamp,
      outcome: "blocked",
      runtimeCanvas,
    });
    const token = recordGpuFlowBlockedVisiblePublication({
      frame: publishedCommittedSurfaceFrame,
      frozenFrameId: resolveGpuFlowBlockedVisibleFrozenFrameId({
        heldPreviousProjectionState,
      }),
      projectionSample: liveProjectionSample,
      runtimeCanvas,
    });
    return { kind: "blocked", token };
  }
  recordGpuFlowBrowserVisualStarvation({
    frame: publishedCommittedSurfaceFrame,
    nowMs: liveProjectionSample.timestamp,
    outcome: "held-previous",
    runtimeCanvas,
  });
  const visibleProjectionState =
    createGpuFlowVisibleProjectionStateForRetainedPublication({
      committedGpuNativeVisuals,
      frameReasons,
      heldPreviousProjectionState,
      heldPreviousReason: "browser-visual-coverage-missing",
      liveProjectionSample,
      publicationLane,
      publishedCommittedSurfaceFrame: undefined,
      publishedRetainedFrame,
      retainedDisplayOutcomeKind: "hold-previous",
    });
  const heldPreviousProjection = visibleProjectionState.heldPreviousProjection;
  if (!heldPreviousProjection) {
    throw new Error(
      "GPU Flow held-previous publication requires held-previous diagnostics.",
    );
  }
  const token = createGpuFlowHoldPreviousToken({
    committedFrameId: visibleProjectionState.committedFrame.displayFrameId,
    holdAgeFrames: heldPreviousProjection.consecutiveFrameCount,
    holdAgeMs: heldPreviousProjection.heldDurationMs,
    projectionSample: liveProjectionSample,
  });
  applyGpuFlowProjectionDebugAttributes({
    canvas: runtimeCanvas,
    debugState: visibleProjectionState.debugState,
    token,
  });
  return {
    kind: "held-previous",
    token,
    visibleProjectionState,
  };
}

function requestGpuFlowBrowserVisualRetryFrame({
  deferRetry,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly deferRetry: boolean;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): void {
  const surface = surfaceRef.current;
  if (!surface) {
    return;
  }
  if (!deferRetry) {
    clearGpuFlowBrowserVisualRetryFrame({
      runtimeCanvas,
      surface,
    });
    surface.requestFrame("texture-upload");
    return;
  }
  if (browserVisualRetryFrameTimers.has(surface)) {
    return;
  }
  const ownerWindow = runtimeCanvas.ownerDocument.defaultView;
  if (!ownerWindow) {
    surface.requestFrame("texture-upload");
    return;
  }
  const timer = ownerWindow.setTimeout(() => {
    browserVisualRetryFrameTimers.delete(surface);
    surface.requestFrame("texture-upload");
  }, GPU_FLOW_BROWSER_VISUAL_DEFERRED_RETRY_MS);
  browserVisualRetryFrameTimers.set(surface, timer);
}

function clearGpuFlowBrowserVisualRetryFrame({
  runtimeCanvas,
  surface,
}: {
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surface: GpuSurfaceHandle | null;
}): void {
  if (!surface) {
    return;
  }
  const timer = browserVisualRetryFrameTimers.get(surface);
  if (timer === undefined) {
    return;
  }
  runtimeCanvas.ownerDocument.defaultView?.clearTimeout(timer);
  browserVisualRetryFrameTimers.delete(surface);
}

function clearGpuFlowBrowserVisualStarvationDebt(
  runtimeCanvas: HTMLCanvasElement,
): void {
  browserVisualStarvationDebtByCanvas.delete(runtimeCanvas);
}

function recordGpuFlowBrowserVisualStarvation({
  frame,
  nowMs,
  outcome,
  runtimeCanvas,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly nowMs: number;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
  readonly runtimeCanvas: HTMLCanvasElement;
}): void {
  const actorIds = getGpuFlowCommittedSurfacePublishabilityActorIds(frame);
  const actorIdsKey = actorIds.join("\n");
  const previousDebt = browserVisualStarvationDebtByCanvas.get(runtimeCanvas);
  const debt =
    previousDebt?.actorIdsKey === actorIdsKey
      ? {
          actorIdsKey,
          firstBlockedAtMs: previousDebt.firstBlockedAtMs,
          frameCount: previousDebt.frameCount + 1,
        }
      : {
          actorIdsKey,
          firstBlockedAtMs: nowMs,
          frameCount: 1,
        };
  browserVisualStarvationDebtByCanvas.set(runtimeCanvas, debt);
  const reports = createGpuFlowBrowserVisualStarvationReports({
    debt,
    frame,
    nowMs,
    outcome,
  });
  emitGpuFlowBrowserVisualStarvationReports({
    reports,
    runtimeCanvas,
  });
  if (
    isGpuFlowBrowserVisualStarvationFailFastRuntime() &&
    isGpuFlowBrowserVisualStarvationBudgetExceeded({
      ageMs: Math.max(0, nowMs - debt.firstBlockedAtMs),
      frameCount: debt.frameCount,
    })
  ) {
    throw new Error(
      `GPU Flow browser visual actor starvation exceeded budget: ${JSON.stringify(
        reports,
      )}`,
    );
  }
}

function createGpuFlowBrowserVisualStarvationReports({
  debt,
  frame,
  nowMs,
  outcome,
}: {
  readonly debt: GpuFlowBrowserVisualStarvationDebt;
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly nowMs: number;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
}): readonly GpuFlowBrowserVisualStarvationReport[] {
  const actorById = new Map(
    frame.actorGenerations.map((actor) => [actor.actorId, actor]),
  );
  const ageMs = Math.max(0, nowMs - debt.firstBlockedAtMs);
  const visibleActorCount =
    frame.projectionHorizon.obligations.visibleActorIds.length;
  return Object.freeze(
    getGpuFlowCommittedSurfacePublishabilityActorIds(frame).map((actorId) =>
      createGpuFlowBrowserVisualStarvationReport({
        actor: actorById.get(actorId),
        actorId,
        ageMs,
        blockedFrameCount: debt.frameCount,
        frame,
        outcome,
        visibleActorCount,
      }),
    ),
  );
}

function createGpuFlowBrowserVisualStarvationReport({
  actor,
  actorId,
  ageMs,
  blockedFrameCount,
  frame,
  outcome,
  visibleActorCount,
}: {
  readonly actor: GpuFlowBrowserVisualActorGeneration | undefined;
  readonly actorId: string;
  readonly ageMs: number;
  readonly blockedFrameCount: number;
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
  readonly visibleActorCount: number;
}): GpuFlowBrowserVisualStarvationReport {
  const textCoverage = actor?.textCoverageProof;
  return Object.freeze({
    actorId,
    actorKind: actor?.kind ?? "unknown",
    ageMs,
    blockedFrameCount,
    blockedReason: getGpuFlowBrowserVisualBlockedReason({
      frame,
      textCoverage,
    }),
    budget: "browser-visual-coverage",
    generationId: actor?.generationId ?? "unknown",
    outcome,
    pendingWorkId: getGpuFlowBrowserVisualPendingWorkId({
      actor,
      actorId,
      textCoverage,
    }),
    requiredRepresentation: getGpuFlowBrowserVisualRequiredRepresentation({
      frame,
      textCoverage,
    }),
    visibleActorCount,
  });
}

function getGpuFlowBrowserVisualBlockedReason({
  frame,
  textCoverage,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly textCoverage: OptionalGpuFlowBrowserVisualTextCoverageProof;
}): string {
  if (textCoverage && "readinessReason" in textCoverage) {
    return textCoverage.readinessReason;
  }
  return getGpuFlowCommittedSurfacePublishabilityReason(frame);
}

function getGpuFlowBrowserVisualPendingWorkId({
  actor,
  actorId,
  textCoverage,
}: {
  readonly actor: GpuFlowBrowserVisualActorGeneration | undefined;
  readonly actorId: string;
  readonly textCoverage: OptionalGpuFlowBrowserVisualTextCoverageProof;
}): string {
  if (textCoverage?.snapshotCacheKeyRevision) {
    return [actorId, textCoverage.snapshotCacheKeyRevision].join("|");
  }
  if (textCoverage?.visualGenerationId) {
    return [actorId, textCoverage.visualGenerationId].join("|");
  }
  return [actorId, actor?.generationId ?? "unknown"].join("|");
}

function getGpuFlowBrowserVisualRequiredRepresentation({
  frame,
  textCoverage,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly textCoverage: OptionalGpuFlowBrowserVisualTextCoverageProof;
}): string {
  return textCoverage?.projectionCoverage ?? frame.publishability.kind;
}

function getGpuFlowCommittedSurfacePublishabilityActorIds(
  frame: GpuFlowCommittedSurfaceFrame,
): readonly string[] {
  return frame.publishability.kind === "true-hole"
    ? frame.publishability.actorIds
    : frame.publishability.blockingActorIds;
}

function getGpuFlowCommittedSurfacePublishabilityReason(
  frame: GpuFlowCommittedSurfaceFrame,
): string {
  switch (frame.publishability.kind) {
    case "block-first-publication":
    case "hold-previous":
    case "true-hole":
      return frame.publishability.reason;
    case "publishable":
      return "browser-visual-coverage-missing";
  }
}

function emitGpuFlowBrowserVisualStarvationReports({
  reports,
  runtimeCanvas,
}: {
  readonly reports: readonly GpuFlowBrowserVisualStarvationReport[];
  readonly runtimeCanvas: HTMLCanvasElement;
}): void {
  const ownerWindow = runtimeCanvas.ownerDocument.defaultView;
  if (!ownerWindow) {
    return;
  }
  const view = ownerWindow as typeof ownerWindow & {
    __SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__?: GpuFlowBrowserVisualStarvationReport[];
  };
  const existingReports =
    view.__SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__ ?? [];
  view.__SETTA_GPU_FLOW_BROWSER_VISUAL_STARVATION_REPORTS__ = [
    ...existingReports,
    ...reports,
  ];
  for (const report of reports) {
    runtimeCanvas.dispatchEvent(
      new CustomEvent("setta-gpu-flow-browser-visual-starvation", {
        detail: report,
      }),
    );
  }
}

function recordGpuFlowBlockedVisiblePublication({
  frame,
  frozenFrameId,
  projectionSample,
  runtimeCanvas,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
  readonly projectionSample: GpuFlowLiveProjectionSample;
  readonly runtimeCanvas: HTMLCanvasElement;
}): GpuFlowBlockedPublicationToken {
  const blockedReasons = createGpuFlowBlockedVisibleReasons(frame);
  const token = createGpuFlowBlockedPublicationToken({
    blockedReasons,
    frozenFrameId,
    projectionSample,
  });
  const event = Object.freeze({
    blockedReasons,
    candidateFrameId: frame.displayFrameId,
    frozenFrame: token.frozenFrame,
    frozenFrameId,
    projectionSampleId: projectionSample.id,
    tokenTransactionId: token.transactionId,
  } satisfies GpuFlowBlockedVisiblePublicationEvent);
  emitGpuFlowBlockedVisiblePublicationEvent({
    event,
    runtimeCanvas,
  });
  postChromeReproEvent("gpu-flow-blocked-visible-publication", {
    blockedReasons: event.blockedReasons,
    candidateFrameId: event.candidateFrameId,
    frozenFrame: event.frozenFrame,
    frozenFrameId: event.frozenFrameId,
    projectionSampleId: event.projectionSampleId,
    transactionId: event.tokenTransactionId,
  });
  return token;
}

function createGpuFlowBlockedVisibleReasons(
  frame: GpuFlowCommittedSurfaceFrame,
): GpuFlowBlockedVisiblePublicationEvent["blockedReasons"] {
  const actorById = new Map(
    frame.actorGenerations.map((actor) => [actor.actorId, actor]),
  );
  const actorIds = getGpuFlowCommittedSurfacePublishabilityActorIds(frame);
  return Object.freeze(
    actorIds.map((actorId) => {
      const actor = actorById.get(actorId);
      return Object.freeze({
        actorId,
        family: actor?.actorFamily ?? actor?.kind ?? "unknown",
        reason: getGpuFlowBrowserVisualBlockedReason({
          frame,
          textCoverage: actor?.textCoverageProof,
        }),
      });
    }),
  );
}

function emitGpuFlowBlockedVisiblePublicationEvent({
  event,
  runtimeCanvas,
}: {
  readonly event: GpuFlowBlockedVisiblePublicationEvent;
  readonly runtimeCanvas: HTMLCanvasElement;
}): void {
  const ownerWindow = runtimeCanvas.ownerDocument.defaultView;
  if (!ownerWindow) {
    return;
  }
  const view = ownerWindow as typeof ownerWindow & {
    __SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?: GpuFlowBlockedVisiblePublicationEvent[];
  };
  const existingEvents =
    view.__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__ ?? [];
  view.__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__ = [
    ...existingEvents,
    event,
  ];
  runtimeCanvas.dispatchEvent(
    new CustomEvent("setta-gpu-flow-blocked-visible-publication", {
      detail: event,
    }),
  );
}

function resolveGpuFlowBlockedVisibleFrozenFrameId({
  heldPreviousProjectionState,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowBlockedPublicationToken["frozenFrameId"] {
  return (
    heldPreviousProjectionState?.committedFrame.displayFrameId ??
    GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID
  );
}

function isGpuFlowBrowserVisualStarvationBudgetExceeded({
  ageMs,
  frameCount,
}: {
  readonly ageMs: number;
  readonly frameCount: number;
}): boolean {
  return (
    frameCount >
      DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.maxHeldPreviousFrames ||
    ageMs > DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.maxHeldPreviousMs
  );
}

function isGpuFlowBrowserVisualStarvationFailFastRuntime(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV === "test";
}
