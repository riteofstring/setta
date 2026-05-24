import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { GpuFlowNodeLayerFrameStatePublication } from "./flowFrameLifecycle";
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFrameContentPlan";
import type { GpuFlowVisibleFrameReducerDecision } from "./visibleFrameReducerRuntime";

export type GpuFlowVisibleFramePresentationCanvasPresentationEvidence = {
  readonly drawnNodeIds: readonly string[];
  readonly committedFrameId: number;
  readonly exposable: true;
  readonly missingTextureNodeIds: readonly string[];
  readonly prepared: true;
  readonly presentationBatchId: string;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
  readonly source: "deferred-canvas-submission";
};

export type GpuFlowVisibleFramePresentationDomTransformPresentationEvidence = {
  readonly committedFrameId: number;
  readonly prepared: true;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
  readonly source: "deferred-dom-transform-submission";
};

export type GpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence =
  {
    readonly committedFrameId: number;
    readonly prepared: true;
    readonly projectionSampleId: number;
    readonly projectionTransactionId: string;
    readonly source: "deferred-texture-eviction-submission";
  };

export type GpuFlowVisibleFramePresentationEvidence = {
  readonly canvasGenerationEvidence: GpuFlowVisibleFramePresentationCanvasPresentationEvidence;
  readonly domTransformEvidence: GpuFlowVisibleFramePresentationDomTransformPresentationEvidence | null;
  readonly textureEvictionEvidence: GpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence | null;
};

