import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { GpuFlowNodeLayerFrameStatePublication } from "./flowFrameLifecycle";
import type { GpuFlowVisibleFrameBlockedPresentationCandidate } from "./visibleFrameContentPlan";
import type { GpuFlowVisibleFrameReducerDecision } from "./visibleFrameReducerRuntime";

export type GpuFlowVisibleFramePresentationCanvasPresentationEvidence = {
  readonly drawnNodeIds: readonly string[];
  readonly preparedContentFrameId: number;
  readonly exposable: true;
  readonly missingTextureNodeIds: readonly string[];
  readonly prepared: true;
  readonly presentationBatchId: string;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
  readonly source: "deferred-canvas-submission";
};

export type GpuFlowVisibleFramePresentationDomTransformPresentationEvidence = {
  readonly preparedContentFrameId: number;
  readonly prepared: true;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
  readonly source: "deferred-dom-transform-submission";
};

export type GpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence =
  {
    readonly preparedContentFrameId: number;
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
        preparedContentFrame: visibleProjectionState.preparedContentFrame,
        drawnNodeIds: nodeLayerFrameStatePublication.layerResult.drawnNodeIds,
        missingTextureNodeIds:
          nodeLayerFrameStatePublication.layerResult.missingTextureNodeIds,
        projectionSampleId: visibleProjectionState.sample.id,
        projectionTransactionId: visibleProjectionState.transaction.id,
      }),
    domTransformEvidence: domTransformSubmission
      ? createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence({
          preparedContentFrame: visibleProjectionState.preparedContentFrame,
          projectionSampleId: visibleProjectionState.sample.id,
          projectionTransactionId: visibleProjectionState.transaction.id,
        })
      : null,
    textureEvictionEvidence: textureEvictionSubmission
      ? createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence(
          {
            preparedContentFrame: visibleProjectionState.preparedContentFrame,
            projectionSampleId: visibleProjectionState.sample.id,
            projectionTransactionId: visibleProjectionState.transaction.id,
          },
        )
      : null,
  });
}

export function createGpuFlowVisibleFramePresentationCanvasPresentationEvidence({
  preparedContentFrame,
  drawnNodeIds = [],
  missingTextureNodeIds = [],
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly drawnNodeIds?: readonly string[] | undefined;
  readonly missingTextureNodeIds?: readonly string[] | undefined;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
}): GpuFlowVisibleFramePresentationCanvasPresentationEvidence {
  return Object.freeze({
    preparedContentFrameId: preparedContentFrame.displayFrameId,
    drawnNodeIds: Object.freeze([...drawnNodeIds]),
    exposable: true as const,
    missingTextureNodeIds: Object.freeze([...missingTextureNodeIds]),
    prepared: true as const,
    presentationBatchId: preparedContentFrame.presentationProof.batchId,
    projectionSampleId,
    projectionTransactionId,
    source: "deferred-canvas-submission" as const,
  });
}

export function createGpuFlowVisibleFramePresentationDomTransformPresentationEvidence({
  preparedContentFrame,
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
}): GpuFlowVisibleFramePresentationDomTransformPresentationEvidence {
  return Object.freeze({
    preparedContentFrameId: preparedContentFrame.displayFrameId,
    prepared: true as const,
    projectionSampleId,
    projectionTransactionId,
    source: "deferred-dom-transform-submission" as const,
  });
}

export function createGpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence({
  preparedContentFrame,
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly projectionSampleId: number;
  readonly projectionTransactionId: string;
}): GpuFlowVisibleFramePresentationTextureEvictionPresentationEvidence {
  return Object.freeze({
    preparedContentFrameId: preparedContentFrame.displayFrameId,
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
}): readonly GpuFlowVisibleFrameBlockedPresentationCandidate["blockedReasons"][number][] {
  const preparedContentFrame = visibleProjectionState.preparedContentFrame;
  return Object.freeze([
    ...createGpuFlowVisibleFramePresentationDomPresentationBlockedReasons({
      preparedContentFrame,
      domEvidence: preparedContentFrame.presentationProof.domGenerationEvidence,
    }),
    ...createGpuFlowVisibleFramePresentationDomTransformPresentationBlockedReasons(
      {
        preparedContentFrame,
        domTransformEvidence:
          presentationEvidence?.domTransformEvidence ?? null,
        reducerDecision,
        visibleProjectionState,
      },
    ),
    ...createGpuFlowVisibleFramePresentationTextureEvictionPresentationBlockedReasons(
      {
        preparedContentFrame,
        reducerDecision,
        textureEvictionEvidence:
          presentationEvidence?.textureEvictionEvidence ?? null,
        visibleProjectionState,
      },
    ),
    ...createGpuFlowVisibleFramePresentationCanvasPresentationBlockedReasons({
      canvasEvidence: presentationEvidence?.canvasGenerationEvidence ?? null,
      preparedContentFrame,
      reducerDecision,
      visibleProjectionState,
    }),
  ]);
}

type GpuFlowVisibleFramePresentationBlockedReason =
  GpuFlowVisibleFrameBlockedPresentationCandidate["blockedReasons"][number];

function createGpuFlowVisibleFramePresentationDomPresentationBlockedReasons({
  preparedContentFrame,
  domEvidence,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
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
  if (domEvidence.preparedFrameId !== preparedContentFrame.displayFrameId) {
    reasons.push({
      actorId: null,
      family: "presentation-pair",
      reason: "dom-generation-frame-mismatch",
    });
  }
  return Object.freeze(reasons);
}

function createGpuFlowVisibleFramePresentationDomTransformPresentationBlockedReasons({
  preparedContentFrame,
  domTransformEvidence,
  reducerDecision,
  visibleProjectionState,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
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
  if (
    domTransformEvidence.preparedContentFrameId !==
    preparedContentFrame.displayFrameId
  ) {
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
  preparedContentFrame,
  reducerDecision,
  textureEvictionEvidence,
  visibleProjectionState,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
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
    textureEvictionEvidence.preparedContentFrameId !==
    preparedContentFrame.displayFrameId
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
  preparedContentFrame,
  reducerDecision,
  visibleProjectionState,
}: {
  readonly canvasEvidence: GpuFlowVisibleFramePresentationCanvasPresentationEvidence | null;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
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
  if (
    canvasEvidence.preparedContentFrameId !==
    preparedContentFrame.displayFrameId
  ) {
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
    preparedContentFrame.presentationProof.batchId
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
      preparedContentFrame,
    }),
  );
  return Object.freeze(reasons);
}

function createGpuFlowVisibleFramePresentationSectionPresentationBlockedReasons({
  canvasEvidence,
  preparedContentFrame,
}: {
  readonly canvasEvidence: GpuFlowVisibleFramePresentationCanvasPresentationEvidence;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
}): readonly GpuFlowVisibleFramePresentationBlockedReason[] {
  const drawnNodeIds = new Set(canvasEvidence.drawnNodeIds);
  const missingTextureNodeIds = new Set(canvasEvidence.missingTextureNodeIds);
  return Object.freeze(
    preparedContentFrame.actorGenerations
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
