import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { GpuFlowNodeLayerFrameStatePublication } from "./flowFrameLifecycle";
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFrameContentPlan";
import type { GpuFlowVisiblePublicationDecision } from "./visibleFrameScheduling";

export type GpuFlowVisiblePublicationCanvasPresentationEvidence = {
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

export type GpuFlowVisiblePublicationDomTransformPresentationEvidence = {
  readonly committedFrameId: number;
  readonly prepared: true;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
  readonly source: "deferred-dom-transform-submission";
};

export type GpuFlowVisiblePublicationTextureEvictionPresentationEvidence = {
  readonly committedFrameId: number;
  readonly prepared: true;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
  readonly source: "deferred-texture-eviction-submission";
};

export type GpuFlowVisiblePublicationPresentationEvidence = {
  readonly canvasGenerationEvidence: GpuFlowVisiblePublicationCanvasPresentationEvidence;
  readonly domTransformEvidence: GpuFlowVisiblePublicationDomTransformPresentationEvidence | null;
  readonly textureEvictionEvidence: GpuFlowVisiblePublicationTextureEvictionPresentationEvidence | null;
};

export function createGpuFlowVisiblePublicationPresentationEvidence({
  nodeLayerFrameStatePublication,
  visibleProjectionState,
}: {
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowVisiblePublicationPresentationEvidence | null {
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
      createGpuFlowVisiblePublicationCanvasPresentationEvidence({
        committedFrame: visibleProjectionState.committedFrame,
        drawnNodeIds: nodeLayerFrameStatePublication.layerResult.drawnNodeIds,
        missingTextureNodeIds:
          nodeLayerFrameStatePublication.layerResult.missingTextureNodeIds,
        projectionSampleId: visibleProjectionState.sample.id,
        projectionTransactionId: visibleProjectionState.transaction.id,
      }),
    domTransformEvidence: domTransformSubmission
      ? createGpuFlowVisiblePublicationDomTransformPresentationEvidence({
          committedFrame: visibleProjectionState.committedFrame,
          projectionSampleId: visibleProjectionState.sample.id,
          projectionTransactionId: visibleProjectionState.transaction.id,
        })
      : null,
    textureEvictionEvidence: textureEvictionSubmission
      ? createGpuFlowVisiblePublicationTextureEvictionPresentationEvidence({
          committedFrame: visibleProjectionState.committedFrame,
          projectionSampleId: visibleProjectionState.sample.id,
          projectionTransactionId: visibleProjectionState.transaction.id,
        })
      : null,
  });
}

export function createGpuFlowVisiblePublicationCanvasPresentationEvidence({
  committedFrame,
  drawnNodeIds = [],
  missingTextureNodeIds = [],
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly drawnNodeIds?: readonly string[] | undefined;
  readonly missingTextureNodeIds?: readonly string[] | undefined;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
}): GpuFlowVisiblePublicationCanvasPresentationEvidence {
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

export function createGpuFlowVisiblePublicationDomTransformPresentationEvidence({
  committedFrame,
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
}): GpuFlowVisiblePublicationDomTransformPresentationEvidence {
  return Object.freeze({
    committedFrameId: committedFrame.displayFrameId,
    prepared: true as const,
    projectionSampleId,
    projectionTransactionId,
    source: "deferred-dom-transform-submission" as const,
  });
}

export function createGpuFlowVisiblePublicationTextureEvictionPresentationEvidence({
  committedFrame,
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
}): GpuFlowVisiblePublicationTextureEvictionPresentationEvidence {
  return Object.freeze({
    committedFrameId: committedFrame.displayFrameId,
    prepared: true as const,
    projectionSampleId,
    projectionTransactionId,
    source: "deferred-texture-eviction-submission" as const,
  });
}

export function createGpuFlowVisiblePublicationPresentationBlockedReasons({
  presentationEvidence,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): readonly GpuFlowVisibleFrameBlockedPublicationCandidate["blockedReasons"][number][] {
  const committedFrame = visibleProjectionState.committedFrame;
  return Object.freeze([
    ...createGpuFlowVisiblePublicationDomPresentationBlockedReasons({
      committedFrame,
      domEvidence: committedFrame.presentationProof.domGenerationEvidence,
    }),
    ...createGpuFlowVisiblePublicationDomTransformPresentationBlockedReasons({
      committedFrame,
      domTransformEvidence: presentationEvidence?.domTransformEvidence ?? null,
      publicationDecision,
      visibleProjectionState,
    }),
    ...createGpuFlowVisiblePublicationTextureEvictionPresentationBlockedReasons(
      {
        committedFrame,
        publicationDecision,
        textureEvictionEvidence:
          presentationEvidence?.textureEvictionEvidence ?? null,
        visibleProjectionState,
      },
    ),
    ...createGpuFlowVisiblePublicationCanvasPresentationBlockedReasons({
      canvasEvidence: presentationEvidence?.canvasGenerationEvidence ?? null,
      committedFrame,
      publicationDecision,
      visibleProjectionState,
    }),
  ]);
}

type GpuFlowVisiblePublicationPresentationBlockedReason =
  GpuFlowVisibleFrameBlockedPublicationCandidate["blockedReasons"][number];

function createGpuFlowVisiblePublicationDomPresentationBlockedReasons({
  committedFrame,
  domEvidence,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly domEvidence: GpuFlowCommittedSurfaceFrame["presentationProof"]["domGenerationEvidence"];
}): readonly GpuFlowVisiblePublicationPresentationBlockedReason[] {
  const reasons: GpuFlowVisiblePublicationPresentationBlockedReason[] = [];
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
  if (domEvidence.committedFrameId !== committedFrame.displayFrameId) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-generation-frame-mismatch",
    });
  }
  return Object.freeze(reasons);
}