export function createGpuFlowVisibleFramePresentationEvidence({
  nodeLayerFrameStatePublication,
  visibleProjectionState,
}: {
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowVisibleFramePresentationEvidence | null {
  if (
    nodeLayerFrameStatePublication?.layerResult.canvasSubmission === null ||
    nodeLayerFrameStatePublication?.layerResult.canvasSubmission === undefined
  ) {
    return null;
  }
  const domTransformSubmission =
    nodeLayerFrameStatePublication.layerResult.domTransformSubmission ?? null;
  const textureEvictionSubmission =
    nodeLayerFrameStatePublication.layerResult.textureEvictionSubmission ??
    null;
  return Object.freeze({
    canvasGenerationEvidence:
      createGpuFlowVisibleFramePresentationCanvasPresentationEvidence({
        committedFrame: visibleProjectionState.committedFrame,
        drawnNodeIds: nodeLayerFrameStatePublication.layerResult.drawnNodeIds,
        missingTextureNodeIds:
          nodeLayerFrameStatePublication.layerResult.missingTextureNodeIds,
        projectionSampleId: visibleProjectionState.sample.id,
        projectionTransactionId: visibleProjectionState.transaction.id,
      }),
    domTransformEvidence: domTransformSubmission
      ? createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence({
          committedFrame: visibleProjectionState.committedFrame,
          projectionSampleId: visibleProjectionState.sample.id,
          projectionTransactionId: visibleProjectionState.transaction.id,
        })
      : null,
    textureEvictionEvidence: textureEvictionSubmission
      ? createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence(
          {
            committedFrame: visibleProjectionState.committedFrame,
            projectionSampleId: visibleProjectionState.sample.id,
            projectionTransactionId: visibleProjectionState.transaction.id,
          },
        )
      : null,
  });
}

export function createGpuFlowVisibleFramePresentationCanvasPresentationEvidence({
  committedFrame,
  drawnNodeIds = [],
  missingTextureNodeIds = [],
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly committedFrame: GpuFlowPreparedContentFrame;
  readonly drawnNodeIds?: readonly string[] | undefined;
  readonly missingTextureNodeIds?: readonly string[] | undefined;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
}): GpuFlowVisibleFramePresentationCanvasPresentationEvidence {
  return Object.freeze({
    committedFrameId: committedFrame.displayFrameId,
    drawnNodeIds: Object.freeze([...drawnNodeIds]),
    exposable: true as const,
    missingTextureNodeIds: Object.freeze([...missingTextureNodeIds]),
    prepared: true as const,
    presentationBatchId: committedFrame.presentationProof.batchId,
    projectionSampleId,
    projectionTransactionId,
    source: "deferred-canvas-submission" as const,
  });
}

export function createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence({
  committedFrame,
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly committedFrame: GpuFlowPreparedContentFrame;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
}): GpuFlowVisibleFramePresentationDomTransformPresentationEvidence {
  return Object.freeze({
    committedFrameId: committedFrame.displayFrameId,
    prepared: true as const,
    projectionSampleId,
    projectionTransactionId,
    source: "deferred-dom-transform-submission" as const,
  });
}

export function createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence({
  committedFrame,
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly committedFrame: GpuFlowPreparedContentFrame;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
}): GpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence {
  return Object.freeze({
    committedFrameId: committedFrame.displayFrameId,
    prepared: true as const,
    projectionSampleId,
    projectionTransactionId,
    source: "deferred-texture-eviction-submission" as const,
  });
}

export function createGpuFlowVisibleFramePresentationBlockedReasons({
  presentationEvidence,
  reducerDecision,
  visibleProjectionState,
}: {
  readonly presentationEvidence: GpuFlowVisibleFramePresentationEvidence | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): readonly GpuFlowVisibleFrameBlockedPublicationCandidate["blockedReasons"][number][] {
  const committedFrame = visibleProjectionState.committedFrame;
  return Object.freeze([
    ...createGpuFlowVisibleFramePresentationDomPresentationBlockedReasons({
      committedFrame,
      domEvidence: committedFrame.presentationProof.domGenerationEvidence,
    }),
    ...createGpuFlowVisibleFramePresentationDomTransformPresentationBlockedReasons(
      {
        committedFrame,
        domTransformEvidence:
          presentationEvidence?.domTransformEvidence ?? null,
        reducerDecision,
        visibleProjectionState,
      },
    ),
    ...createGpuFlowVisibleFramePresentationTextureEvictionPresentationBlockedReasons(
      {
        committedFrame,
        reducerDecision,
        textureEvictionEvidence:
          presentationEvidence?.textureEvictionEvidence ?? null,
        visibleProjectionState,
      },
    ),
    ...createGpuFlowVisibleFramePresentationCanvasPresentationBlockedReasons({
      canvasEvidence: presentationEvidence?.canvasGenerationEvidence ?? null,
      committedFrame,
      reducerDecision,
      visibleProjectionState,
    }),
  ]);
}

type GpuFlowVisibleFramePresentationBlockedReason =
  GpuFlowVisibleFrameBlockedPublicationCandidate["blockedReasons"][number];

function createGpuFlowVisibleFramePresentationDomPresentationBlockedReasons({
  committedFrame,
  domEvidence,
}: {
  readonly committedFrame: GpuFlowPreparedContentFrame;
  readonly domEvidence: GpuFlowPreparedContentFrame["presentationProof"]["domGenerationEvidence"];
}): readonly GpuFlowVisibleFramePresentationBlockedReason[] {
  const reasons: GpuFlowVisibleFramePresentationBlockedReason[] = [];
  if (!domEvidence.staged) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-generation-not-staged",
    });
  }
  if (!domEvidence.exposable) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-generation-not-exposable",
    });
  }
  if (domEvidence.preparedFrameId !== committedFrame.displayFrameId) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-generation-frame-mismatch",
    });
  }
  return Object.freeze(reasons);
}

function createGpuFlowVisibleFramePresentationDomTransformPresentationBlockedReasons({
  committedFrame,
  domTransformEvidence,
  reducerDecision,
  visibleProjectionState,
}: {
  readonly committedFrame: GpuFlowPreparedContentFrame;
  readonly domTransformEvidence: GpuFlowVisibleFramePresentationDomTransformPresentationEvidence | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): readonly GpuFlowVisibleFramePresentationBlockedReason[] {
  const reasons: GpuFlowVisibleFramePresentationBlockedReason[] = [];
  if (!domTransformEvidence) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-transform-not-prepared",
    });
    return Object.freeze(reasons);
  }
  if (domTransformEvidence.committedFrameId !== committedFrame.displayFrameId) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-transform-frame-mismatch",
    });
  }
  if (domTransformEvidence.projectionSampleId !== reducerDecision.sample.id) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-transform-sample-mismatch",
    });
  }
  if (
    domTransformEvidence.projectionTransactionId !==
    visibleProjectionState.transaction.id
  ) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-transform-transaction-mismatch",
    });
  }
  return Object.freeze(reasons);
}

