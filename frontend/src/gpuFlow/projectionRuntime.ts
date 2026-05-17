import type { GpuFlowCommittedSurfaceFrame } from "./committedSurfaceFrame";
import type { GpuCanvasSize, GpuFrameReason } from "./gpuRenderer";
import type { GpuWheelGestureOwner } from "./interactions/wheelOwnership";
import type {
  GpuFlowHeldPreviousProjection,
  GpuFlowHeldPreviousProjectionDebugState,
} from "./projectionHeldPrevious";
import { createGpuFlowHeldPreviousDebugState } from "./projectionHeldPrevious";
import { createGpuFlowReadonlyMap } from "./projectionReadonlyMap";
import {
  getGpuRetainedContentRuntimeScrollOffsets,
  getGpuRetainedContentRuntimeScrollRevision,
  type GpuRetainedContentRuntimeState,
} from "./retainedContentRuntimeState";
import type { GpuRetainedContentScrollOffsetMap } from "./retainedContentScroll";
import {
  normalizeGpuViewport,
  type GpuRect,
  type GpuViewportInput,
} from "./viewportMath";

export {
  applyGpuFlowProjectionDebugAttributes,
  setProjectionDebugAttributes,
} from "./projectionDebugAttributes";
export { createGpuFlowHeldPreviousProjection } from "./projectionHeldPrevious";
export type {
  GpuFlowHeldPreviousProjection,
  GpuFlowHeldPreviousProjectionDebugState,
} from "./projectionHeldPrevious";

export type GpuFlowProjectionLane = "content" | "maintenance" | "motion";

export type GpuFlowProjectionSchedulerState =
  | "content-catchup"
  | "idle"
  | "maintenance-drain"
  | "motion-active"
  | "motion-settling";

export type GpuFlowProjectionCoverageState =
  | "blocked-awaiting-browser-visual"
  | "blocked-awaiting-live-host"
  | "compatible-previous"
  | "live"
  | "snapshot"
  | "true-hole";

export type GpuFlowProjectionHorizonObligationKind =
  | "active-pinned"
  | "maintenance"
  | "near-future"
  | "visible";

export type GpuFlowProjectionTransactionId = string;

export type GpuFlowLiveProjectionSample = {
  readonly cssViewport: {
    readonly height: number;
    readonly width: number;
  };
  readonly devicePixelRatio: number;
  readonly gestureOwner: GpuWheelGestureOwner;
  readonly id: number;
  readonly retainedScrollDelta: GpuRetainedContentScrollOffsetMap;
  readonly retainedScrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly retainedScrollRevision: number;
  readonly retainedScrollVelocityCssPxPerMs: GpuRetainedContentScrollOffsetMap;
  readonly timestamp: DOMHighResTimeStamp;
  readonly viewport: GpuViewportInput;
  readonly viewportDelta: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  readonly viewportVelocityCssPxPerMs: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
};

export type GpuFlowProjectionHorizonObligation = {
  readonly acceptableCoverage: readonly GpuFlowProjectionCoverageState[];
  readonly actorId: string;
  readonly blockedReason: string | null;
  readonly deadlineMs: number | null;
  readonly kind: GpuFlowProjectionHorizonObligationKind;
  readonly surfaceId: string;
};

export type GpuFlowProjectionHorizonObligationList = {
  readonly activePinned: readonly GpuFlowProjectionHorizonObligation[];
  readonly maintenance: readonly GpuFlowProjectionHorizonObligation[];
  readonly nearFuture: readonly GpuFlowProjectionHorizonObligation[];
  readonly visible: readonly GpuFlowProjectionHorizonObligation[];
};

export type GpuFlowTextControlCompatibilityProof = {
  readonly activationPolicy: string;
  readonly actorId: string;
  readonly clipChainRevision: string;
  readonly controlKind: string;
  readonly displayRevision: string | null;
  readonly focusState: "active" | "composing" | "focused" | "inactive";
  readonly flowRect: GpuRect;
  readonly hitTargetId: string;
  readonly reasonCode:
    | "same-actor-generation"
    | "same-snapshot-cache-key"
    | "same-value-and-geometry";
  readonly retainedScrollCompatible: boolean;
  readonly retainedSurfaceId: string;
  readonly semanticGenerationId: string;
  readonly visualGenerationId: string;
};

