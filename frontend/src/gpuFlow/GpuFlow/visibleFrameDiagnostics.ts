import type { MutableRefObject } from "react";
import { postChromeReproEvent } from "state/actions/chromeRepro";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  createGpuFlowVisibleFrameActorManifestDiagnostics,
  type GpuFlowVisibleFrameActorManifestDiagnostics,
} from "./visibleFrameActorManifestDiagnostics";
import {
  getGpuFlowBrowserVisualBlockedReason,
  getGpuFlowCommittedSurfacePublishabilityActorIds,
} from "./visibleFrameBlockedCandidate";
import type {
  GpuFlowBrowserVisualResourceWorkRequest,
  GpuFlowCommittedSurfaceBlockedCandidateResourceWork,
} from "./visibleFrameContentPlan";
import type { GpuFlowVisiblePublicationCompletion } from "./visibleFrameCoordinator";
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
import {
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  type GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";

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
  readonly actorManifest: GpuFlowVisibleFrameActorManifestDiagnostics;
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
  readonly stateMachineOutcome: {
    readonly decidingProof: unknown;
    readonly kind: string;
  } | null;
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

type GpuFlowBrowserVisualResourceReadinessState =
  | "preparing"
  | "ready"
  | "requested";

type GpuFlowBrowserVisualResourceWakeupSource =
  | "blocked-publication"
  | "deferred-watchdog"
  | "immediate-frame-request";

type GpuFlowBrowserVisualResourceWorkSnapshot = Omit<
  GpuFlowBrowserVisualResourceWorkRequest,
  "debtAgeFrames" | "readinessState" | "wakeupSource"
> & {
  readonly debtAgeFrames: number;
  readonly debtAgeMs: number;
  readonly firstRequestedAtMs: number;
  readonly lastUpdatedAtMs: number;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
  readonly readinessState: GpuFlowBrowserVisualResourceReadinessState;
  readonly wakeupSource: GpuFlowBrowserVisualResourceWakeupSource;
};

const browserVisualStarvationDebtByCanvas = new WeakMap<
  HTMLCanvasElement,
  GpuFlowBrowserVisualStarvationDebt
>();
const browserVisualResourceWorkByCanvas = new WeakMap<
  HTMLCanvasElement,
  Map<string, GpuFlowBrowserVisualResourceWorkSnapshot>
>();

export function recordGpuFlowVisibleFramePresented(application: {
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  const { committedSurfaceFrame, runtimeCanvas, token } = application;
  assertGpuFlowCommitPublicationTokenBrand({ token });
  if (committedSurfaceFrame === null) {
    return;
  }
  clearGpuFlowBrowserVisualStarvationDebt(runtimeCanvas);
  clearGpuFlowBrowserVisualResourceWork(runtimeCanvas);
}

export function recordGpuFlowVisibleFrameHeld(application: {
  readonly candidateFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly token: GpuFlowHoldPreviousToken;
}): void {
  const {
    candidateFrame,
    candidateResourceWork,
    runtimeCanvas,
    token,
  } = application;
  assertGpuFlowHoldPreviousTokenBrand({ token });
  if (candidateFrame === null || candidateResourceWork === null) {
    return;
  }
  applyGpuFlowBrowserVisualStarvationCandidate({
    candidateFrame,
    candidateResourceWork,
    outcome: "held-previous",
    runtimeCanvas,
  });
}

export function recordGpuFlowVisibleFrameBlocked(application: {
  readonly candidateFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly token: GpuFlowBlockedPublicationToken;
}): void {
  const {
    candidateFrame,
    candidateResourceWork,
    runtimeCanvas,
    token,
  } = application;
  assertGpuFlowBlockedPublicationTokenBrand({ token });
  if (candidateFrame === null || candidateResourceWork === null) {
    return;
  }
  applyGpuFlowBrowserVisualStarvationCandidate({
    candidateFrame,
    candidateResourceWork,
    outcome: "blocked",
    runtimeCanvas,
  });
}

function applyGpuFlowBrowserVisualStarvationCandidate({
  candidateFrame,
  candidateResourceWork,
  outcome,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly candidateFrame: GpuFlowCommittedSurfaceFrame;
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
  readonly runtimeCanvas: HTMLCanvasElement;
}): void {
  recordGpuFlowBrowserVisualStarvation({
    frame: candidateFrame,
    nowMs: candidateResourceWork.timestamp,
    outcome,
    runtimeCanvas,
  });
  recordGpuFlowBrowserVisualResourceWork({
    candidateResourceWork,
    nowMs: candidateResourceWork.timestamp,
    outcome,
    runtimeCanvas,
  });
}

function clearGpuFlowBrowserVisualStarvationDebt(
  runtimeCanvas: HTMLCanvasElement,
): void {
  browserVisualStarvationDebtByCanvas.delete(runtimeCanvas);
}

function clearGpuFlowBrowserVisualResourceWork(
  runtimeCanvas: HTMLCanvasElement,
): void {
  browserVisualResourceWorkByCanvas.delete(runtimeCanvas);
  emitGpuFlowBrowserVisualResourceWorkSnapshots({
    runtimeCanvas,
    snapshots: [],
  });
}

function recordGpuFlowBrowserVisualResourceWork({
  candidateResourceWork,
  nowMs,
  outcome,
  runtimeCanvas,
}: {
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork;
  readonly nowMs: number;
  readonly outcome: GpuFlowBrowserVisualStarvationOutcome;
  readonly runtimeCanvas: HTMLCanvasElement;
}): void {
  const workByKey = getGpuFlowBrowserVisualResourceWorkMap(runtimeCanvas);
  for (const item of candidateResourceWork.workItems) {
    const existing = workByKey.get(item.candidateResourceKey);
    workByKey.set(
      item.candidateResourceKey,
      Object.freeze({
        ...item,
        debtAgeFrames: (existing?.debtAgeFrames ?? item.debtAgeFrames) + 1,
        debtAgeMs: Math.max(0, nowMs - (existing?.firstRequestedAtMs ?? nowMs)),
        firstRequestedAtMs: existing?.firstRequestedAtMs ?? nowMs,
        lastUpdatedAtMs: nowMs,
        outcome,
        readinessState: "requested" as const,
        wakeupSource: "blocked-publication" as const,
      }),
    );
  }
  emitGpuFlowBrowserVisualResourceWorkSnapshots({
    runtimeCanvas,
    snapshots: [...workByKey.values()],
  });
}

export function recordGpuFlowBrowserVisualResourceWorkPreparationState({
  candidateResourceWork,
  nowMs,
  readinessState,
  runtimeCanvas,
  wakeupSource,
}: {
  readonly candidateResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork;
  readonly nowMs: number;
  readonly readinessState: GpuFlowBrowserVisualResourceReadinessState;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly wakeupSource: GpuFlowBrowserVisualResourceWakeupSource;
}): void {
  const workByKey = getGpuFlowBrowserVisualResourceWorkMap(runtimeCanvas);
  for (const item of candidateResourceWork.workItems) {
    const existing = workByKey.get(item.candidateResourceKey);
    if (!existing) {
      continue;
    }
    workByKey.set(
      item.candidateResourceKey,
      Object.freeze({
        ...existing,
        debtAgeMs: Math.max(0, nowMs - existing.firstRequestedAtMs),
        lastUpdatedAtMs: nowMs,
        readinessState,
        wakeupSource,
      }),
    );
  }
  emitGpuFlowBrowserVisualResourceWorkSnapshots({
    runtimeCanvas,
    snapshots: [...workByKey.values()],
  });
}

function getGpuFlowBrowserVisualResourceWorkMap(
  runtimeCanvas: HTMLCanvasElement,
): Map<string, GpuFlowBrowserVisualResourceWorkSnapshot> {
  const existing = browserVisualResourceWorkByCanvas.get(runtimeCanvas);
  if (existing) {
    return existing;
  }
  const workByKey = new Map<string, GpuFlowBrowserVisualResourceWorkSnapshot>();
  browserVisualResourceWorkByCanvas.set(runtimeCanvas, workByKey);
  return workByKey;
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
  const ownerWindow = getGpuFlowRuntimeCanvasWindow(runtimeCanvas);
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

function emitGpuFlowBrowserVisualResourceWorkSnapshots({
  runtimeCanvas,
  snapshots,
}: {
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly snapshots: readonly GpuFlowBrowserVisualResourceWorkSnapshot[];
}): void {
  const ownerWindow = getGpuFlowRuntimeCanvasWindow(runtimeCanvas);
  if (!ownerWindow) {
    return;
  }
  const view = ownerWindow as typeof ownerWindow & {
    __SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__?: GpuFlowBrowserVisualResourceWorkSnapshot[];
  };
  view.__SETTA_GPU_FLOW_BROWSER_VISUAL_RESOURCE_WORK__ = [...snapshots];
  runtimeCanvas.dispatchEvent(
    new CustomEvent("setta-gpu-flow-browser-visual-resource-work", {
      detail: snapshots,
    }),
  );
}

export function recordGpuFlowBlockedVisiblePublication({
  frame,
  publicationCompletion,
  publicationDecision,
  runtimeCanvas,
  stateMachineOutcome = null,
  token,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
  readonly publicationCompletion: GpuFlowVisiblePublicationCompletion;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly stateMachineOutcome?:
    | {
        readonly decidingProof: unknown;
        readonly kind: string;
      }
    | null
    | undefined;
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
    actorManifest: createGpuFlowVisibleFrameActorManifestDiagnostics({
      blockedReasons: token.blockedReasons,
      frame,
      remainingDebt: publicationCompletion.debt,
      visibleOutcome: publicationCompletion.outcome,
    }),
    blockedReasons: token.blockedReasons,
    candidateFrameId: frame?.displayFrameId ?? null,
    frozenFrame: token.frozenFrame,
    frozenFrameId: token.frozenFrameId,
    publicationLane: publicationDecision.lane,
    projectionSampleId: token.projectionSampleId,
    remainingDebt: publicationCompletion.debt,
    schedulerOutcome: publicationCompletion.outcome,
    schedulerState: publicationDecision.schedulerState,
    stateMachineOutcome,
    tokenTransactionId: token.transactionId,
  } satisfies GpuFlowBlockedVisiblePublicationEvent);
  emitGpuFlowBlockedVisiblePublicationEvent({
    event,
    runtimeCanvas,
  });
  postChromeReproEvent("gpu-flow-blocked-visible-publication", {
    actorManifest: event.actorManifest,
    blockedReasons: event.blockedReasons,
    candidateFrameId: event.candidateFrameId,
    frozenFrame: event.frozenFrame,
    frozenFrameId: event.frozenFrameId,
    publicationLane: event.publicationLane,
    projectionSampleId: event.projectionSampleId,
    remainingDebt: event.remainingDebt,
    schedulerOutcome: event.schedulerOutcome,
    schedulerState: event.schedulerState,
    stateMachineOutcome: event.stateMachineOutcome,
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
  const ownerWindow = getGpuFlowRuntimeCanvasWindow(runtimeCanvas);
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

function getGpuFlowRuntimeCanvasWindow(
  runtimeCanvas: HTMLCanvasElement,
): (Window & typeof globalThis) | null {
  return runtimeCanvas.ownerDocument?.defaultView ?? null;
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