function createGpuFlowVisiblePublicationDomTransformPresentationBlockedReasons({
  committedFrame,
  domTransformEvidence,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly domTransformEvidence: GpuFlowVisiblePublicationDomTransformPresentationEvidence | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): readonly GpuFlowVisiblePublicationPresentationBlockedReason[] {
  const reasons: GpuFlowVisiblePublicationPresentationBlockedReason[] = [];
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
  if (domTransformEvidence.projectionSampleId !== publicationDecision.sample.id) {
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

function createGpuFlowVisiblePublicationTextureEvictionPresentationBlockedReasons({
  committedFrame,
  publicationDecision,
  textureEvictionEvidence,
  visibleProjectionState,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly textureEvictionEvidence: GpuFlowVisiblePublicationTextureEvictionPresentationEvidence | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): readonly GpuFlowVisiblePublicationPresentationBlockedReason[] {
  const reasons: GpuFlowVisiblePublicationPresentationBlockedReason[] = [];
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
  if (textureEvictionEvidence.committedFrameId !== committedFrame.displayFrameId) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "texture-eviction-frame-mismatch",
    });
  }
  if (
    textureEvictionEvidence.projectionSampleId !== publicationDecision.sample.id
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

function createGpuFlowVisiblePublicationCanvasPresentationBlockedReasons({
  canvasEvidence,
  committedFrame,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly canvasEvidence: GpuFlowVisiblePublicationCanvasPresentationEvidence | null;
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): readonly GpuFlowVisiblePublicationPresentationBlockedReason[] {
  const reasons: GpuFlowVisiblePublicationPresentationBlockedReason[] = [];
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
  if (canvasEvidence.projectionSampleId !== publicationDecision.sample.id) {
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
    ...createGpuFlowVisiblePublicationSectionPresentationBlockedReasons({
      canvasEvidence,
      committedFrame,
    }),
  );
  return Object.freeze(reasons);
}

function createGpuFlowVisiblePublicationSectionPresentationBlockedReasons({
  canvasEvidence,
  committedFrame,
}: {
  readonly canvasEvidence: GpuFlowVisiblePublicationCanvasPresentationEvidence;
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
}): readonly GpuFlowVisiblePublicationPresentationBlockedReason[] {
  const drawnNodeIds = new Set(canvasEvidence.drawnNodeIds);
  const missingTextureNodeIds = new Set(canvasEvidence.missingTextureNodeIds);
  return Object.freeze(
    committedFrame.actorGenerations
      .filter(isGpuFlowVisiblePublicationSectionActor)
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

function isGpuFlowVisiblePublicationSectionActor(
  actor: GpuFlowCommittedSurfaceFrame["actorGenerations"][number],
): boolean {
  return (
    actor.actorFamily === "section-body-clip" ||
    actor.actorFamily === "section-header" ||
    actor.actorFamily === "section-shell"
  );
}