export type GpuFlowTextureCompatibilityProof = {
  readonly clipChainRevision: string;
  readonly pageGeneration: string;
  readonly reasonCode:
    | "compatible-retained-scroll-remap"
    | "same-page-generation"
    | "same-source-window";
  readonly retainedScrollCompatible: boolean;
  readonly sourceWindowCompatible: boolean;
  readonly surfaceId: string;
  readonly visualEpoch: string;
  readonly zoomBucketCompatible: boolean;
};

export type GpuFlowCompatibilityProof =
  | {
      readonly actorKind: "retained-page" | "texture";
      readonly proof: GpuFlowTextureCompatibilityProof;
    }
  | {
      readonly actorKind: "text-control";
      readonly proof: GpuFlowTextControlCompatibilityProof;
    };

export type GpuFlowProjectionTransactionKind =
  | "content-publication"
  | "held-previous"
  | "motion-projection";

export type GpuFlowProjectionTransaction = {
  readonly committedFrameId: number;
  readonly id: GpuFlowProjectionTransactionId;
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly lane: GpuFlowProjectionLane;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: GpuFlowLiveProjectionSample;
  readonly startedAtMs: DOMHighResTimeStamp;
};

export type GpuFlowProjectionDebugState = {
  readonly committedFrameId: number;
  readonly lane: GpuFlowProjectionLane;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: GpuFlowProjectionTransactionId;
  readonly transactionKind: GpuFlowProjectionTransactionKind;
} & GpuFlowHeldPreviousProjectionDebugState;

export type GpuFlowVisibleProjectionState = {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly debugState: GpuFlowProjectionDebugState;
  readonly heldPreviousProjection: GpuFlowHeldPreviousProjection | null;
  readonly sample: GpuFlowLiveProjectionSample;
  readonly transaction: GpuFlowProjectionTransaction;
};

export type GpuFlowProjectionSchedulerKnobs = {
  readonly maxConsecutiveMotionFramesBeforeContentProbe: number;
  readonly maxContentInterleaveMs: number;
  readonly maxHeldPreviousFrames: number;
  readonly maxHeldPreviousMs: number;
  readonly maxMaintenanceInterleaveMs: number;
  readonly motionSettleWindowMs: number;
};

export const DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS: GpuFlowProjectionSchedulerKnobs =
  Object.freeze({
    maxConsecutiveMotionFramesBeforeContentProbe: 6,
    maxContentInterleaveMs: 2,
    maxHeldPreviousFrames: 6,
    maxHeldPreviousMs: 120,
    maxMaintenanceInterleaveMs: 1,
    motionSettleWindowMs: 120,
  });

export type GpuFlowVisiblePublicationDecision = {
  readonly debt: {
    readonly content: boolean;
    readonly maintenance: boolean;
    readonly motion: boolean;
  };
  readonly lane: GpuFlowProjectionLane | "idle";
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: GpuFlowLiveProjectionSample;
  readonly schedulerState: GpuFlowProjectionSchedulerState;
};

type GpuFlowVisiblePublicationScheduler = {
  completeFrame(decision: GpuFlowVisiblePublicationDecision): void;
  getKnobs(): GpuFlowProjectionSchedulerKnobs;
  selectFrame(input: {
    readonly hasCommittedContentFrame: boolean;
    readonly rawReasons: readonly GpuFrameReason[];
    readonly sample: GpuFlowLiveProjectionSample;
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewportInteractionActive: boolean;
  }): GpuFlowVisiblePublicationDecision;
};

export function createGpuFlowLiveProjectionSampler(): {
  readonly capture: (input: {
    readonly canvasSize: GpuCanvasSize | null;
    readonly gestureOwner: GpuWheelGestureOwner;
    readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
    readonly timestamp: DOMHighResTimeStamp;
    readonly viewport: GpuViewportInput;
  }) => GpuFlowLiveProjectionSample;
} {
  let sampleId = 0;
  let previousSample: GpuFlowLiveProjectionSample | null = null;
  return {
    capture({
      canvasSize,
      gestureOwner,
      retainedContentRuntimeState,
      timestamp,
      viewport,
    }) {
      sampleId += 1;
      const sample = createFrozenGpuFlowLiveProjectionSample({
        canvasSize,
        gestureOwner,
        previousSample,
        retainedContentRuntimeState,
        sampleId,
        timestamp,
        viewport,
      });
      previousSample = sample;
      return sample;
    },
  };
}

