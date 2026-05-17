import type { GpuFlowCommittedSurfaceFrame } from "./committedSurfaceFrame";
import type { GpuCanvasSize, GpuFrameReason } from "./gpuRenderer";
import type { GpuWheelGestureOwner } from "./interactions/wheelOwnership";
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
  readonly retainedScrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly retainedScrollRevision: number;
  readonly timestamp: DOMHighResTimeStamp;
  readonly viewport: GpuViewportInput;
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

export type GpuFlowHeldPreviousProjection = {
  readonly activationMappingId: string;
  readonly canvasDrawStateId: string;
  readonly committedFrameId: number;
  readonly debugStateId: string;
  readonly domTransformBatchId: string;
  readonly heldAtMs: DOMHighResTimeStamp;
  readonly hitProjectionId: string;
  readonly previousTransactionId: GpuFlowProjectionTransactionId;
  readonly projectionSampleId: number;
  readonly reason: string;
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
  return {
    capture({
      canvasSize,
      gestureOwner,
      retainedContentRuntimeState,
      timestamp,
      viewport,
    }) {
      sampleId += 1;
      return freezeLiveProjectionSample({
        cssViewport: {
          height: canvasSize?.cssHeight ?? 0,
          width: canvasSize?.cssWidth ?? 0,
        },
        devicePixelRatio: canvasSize?.devicePixelRatio ?? 1,
        gestureOwner,
        id: sampleId,
        retainedScrollOffsets: getGpuRetainedContentRuntimeScrollOffsets(
          retainedContentRuntimeState,
        ),
        retainedScrollRevision: getGpuRetainedContentRuntimeScrollRevision(
          retainedContentRuntimeState,
        ),
        timestamp,
        viewport,
      });
    },
  };
}

export function createGpuFlowVisiblePublicationScheduler({
  knobs = DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
}: {
  readonly knobs?: GpuFlowProjectionSchedulerKnobs | undefined;
} = {}): GpuFlowVisiblePublicationScheduler {
  let contentDebt = false;
  let maintenanceDebt = false;
  let motionDebt = false;
  let lastMotionAtMs: number | null = null;
  let consecutiveMotionFrames = 0;

  function currentState(
    timestamp: DOMHighResTimeStamp,
    viewportInteractionActive: boolean,
  ): GpuFlowProjectionSchedulerState {
    if (
      contentDebt &&
      consecutiveMotionFrames >=
        knobs.maxConsecutiveMotionFramesBeforeContentProbe
    ) {
      return "content-catchup";
    }
    if (motionDebt || viewportInteractionActive) {
      return "motion-active";
    }
    if (
      lastMotionAtMs !== null &&
      timestamp - lastMotionAtMs <= knobs.motionSettleWindowMs
    ) {
      return "motion-settling";
    }
    if (contentDebt) {
      return "content-catchup";
    }
    if (maintenanceDebt) {
      return "maintenance-drain";
    }
    return "idle";
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
}: {
  readonly contentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
}): GpuFlowVisiblePublicationDecision["lane"] {
  if (motionDebt && hasCommittedContentFrame) {
    return "motion";
  }
  if (contentDebt) {
    return "content";
  }
  if (maintenanceDebt) {
    return "maintenance";
  }
  if (motionDebt) {
    return "content";
  }
  return "idle";
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
): GpuFlowProjectionDebugState {
  return Object.freeze({
    committedFrameId: transaction.committedFrameId,
    lane: transaction.lane,
    projectionSampleId: transaction.sample.id,
    projectionTransactionId: transaction.id,
    transactionKind: transaction.kind,
  });
}

export function applyGpuFlowProjectionDebugAttributes({
  canvas,
  debugState,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly debugState: GpuFlowProjectionDebugState;
}): void {
  setProjectionDebugAttributes(canvas, debugState);
  const root = canvas.ownerDocument.querySelector<HTMLElement>(
    "[data-gpu-flow-dom-control-plane='true']",
  );
  if (root) {
    setProjectionDebugAttributes(root, debugState);
  }
}

export function setProjectionDebugAttributes(
  element: HTMLElement,
  debugState: GpuFlowProjectionDebugState,
): void {
  element.dataset.gpuFlowCommittedFrameId = String(debugState.committedFrameId);
  element.dataset.gpuFlowProjectionLane = debugState.lane;
  element.dataset.gpuFlowProjectionSampleId = String(
    debugState.projectionSampleId,
  );
  element.dataset.gpuFlowProjectionTransactionId =
    debugState.projectionTransactionId;
  element.dataset.gpuFlowProjectionTransactionKind = debugState.transactionKind;
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
    retainedScrollOffsets: new Map(
      [...sample.retainedScrollOffsets.entries()].map(([surfaceId, offset]) => [
        surfaceId,
        Object.freeze({ ...offset }),
      ]),
    ),
    viewport: Object.freeze({
      x: viewport.x,
      y: viewport.y,
      zoom: viewport.zoom,
    }),
  });
}
