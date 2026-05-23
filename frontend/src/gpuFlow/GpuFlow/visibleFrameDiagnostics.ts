import type { MutableRefObject } from "react";
import { postChromeReproEvent } from "state/actions/chromeRepro";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  getGpuFlowBrowserVisualBlockedReason,
  getGpuFlowCommittedSurfacePublishabilityActorIds,
} from "./visibleFramePublicationBlockedCandidate";
import type {
  GpuFlowCommittedSurfacePublicationEffect,
  GpuFlowVisiblePublicationCompletion,
} from "./visibleFramePublicationKernel";
import {
  assertGpuFlowBlockedPublicationTokenBrand,
  assertGpuFlowBlockedPublicationTokenForProjectionSample,
  assertGpuFlowCommitPublicationTokenBrand,
  assertGpuFlowHoldPreviousTokenBrand,
  type GpuFlowBlockedFrozenFrame,
  type GpuFlowBlockedPublicationToken,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";

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
  readonly candidateFrameId: number | null;
  readonly frozenFrame: GpuFlowBlockedFrozenFrame;
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
  readonly publicationLane: GpuFlowVisiblePublicationDecision["lane"];
  readonly projectionSampleId: number;
  readonly remainingDebt: GpuFlowVisiblePublicationCompletion["debt"];
  readonly schedulerOutcome: GpuFlowVisiblePublicationCompletion["outcome"];
  readonly schedulerState: GpuFlowVisiblePublicationDecision["schedulerState"];
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
const GPU_FLOW_BROWSER_VISUAL_DEFERRED_RETRY_MS =
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.motionSettleWindowMs * 2;

export function recordGpuFlowVisibleFramePresented(application: {
  readonly effect: GpuFlowCommittedSurfacePublicationEffect | null;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  const { effect, runtimeCanvas, surfaceRef, token } = application;
  assertGpuFlowCommitPublicationTokenBrand({ token });
  if (effect === null) {
    return;
  }
  if (effect.kind !== "publish") {
    throw new Error(
      "GPU Flow committed surface commit effect requires a publish effect.",
    );
  }
  clearGpuFlowBrowserVisualStarvationDebt(runtimeCanvas);
  clearGpuFlowBrowserVisualRetryFrame({
    runtimeCanvas,
    surface: surfaceRef.current,
  });
}

export function recordGpuFlowVisibleFrameHeld(application: {
  readonly effect: GpuFlowCommittedSurfacePublicationEffect | null;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly token: GpuFlowHoldPreviousToken;
}): void {
  const { effect, runtimeCanvas, surfaceRef, token } = application;
  assertGpuFlowHoldPreviousTokenBrand({ token });
  if (effect === null) {
    return;
  }
  if (effect.kind === "publish") {
    return;
  }
  applyGpuFlowBrowserVisualStarvationEffect({
    effect,
    outcome: "held-previous",
    runtimeCanvas,
    surfaceRef,
  });
}

export function recordGpuFlowVisibleFrameBlocked(application: {
  readonly effect: GpuFlowCommittedSurfacePublicationEffect | null;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly token: GpuFlowBlockedPublicationToken;
}): void {
  const { effect, runtimeCanvas, surfaceRef, token } = application;
  assertGpuFlowBlockedPublicationTokenBrand({ token });
  if (effect === null) {
    return;
  }
  if (effect.kind === "publish") {
    return;
  }
  applyGpuFlowBrowserVisualStarvationEffect({
    effect,
    outcome: "blocked",
    runtimeCanvas,
    surfaceRef,
  });
}

function applyGpuFlowBrowserVisualStarvationEffect({
  effect,
  outcome,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly effect: Extract<
    GpuFlowCommittedSurfacePublicationEffect,
    { readonly kind: "rejected-candidate" }
  >;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}): void {
  recordGpuFlowBrowserVisualStarvation({
    frame: effect.candidateFrame,
    nowMs: effect.timestamp,
    outcome,
    runtimeCanvas,
  });
  requestGpuFlowBrowserVisualRetryFrame({
    deferRetry:
      effect.deferRetry ||
      shouldWaitForGpuFlowBrowserVisualRepairSignal(effect.candidateFrame),
    runtimeCanvas,
    surfaceRef,
  });
}

function shouldWaitForGpuFlowBrowserVisualRepairSignal(
  frame: GpuFlowCommittedSurfaceFrame,
): boolean {
  const blockingActorIds = new Set(
    getGpuFlowCommittedSurfacePublishabilityActorIds(frame),
  );
  return frame.actorGenerations.some(
    (actor) =>
      blockingActorIds.has(actor.actorId) &&
      (actor.kind === "dom-control" ||
        actor.kind === "dom-island" ||
        isGpuFlowBrowserVisualRepairableTextCoverageProof(
          actor.textCoverageProof,
        )),
  );
}

function isGpuFlowBrowserVisualRepairableTextCoverageProof(
  textCoverage: OptionalGpuFlowBrowserVisualTextCoverageProof,
): boolean {
  if (!textCoverage || !("readinessReason" in textCoverage)) {
    return false;
  }
  return (
    textCoverage.readinessReason === "snapshot-pending" ||
    textCoverage.readinessReason === "live-dom-budget"
  );
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

export function recordGpuFlowBlockedVisiblePublication({
  frame,
  publicationCompletion,
  publicationDecision,
  runtimeCanvas,
  token,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
  readonly publicationCompletion: GpuFlowVisiblePublicationCompletion;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly token: GpuFlowBlockedPublicationToken;
}): GpuFlowBlockedPublicationToken {
  assertGpuFlowBlockedPublicationTokenForProjectionSample({
    projectionSampleId: publicationDecision.sample.id,
    token,
  });
  if (publicationCompletion.outcome !== "blocked") {
    throw new Error(
      "GPU Flow blocked visible publication recording requires a blocked scheduler completion.",
    );
  }
  const event = Object.freeze({
    blockedReasons: token.blockedReasons,
    candidateFrameId: frame?.displayFrameId ?? null,
    frozenFrame: token.frozenFrame,
    frozenFrameId: token.frozenFrameId,
    publicationLane: publicationDecision.lane,
    projectionSampleId: token.projectionSampleId,
    remainingDebt: publicationCompletion.debt,
    schedulerOutcome: publicationCompletion.outcome,
    schedulerState: publicationDecision.schedulerState,
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
    publicationLane: event.publicationLane,
    projectionSampleId: event.projectionSampleId,
    remainingDebt: event.remainingDebt,
    schedulerOutcome: event.schedulerOutcome,
    schedulerState: event.schedulerState,
    transactionId: event.tokenTransactionId,
  });
  return token;
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