function createGpuFlowVisibleFramePresentationTextureEvictionPresentationBlockedReasons({
  committedFrame,
  reducerDecision,
  textureEvictionEvidence,
  visibleProjectionState,
}: {
  readonly committedFrame: GpuFlowPreparedContentFrame;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly textureEvictionEvidence: GpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): readonly GpuFlowVisibleFramePresentationBlockedReason[] {
  const reasons: GpuFlowVisibleFramePresentationBlockedReason[] = [];
  if (visibleProjectionState.transaction.kind === "motion-projection") {
    if (textureEvictionEvidence !== null) {
      reasons.push({
        actorId: null,
        family: "presentation-pair",
        reason: "texture-eviction-unexpected-for-motion",
      });
    }
    return Object.freeze(reasons);
  }
  if (!textureEvictionEvidence) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "texture-eviction-not-prepared",
    });
    return Object.freeze(reasons);
  }
  if (
    textureEvictionEvidence.committedFrameId !== committedFrame.displayFrameId
  ) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "texture-eviction-frame-mismatch",
    });
  }
  if (
    textureEvictionEvidence.projectionSampleId !== reducerDecision.sample.id
  ) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "texture-eviction-sample-mismatch",
    });
  }
  if (
    textureEvictionEvidence.projectionTransactionId !==
    visibleProjectionState.transaction.id
  ) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "texture-eviction-transaction-mismatch",
    });
  }
  return Object.freeze(reasons);
}

function createGpuFlowVisibleFramePresentationCanvasPresentationBlockedReasons({
  canvasEvidence,
  committedFrame,
  reducerDecision,
  visibleProjectionState,
}: {
  readonly canvasEvidence: GpuFlowVisibleFramePresentationCanvasPresentationEvidence | null;
  readonly committedFrame: GpuFlowPreparedContentFrame;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): readonly GpuFlowVisibleFramePresentationBlockedReason[] {
  const reasons: GpuFlowVisibleFramePresentationBlockedReason[] = [];
  if (!canvasEvidence) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "canvas-generation-not-prepared",
    });
    return Object.freeze(reasons);
  }
  if (canvasEvidence.committedFrameId !== committedFrame.displayFrameId) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "canvas-generation-frame-mismatch",
    });
  }
  if (canvasEvidence.projectionSampleId !== reducerDecision.sample.id) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "canvas-generation-sample-mismatch",
    });
  }
  if (
    canvasEvidence.projectionTransactionId !==
    visibleProjectionState.transaction.id
  ) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "canvas-generation-transaction-mismatch",
    });
  }
  if (
    canvasEvidence.presentationBatchId !==
    committedFrame.presentationProof.batchId
  ) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "canvas-generation-batch-mismatch",
    });
  }
  reasons.push(
    ...createGpuFlowVisibleFramePresentationSectionPresentationBlockedReasons({
      canvasEvidence,
      committedFrame,
    }),
  );
  return Object.freeze(reasons);
}

function createGpuFlowVisibleFramePresentationSectionPresentationBlockedReasons({
  canvasEvidence,
  committedFrame,
}: {
  readonly canvasEvidence: GpuFlowVisibleFramePresentationCanvasPresentationEvidence;
  readonly committedFrame: GpuFlowPreparedContentFrame;
}): readonly GpuFlowVisibleFramePresentationBlockedReason[] {
  const drawnNodeIds = new Set(canvasEvidence.drawnNodeIds);
  const missingTextureNodeIds = new Set(canvasEvidence.missingTextureNodeIds);
  return Object.freeze(
    committedFrame.actorGenerations
      .filter(isGpuFlowVisibleFramePresentationSectionActor)
      .filter((actor) => actor.visibleNonempty)
      .flatMap((actor) => {
        if (missingTextureNodeIds.has(actor.ownerSurfaceId)) {
          return [
            {
              actorId: actor.actorId,
              family: actor.actorFamily,
              reason: "section-surface-texture-missing",
            },
          ];
        }
        if (!drawnNodeIds.has(actor.ownerSurfaceId)) {
          return [
            {
              actorId: actor.actorId,
              family: actor.actorFamily,
              reason: "section-surface-not-drawn",
            },
          ];
        }
        return [];
      }),
  );
}

function isGpuFlowVisibleFramePresentationSectionActor(
  actor: GpuFlowPreparedContentFrame["actorGenerations"][number],
): boolean {
  return (
    actor.actorFamily === "section-body-clip" ||
    actor.actorFamily === "section-header" ||
    actor.actorFamily === "section-shell"
  );
}