export function createGpuFlowProjectionHorizonObligations({
  committedFrame,
  sample,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowProjectionHorizonObligationList {
  const actorById = new Map(
    committedFrame.actorGenerations.map((actor) => [actor.actorId, actor]),
  );
  return Object.freeze({
    activePinned: createProjectionHorizonObligationsForKind({
      actorById,
      actorIds:
        committedFrame.projectionHorizon.obligations.activePinnedActorIds,
      kind: "active-pinned",
      sample,
    }),
    maintenance: createProjectionHorizonObligationsForKind({
      actorById,
      actorIds:
        committedFrame.projectionHorizon.obligations.maintenanceActorIds,
      kind: "maintenance",
      sample,
    }),
    nearFuture: createProjectionHorizonObligationsForKind({
      actorById,
      actorIds: committedFrame.projectionHorizon.obligations.nearFutureActorIds,
      kind: "near-future",
      sample,
    }),
    visible: createProjectionHorizonObligationsForKind({
      actorById,
      actorIds: committedFrame.projectionHorizon.obligations.visibleActorIds,
      kind: "visible",
      sample,
    }),
  });
}

function createFrozenGpuFlowLiveProjectionSample({
  canvasSize,
  gestureOwner,
  previousSample,
  retainedContentRuntimeState,
  sampleId,
  timestamp,
  viewport,
}: {
  readonly canvasSize: GpuCanvasSize | null;
  readonly gestureOwner: GpuWheelGestureOwner;
  readonly previousSample: GpuFlowLiveProjectionSample | null;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly sampleId: number;
  readonly timestamp: DOMHighResTimeStamp;
  readonly viewport: GpuViewportInput;
}): GpuFlowLiveProjectionSample {
  const retainedScrollOffsets = getGpuRetainedContentRuntimeScrollOffsets(
    retainedContentRuntimeState,
  );
  const viewportSample = normalizeGpuViewport(viewport);
  const deltaMs = getGpuFlowLiveProjectionDeltaMs({
    previousSample,
    timestamp,
  });
  const retainedScrollDelta = createRetainedScrollDelta({
    current: retainedScrollOffsets,
    previous: previousSample?.retainedScrollOffsets,
  });
  const viewportDelta = createViewportDelta({
    current: viewportSample,
    previous: previousSample?.viewport,
  });
  return freezeLiveProjectionSample({
    cssViewport: createGpuFlowLiveProjectionCssViewport(canvasSize),
    devicePixelRatio: canvasSize?.devicePixelRatio ?? 1,
    gestureOwner,
    id: sampleId,
    retainedScrollDelta,
    retainedScrollOffsets,
    retainedScrollRevision: getGpuRetainedContentRuntimeScrollRevision(
      retainedContentRuntimeState,
    ),
    retainedScrollVelocityCssPxPerMs: divideScrollOffsetMap({
      deltaMs,
      offsets: retainedScrollDelta,
    }),
    timestamp,
    viewport: viewportSample,
    viewportDelta,
    viewportVelocityCssPxPerMs: divideViewportDelta({
      delta: viewportDelta,
      deltaMs,
    }),
  });
}

export function createGpuFlowVisiblePublicationScheduler({
  knobs = DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
}: {
  readonly knobs?: GpuFlowProjectionSchedulerKnobs | undefined;
} = {}): GpuFlowVisiblePublicationScheduler {
  const schedulerKnobs = Object.freeze({ ...knobs });
  let contentDebt = false;
  let maintenanceDebt = false;
  let motionDebt = false;
  let lastMotionAtMs: number | null = null;
  let consecutiveMotionFrames = 0;

  function currentState(
    timestamp: DOMHighResTimeStamp,
    viewportInteractionActive: boolean,
  ): GpuFlowProjectionSchedulerState {
    if (shouldProbeGpuFlowProjectionContentDebt()) {
      return "content-catchup";
    }
    if (hasActiveGpuFlowProjectionMotion(viewportInteractionActive)) {
      return "motion-active";
    }
    if (isGpuFlowProjectionMotionSettling(timestamp)) {
      return "motion-settling";
    }
    return selectGpuFlowProjectionNonMotionSchedulerState({
      contentDebt,
      maintenanceDebt,
    });
  }

  function shouldProbeGpuFlowProjectionContentDebt(): boolean {
    return (
      contentDebt &&
      schedulerKnobs.maxContentInterleaveMs > 0 &&
      consecutiveMotionFrames >=
        schedulerKnobs.maxConsecutiveMotionFramesBeforeContentProbe
    );
  }

  function hasActiveGpuFlowProjectionMotion(
    viewportInteractionActive: boolean,
  ): boolean {
    return motionDebt || viewportInteractionActive;
  }

  function isGpuFlowProjectionMotionSettling(
    timestamp: DOMHighResTimeStamp,
  ): boolean {
    return (
      lastMotionAtMs !== null &&
      timestamp - lastMotionAtMs <= schedulerKnobs.motionSettleWindowMs
    );
  }

  return {
    completeFrame(decision) {
      switch (decision.lane) {
        case "motion":
          motionDebt = false;
          lastMotionAtMs = decision.sample.timestamp;
          consecutiveMotionFrames += 1;
          break;
        case "content":
          contentDebt = false;
          consecutiveMotionFrames = 0;
          break;
        case "maintenance":
          maintenanceDebt = false;
          consecutiveMotionFrames = 0;
          break;
        case "idle":
          break;
      }
    },
    getKnobs() {
      return schedulerKnobs;
    },
    selectFrame({
      hasCommittedContentFrame,
      rawReasons,
      sample,
      timestamp,
      viewportInteractionActive,
    }) {
      if (rawReasons.some(isGpuFlowMotionFrameReason)) {
        motionDebt = true;
      }
      if (rawReasons.some(isGpuFlowContentFrameReason)) {
        contentDebt = true;
      }
      if (rawReasons.some(isGpuFlowMaintenanceFrameReason)) {
        maintenanceDebt = true;
      }
      const schedulerState = currentState(timestamp, viewportInteractionActive);
      const lane = selectVisiblePublicationLane({
        contentDebt,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
        schedulerState,
      });
      return Object.freeze({
        debt: Object.freeze({
          content: lane === "content" ? false : contentDebt,
          maintenance: lane === "maintenance" ? false : maintenanceDebt,
          motion: lane === "motion" ? false : motionDebt,
        }),
        lane,
        rawReasons: Object.freeze([...rawReasons]),
        sample,
        schedulerState,
      });
    },
  };
}

function selectVisiblePublicationLane({
  contentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
  schedulerState,
}: {
  readonly contentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly schedulerState: GpuFlowProjectionSchedulerState;
}): GpuFlowVisiblePublicationDecision["lane"] {
  if (
    shouldPublishGpuFlowBootstrapContentFrame({
      hasCommittedContentFrame,
      motionDebt,
    })
  ) {
    return "content";
  }
  switch (schedulerState) {
    case "motion-active":
    case "motion-settling":
      return selectMotionPriorityVisiblePublicationLane({
        contentDebt,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
      });
    case "content-catchup":
      return selectContentCatchupVisiblePublicationLane({
        contentDebt,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
      });
    case "maintenance-drain":
      return selectMaintenanceDrainVisiblePublicationLane({ maintenanceDebt });
    case "idle":
      return "idle";
  }
}

function selectGpuFlowProjectionNonMotionSchedulerState({
  contentDebt,
  maintenanceDebt,
}: {
  readonly contentDebt: boolean;
  readonly maintenanceDebt: boolean;
}): GpuFlowProjectionSchedulerState {
  if (contentDebt) {
    return "content-catchup";
  }
  return maintenanceDebt ? "maintenance-drain" : "idle";
}

function shouldPublishGpuFlowBootstrapContentFrame({
  hasCommittedContentFrame,
  motionDebt,
}: {
  readonly hasCommittedContentFrame: boolean;
  readonly motionDebt: boolean;
}): boolean {
  return motionDebt && !hasCommittedContentFrame;
}

function selectMotionPriorityVisiblePublicationLane({
  contentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
}: {
  readonly contentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
}): GpuFlowVisiblePublicationDecision["lane"] {
  if (motionDebt && hasCommittedContentFrame) {
    return "motion";
  }
  return selectNonMotionVisiblePublicationLane({
    contentDebt,
    maintenanceDebt,
  });
}

function selectContentCatchupVisiblePublicationLane({
  contentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
}: {
  readonly contentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
}): GpuFlowVisiblePublicationDecision["lane"] {
  if (contentDebt) {
    return "content";
  }
  if (motionDebt && hasCommittedContentFrame) {
    return "motion";
  }
  return selectMaintenanceDrainVisiblePublicationLane({ maintenanceDebt });
}

function selectMaintenanceDrainVisiblePublicationLane({
  maintenanceDebt,
}: {
  readonly maintenanceDebt: boolean;
}): GpuFlowVisiblePublicationDecision["lane"] {
  return maintenanceDebt ? "maintenance" : "idle";
}

function selectNonMotionVisiblePublicationLane({
  contentDebt,
  maintenanceDebt,
}: {
  readonly contentDebt: boolean;
  readonly maintenanceDebt: boolean;
}): GpuFlowVisiblePublicationDecision["lane"] {
  if (contentDebt) {
    return "content";
  }
  return maintenanceDebt ? "maintenance" : "idle";
}

export function createGpuFlowProjectionTransaction({
  committedFrame,
  kind,
  lane,
  rawReasons,
  sample,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly lane: GpuFlowProjectionLane;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowProjectionTransaction {
  return createGpuFlowProjectionTransactionForCommittedFrameId({
    committedFrameId: committedFrame.displayFrameId,
    kind,
    lane,
    rawReasons,
    sample,
  });
}

export function createGpuFlowProjectionTransactionForCommittedFrameId({
  committedFrameId,
  kind,
  lane,
  rawReasons,
  sample,
}: {
  readonly committedFrameId: number;
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly lane: GpuFlowProjectionLane;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: GpuFlowLiveProjectionSample;
}): GpuFlowProjectionTransaction {
  return Object.freeze({
    committedFrameId,
    id: createGpuFlowProjectionTransactionId({
      committedFrameId,
      kind,
      sampleId: sample.id,
    }),
    kind,
    lane,
    rawReasons: Object.freeze([...rawReasons]),
    sample,
    startedAtMs: sample.timestamp,
  });
}

export function createGpuFlowProjectionDebugState(
  transaction: GpuFlowProjectionTransaction,
  heldPreviousProjection?: GpuFlowHeldPreviousProjection | null,
): GpuFlowProjectionDebugState {
  const heldPreviousDebugState = createGpuFlowHeldPreviousDebugState({
    heldPreviousProjection,
    transactionKind: transaction.kind,
  });
  return Object.freeze({
    committedFrameId: transaction.committedFrameId,
    ...heldPreviousDebugState,
    lane: transaction.lane,
    projectionSampleId: transaction.sample.id,
    projectionTransactionId: transaction.id,
    transactionKind: transaction.kind,
  });
}

export function createGpuFlowVisibleProjectionState({
  committedFrame,
  heldPreviousProjection = null,
  transaction,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly heldPreviousProjection?: GpuFlowHeldPreviousProjection | null;
  readonly transaction: GpuFlowProjectionTransaction;
}): GpuFlowVisibleProjectionState {
  const visibleHeldPreviousProjection =
    transaction.kind === "held-previous" ? heldPreviousProjection : null;
  return Object.freeze({
    committedFrame,
    debugState: createGpuFlowProjectionDebugState(
      transaction,
      visibleHeldPreviousProjection,
    ),
    heldPreviousProjection: visibleHeldPreviousProjection,
    sample: transaction.sample,
    transaction,
  });
}

export function hasGpuFlowVisiblePublicationDebt(
  decision: GpuFlowVisiblePublicationDecision,
): boolean {
  return (
    decision.debt.content || decision.debt.maintenance || decision.debt.motion
  );
}

export function getGpuFlowVisiblePublicationDebtReason(
  decision: GpuFlowVisiblePublicationDecision,
): GpuFrameReason {
  if (decision.debt.motion) {
    return "retained-scroll";
  }
  if (decision.debt.content) {
    return "manual";
  }
  return "texture-upload";
}

export function isGpuFlowMotionFrameReason(reason: GpuFrameReason): boolean {
  return reason === "retained-scroll" || reason === "viewport";
}

export function isGpuFlowContentFrameReason(reason: GpuFrameReason): boolean {
  return (
    reason === "animation" ||
    reason === "init" ||
    reason === "manual" ||
    reason === "paint" ||
    reason === "resize"
  );
}

export function isGpuFlowMaintenanceFrameReason(
  reason: GpuFrameReason,
): boolean {
  return reason === "texture-upload";
}

function createProjectionHorizonObligationsForKind({
  actorById,
  actorIds,
  kind,
  sample,
}: {
  readonly actorById: ReadonlyMap<
    string,
    GpuFlowCommittedSurfaceFrame["actorGenerations"][number]
  >;
  readonly actorIds: readonly string[];
  readonly kind: GpuFlowProjectionHorizonObligationKind;
  readonly sample: GpuFlowLiveProjectionSample;
}): readonly GpuFlowProjectionHorizonObligation[] {
  return Object.freeze(
    actorIds.map((actorId) => {
      const actor = actorById.get(actorId);
      return Object.freeze({
        acceptableCoverage: actor
          ? getProjectionHorizonAcceptableCoverage(actor)
          : (["true-hole"] as const),
        actorId,
        blockedReason: actor
          ? getProjectionHorizonBlockedReason({ actor })
          : "actor-missing-from-committed-frame",
        deadlineMs: getProjectionHorizonDeadline({ kind, sample }),
        kind,
        surfaceId: actor?.ownerSurfaceId ?? "unknown",
      });
    }),
  );
}

function getProjectionHorizonAcceptableCoverage(
  actor: GpuFlowCommittedSurfaceFrame["actorGenerations"][number],
): readonly GpuFlowProjectionCoverageState[] {
  switch (actor.textCoverageProof?.projectionCoverage) {
    case "blocked-awaiting-browser-visual":
      return ["blocked-awaiting-browser-visual"];
    case "blocked-awaiting-live-host":
      return ["blocked-awaiting-live-host"];
    case "compatible-previous":
      return ["compatible-previous"];
    case "exact-live-dom":
      return ["live"];
    case "exact-snapshot":
      return ["snapshot"];
    case "true-hole":
      return ["true-hole"];
    case undefined:
      return getNonTextProjectionHorizonCoverage(actor);
  }
}

function getNonTextProjectionHorizonCoverage(
  actor: GpuFlowCommittedSurfaceFrame["actorGenerations"][number],
): readonly GpuFlowProjectionCoverageState[] {
  if (
    actor.projectionReadiness !== "ready" &&
    actor.projectionReadiness !== "not-required"
  ) {
    return ["blocked-awaiting-browser-visual"];
  }
  switch (actor.kind) {
    case "html-texture":
    case "retained-page":
      return ["snapshot", "compatible-previous"];
    case "dom-control":
    case "dom-island":
    case "gpu-native-visual":
      return ["live"];
  }
}

function getProjectionHorizonBlockedReason({
  actor,
}: {
  readonly actor: GpuFlowCommittedSurfaceFrame["actorGenerations"][number];
}): string | null {
  const proof = actor.textCoverageProof;
  const coverage = proof?.projectionCoverage;
  switch (coverage) {
    case "blocked-awaiting-browser-visual":
    case "blocked-awaiting-live-host":
    case "true-hole":
      return proof?.readinessReason ?? null;
    default:
      return null;
  }
}

function getProjectionHorizonDeadline({
  kind,
  sample,
}: {
  readonly kind: GpuFlowProjectionHorizonObligationKind;
  readonly sample: GpuFlowLiveProjectionSample;
}): number | null {
  switch (kind) {
    case "active-pinned":
    case "visible":
      return sample.timestamp;
    case "near-future":
      return (
        sample.timestamp +
        DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS.motionSettleWindowMs
      );
    case "maintenance":
      return null;
  }
}

function createRetainedScrollDelta({
  current,
  previous,
}: {
  readonly current: GpuRetainedContentScrollOffsetMap;
  readonly previous: GpuRetainedContentScrollOffsetMap | undefined;
}): GpuRetainedContentScrollOffsetMap {
  if (!previous) {
    return new Map(
      [...current.keys()].map((surfaceId) => [surfaceId, { x: 0, y: 0 }]),
    );
  }
  return new Map(
    [...current.entries()].map(([surfaceId, offset]) => {
      const previousOffset = previous.get(surfaceId) ?? { x: 0, y: 0 };
      return [
        surfaceId,
        {
          x: offset.x - previousOffset.x,
          y: offset.y - previousOffset.y,
        },
      ];
    }),
  );
}

function createGpuFlowLiveProjectionCssViewport(
  canvasSize: GpuCanvasSize | null,
): GpuFlowLiveProjectionSample["cssViewport"] {
  return {
    height: canvasSize?.cssHeight ?? 0,
    width: canvasSize?.cssWidth ?? 0,
  };
}

function getGpuFlowLiveProjectionDeltaMs({
  previousSample,
  timestamp,
}: {
  readonly previousSample: GpuFlowLiveProjectionSample | null;
  readonly timestamp: DOMHighResTimeStamp;
}): number {
  return previousSample ? Math.max(0, timestamp - previousSample.timestamp) : 0;
}

function divideScrollOffsetMap({
  deltaMs,
  offsets,
}: {
  readonly deltaMs: number;
  readonly offsets: GpuRetainedContentScrollOffsetMap;
}): GpuRetainedContentScrollOffsetMap {
  if (deltaMs <= 0) {
    return new Map(
      [...offsets.keys()].map((surfaceId) => [surfaceId, { x: 0, y: 0 }]),
    );
  }
  return new Map(
    [...offsets.entries()].map(([surfaceId, offset]) => [
      surfaceId,
      {
        x: offset.x / deltaMs,
        y: offset.y / deltaMs,
      },
    ]),
  );
}

function createViewportDelta({
  current,
  previous,
}: {
  readonly current: ReturnType<typeof normalizeGpuViewport>;
  readonly previous: GpuViewportInput | undefined;
}): GpuFlowLiveProjectionSample["viewportDelta"] {
  const previousViewport = normalizeGpuViewport(previous ?? current);
  return {
    x: current.x - previousViewport.x,
    y: current.y - previousViewport.y,
    zoom: current.zoom - previousViewport.zoom,
  };
}

function divideViewportDelta({
  delta,
  deltaMs,
}: {
  readonly delta: GpuFlowLiveProjectionSample["viewportDelta"];
  readonly deltaMs: number;
}): GpuFlowLiveProjectionSample["viewportVelocityCssPxPerMs"] {
  if (deltaMs <= 0) {
    return { x: 0, y: 0, zoom: 0 };
  }
  return {
    x: delta.x / deltaMs,
    y: delta.y / deltaMs,
    zoom: delta.zoom / deltaMs,
  };
}

function createGpuFlowProjectionTransactionId({
  committedFrameId,
  kind,
  sampleId,
}: {
  readonly committedFrameId: number;
  readonly kind: GpuFlowProjectionTransactionKind;
  readonly sampleId: number;
}): GpuFlowProjectionTransactionId {
  return `${kind}:content-${committedFrameId}:sample-${sampleId}`;
}

function freezeLiveProjectionSample(
  sample: GpuFlowLiveProjectionSample,
): GpuFlowLiveProjectionSample {
  const viewport = normalizeGpuViewport(sample.viewport);
  return Object.freeze({
    ...sample,
    cssViewport: Object.freeze({ ...sample.cssViewport }),
    retainedScrollDelta: freezeGpuFlowProjectionScrollOffsetMap(
      sample.retainedScrollDelta,
    ),
    retainedScrollOffsets: freezeGpuFlowProjectionScrollOffsetMap(
      sample.retainedScrollOffsets,
    ),
    retainedScrollVelocityCssPxPerMs: freezeGpuFlowProjectionScrollOffsetMap(
      sample.retainedScrollVelocityCssPxPerMs,
    ),
    viewport: Object.freeze({
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
    }),
    viewportDelta: Object.freeze({ ...sample.viewportDelta }),
    viewportVelocityCssPxPerMs: Object.freeze({
      ...sample.viewportVelocityCssPxPerMs,
    }),
  });
}

function freezeGpuFlowProjectionScrollOffsetMap(
  offsets: GpuRetainedContentScrollOffsetMap,
): GpuRetainedContentScrollOffsetMap {
  return createGpuFlowReadonlyMap(
    [...offsets.entries()].map(([surfaceId, offset]) => [
      surfaceId,
      Object.freeze({ ...offset }),
    ]),
  );
}
