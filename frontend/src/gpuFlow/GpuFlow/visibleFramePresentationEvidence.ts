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

export type GpuFlowVisiblePublicationPresentationEvidence = {
  readonly canvasGenerationEvidence: GpuFlowVisiblePublicationCanvasPresentationEvidence;
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
