import { createGpuFlowJsonDigest } from "../gpuFlowDigest";
import {
  assertGpuFlowPreparedContentPresentationProof,
  createGpuFlowPreparedContentActorManifestDigest,
  type GpuFlowPreparedContentFrame,
} from "../preparedContentFrame";
import type {
  GpuFlowProjectionTransaction,
  GpuFlowProjectionTransactionKind,
} from "../projectionRuntime";
import {
  assertGpuFlowVisibleFramePresentationResourcesProtected,
  createGpuFlowVisibleFramePresentationResourceProtectionDigest,
  createGpuFlowVisibleFramePresentationResourceProtectionReport,
} from "./visibleFrameResourceGraph";

type GpuFlowProjectionSampleId = number;
type GpuFlowActorManifestDigest = string;
type GpuFlowVisibleProofDigest = string;
type GpuFlowPresentationPairDigest = string;
type GpuFlowResourceProtectionDigest = string;

export type GpuFlowPresentationPairProof = {
  readonly actorManifestDigest: string;
  readonly batchId: string;
  readonly browserVisualFragmentDigest: string | null;
  readonly canvasGenerationEvidence: {
    readonly committedFrameId: number;
    readonly exposable: true;
    readonly prepared: true;
    readonly presentationBatchId: string;
    readonly projectionSampleId: number;
    readonly projectionTransactionId: string;
    readonly source: "deferred-canvas-submission";
  };
  readonly domTransformEvidence: {
    readonly committedFrameId: number;
    readonly prepared: true;
    readonly projectionSampleId: number;
    readonly projectionTransactionId: string;
    readonly source: "deferred-dom-transform-submission";
  };
  readonly textureEvictionEvidence: {
    readonly committedFrameId: number;
    readonly prepared: true;
    readonly projectionSampleId: number;
    readonly projectionTransactionId: string;
    readonly source: "deferred-texture-eviction-submission";
  } | null;
  readonly canvasGeneration: GpuFlowPreparedContentFrame["presentationProof"]["canvasGeneration"];
  readonly domGenerationEvidence: GpuFlowPreparedContentFrame["presentationProof"]["domGenerationEvidence"];
  readonly domGeneration: GpuFlowPreparedContentFrame["presentationProof"]["domGeneration"];
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly projectionTransactionKind: GpuFlowProjectionTransactionKind;
  readonly surfaceTransactionDigest: string | null;
};

export type GpuFlowPresentationAuthorityProof = {
  readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
  readonly presentationPairDigest: GpuFlowPresentationPairDigest;
  readonly presentationPairProof: GpuFlowPresentationPairProof;
  readonly projectionTransactionKind: GpuFlowProjectionTransactionKind;
  readonly projectionTransactionId: GpuFlowProjectionTransaction["id"];
  readonly proofDigest: GpuFlowVisibleProofDigest;
  readonly resourceProtectionDigest: GpuFlowResourceProtectionDigest;
};

export function createGpuFlowPresentationAuthorityProof({
  frame,
  presentationPairProof,
  projectionSampleId,
  projectionTransactionKind,
  projectionTransactionId,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly presentationPairProof: GpuFlowPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly projectionTransactionKind: GpuFlowProjectionTransactionKind;
  readonly projectionTransactionId: GpuFlowProjectionTransaction["id"];
}): GpuFlowPresentationAuthorityProof {
  assertGpuFlowPresentationPairProof({
    frame,
    presentationPairProof,
    projectionSampleId,
    projectionTransactionKind,
    projectionTransactionId,
  });
  const resourceProtectionDigest =
    createGpuFlowPresentationResourceProtectionDigestForFrame({ frame });
  return Object.freeze({
    expectedActorSetDigest: presentationPairProof.actorManifestDigest,
    presentationPairDigest: createGpuFlowPresentationPairDigest({
      frame,
      presentationPairProof,
      projectionSampleId,
    }),
    presentationPairProof,
    projectionTransactionKind,
    projectionTransactionId,
    proofDigest: createGpuFlowVisibleProofDigest(frame),
    resourceProtectionDigest,
  });
}

export function assertGpuFlowPresentationAuthorityFrame({
  frame,
  presentationAuthorityProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly presentationAuthorityProof: GpuFlowPresentationAuthorityProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): void {
  if (
    frame.publishability.kind !== "publishable" ||
    frame.publishability.blockingActorIds.length > 0
  ) {
    throw new Error(
      "GPU Flow visible presentation authority requires a publishable prepared content frame frame.",
    );
  }
  assertGpuFlowPresentationPairFeasible({
    frame,
    presentationAuthorityProof,
    projectionSampleId,
  });
}

function assertGpuFlowPresentationPairFeasible({
  frame,
  presentationAuthorityProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly presentationAuthorityProof: GpuFlowPresentationAuthorityProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): void {
  assertGpuFlowPreparedContentPresentationProof(frame);
  assertGpuFlowPresentationAuthorityProofMatchesFrame({
    frame,
    presentationAuthorityProof,
    projectionSampleId,
  });
}

function assertGpuFlowPresentationAuthorityProofMatchesFrame({
  frame,
  presentationAuthorityProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly presentationAuthorityProof: GpuFlowPresentationAuthorityProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): void {
  assertGpuFlowPresentationPairProof({
    frame,
    presentationPairProof: presentationAuthorityProof.presentationPairProof,
    projectionSampleId,
    projectionTransactionKind:
      presentationAuthorityProof.projectionTransactionKind,
    projectionTransactionId: presentationAuthorityProof.projectionTransactionId,
  });
  const resourceProtectionDigest =
    createGpuFlowPresentationResourceProtectionDigestForFrame({ frame });
  if (
    presentationAuthorityProof.resourceProtectionDigest !==
    resourceProtectionDigest
  ) {
    throw new Error(
      "GPU Flow visible presentation authority requires the transaction proof resource protection proof for the selected frame.",
    );
  }
  if (
    presentationAuthorityProof.expectedActorSetDigest !==
      frame.presentationProof.actorManifestDigest ||
    presentationAuthorityProof.proofDigest !==
      createGpuFlowVisibleProofDigest(frame) ||
    presentationAuthorityProof.presentationPairDigest !==
      createGpuFlowPresentationPairDigest({
        frame,
        presentationPairProof: presentationAuthorityProof.presentationPairProof,
        projectionSampleId,
      })
  ) {
    throw new Error(
      "GPU Flow visible presentation authority requires the transaction proof presentable frame proof for the selected frame.",
    );
  }
}

export function assertGpuFlowPresentationPairProof({
  frame,
  presentationPairProof,
  projectionSampleId,
  projectionTransactionKind,
  projectionTransactionId,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly presentationPairProof: GpuFlowPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly projectionTransactionKind: GpuFlowProjectionTransactionKind;
  readonly projectionTransactionId: GpuFlowProjectionTransaction["id"];
}): void {
  const expected = frame.presentationProof;
  if (
    !isGpuFlowPresentationPairProofHeaderValid({
      expected,
      presentationPairProof,
      projectionSampleId,
      projectionTransactionKind,
    }) ||
    !areGpuFlowDomPresentationGenerationEvidenceEqual(
      presentationPairProof.domGenerationEvidence,
      expected.domGenerationEvidence,
    ) ||
    !isGpuFlowCanvasPresentationEvidenceValid({
      frame,
      presentationPairProof,
      projectionSampleId,
      projectionTransactionId,
    }) ||
    !isGpuFlowTextureEvictionPresentationEvidenceValid({
      frame,
      presentationPairProof,
      projectionSampleId,
      projectionTransactionId,
      projectionTransactionKind,
    }) ||
    !isGpuFlowDomTransformPresentationEvidenceValid({
      frame,
      presentationPairProof,
      projectionSampleId,
      projectionTransactionId,
    }) ||
    !areGpuFlowPresentationGenerationProofsEqual(
      presentationPairProof.domGeneration,
      expected.domGeneration,
    ) ||
    !areGpuFlowPresentationGenerationProofsEqual(
      presentationPairProof.canvasGeneration,
      expected.canvasGeneration,
    )
  ) {
    throw new Error(
      "GPU Flow visible presentation authority requires the transaction proof DOM/canvas presentation pair proof for the selected frame and projection sample.",
    );
  }
}

function isGpuFlowPresentationPairProofHeaderValid({
  expected,
  presentationPairProof,
  projectionSampleId,
  projectionTransactionKind,
}: {
  readonly expected: GpuFlowPreparedContentFrame["presentationProof"];
  readonly presentationPairProof: GpuFlowPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly projectionTransactionKind: GpuFlowProjectionTransactionKind;
}): boolean {
  return (
    presentationPairProof.projectionSampleId === projectionSampleId &&
    presentationPairProof.projectionTransactionKind ===
      projectionTransactionKind &&
    presentationPairProof.batchId === expected.batchId &&
    presentationPairProof.actorManifestDigest ===
      expected.actorManifestDigest &&
    presentationPairProof.browserVisualFragmentDigest ===
      expected.browserVisualFragmentDigest &&
    presentationPairProof.surfaceTransactionDigest ===
      expected.surfaceTransactionDigest
  );
}

function areGpuFlowDomPresentationGenerationEvidenceEqual(
  left: GpuFlowPresentationPairProof["domGenerationEvidence"],
  right: GpuFlowPresentationPairProof["domGenerationEvidence"],
): boolean {
  return (
    left.browserVisualCandidateId === right.browserVisualCandidateId &&
    left.preparedFrameId === right.preparedFrameId &&
    left.domControlMountedCount === right.domControlMountedCount &&
    left.domControlSnapshotCount === right.domControlSnapshotCount &&
    left.domIslandCount === right.domIslandCount &&
    left.exposable === right.exposable &&
    left.runtimeFrameId === right.runtimeFrameId &&
    left.source === right.source &&
    left.staged === right.staged
  );
}

function isGpuFlowCanvasPresentationEvidenceValid({
  frame,
  presentationPairProof,
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly presentationPairProof: GpuFlowPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly projectionTransactionId: GpuFlowProjectionTransaction["id"];
}): boolean {
  const canvasEvidence = presentationPairProof.canvasGenerationEvidence;
  return (
    canvasEvidence.committedFrameId === frame.displayFrameId &&
    canvasEvidence.exposable === true &&
    canvasEvidence.prepared === true &&
    canvasEvidence.presentationBatchId === frame.presentationProof.batchId &&
    canvasEvidence.projectionSampleId === projectionSampleId &&
    canvasEvidence.projectionTransactionId === projectionTransactionId &&
    canvasEvidence.source === "deferred-canvas-submission"
  );
}

function isGpuFlowDomTransformPresentationEvidenceValid({
  frame,
  presentationPairProof,
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly presentationPairProof: GpuFlowPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly projectionTransactionId: GpuFlowProjectionTransaction["id"];
}): boolean {
  const domTransformEvidence = presentationPairProof.domTransformEvidence;
  return (
    domTransformEvidence.committedFrameId === frame.displayFrameId &&
    domTransformEvidence.prepared === true &&
    domTransformEvidence.projectionSampleId === projectionSampleId &&
    domTransformEvidence.projectionTransactionId === projectionTransactionId &&
    domTransformEvidence.source === "deferred-dom-transform-submission"
  );
}

function isGpuFlowTextureEvictionPresentationEvidenceValid({
  frame,
  presentationPairProof,
  projectionSampleId,
  projectionTransactionId,
  projectionTransactionKind,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly presentationPairProof: GpuFlowPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly projectionTransactionId: GpuFlowProjectionTransaction["id"];
  readonly projectionTransactionKind: GpuFlowProjectionTransactionKind;
}): boolean {
  const textureEvictionEvidence = presentationPairProof.textureEvictionEvidence;
  if (projectionTransactionKind === "motion-projection") {
    return textureEvictionEvidence === null;
  }
  if (textureEvictionEvidence === null) {
    return false;
  }
  return (
    textureEvictionEvidence.committedFrameId === frame.displayFrameId &&
    textureEvictionEvidence.prepared === true &&
    textureEvictionEvidence.projectionSampleId === projectionSampleId &&
    textureEvictionEvidence.projectionTransactionId ===
      projectionTransactionId &&
    textureEvictionEvidence.source === "deferred-texture-eviction-submission"
  );
}

type GpuFlowPresentationGenerationProof =
  | GpuFlowPresentationPairProof["domGeneration"]
  | GpuFlowPresentationPairProof["canvasGeneration"];
type GpuFlowDomPresentationGenerationProof =
  GpuFlowPresentationPairProof["domGeneration"];
type GpuFlowCanvasPresentationGenerationProof =
  GpuFlowPresentationPairProof["canvasGeneration"];

function areGpuFlowPresentationGenerationProofsEqual(
  left: GpuFlowPresentationGenerationProof,
  right: GpuFlowPresentationGenerationProof,
): boolean {
  if (isGpuFlowDomPresentationGenerationProof(left)) {
    return (
      isGpuFlowDomPresentationGenerationProof(right) &&
      areGpuFlowDomPresentationGenerationProofsEqual(left, right)
    );
  }
  return (
    isGpuFlowCanvasPresentationGenerationProof(left) &&
    isGpuFlowCanvasPresentationGenerationProof(right) &&
    areGpuFlowCanvasPresentationGenerationProofsEqual(left, right)
  );
}

function isGpuFlowDomPresentationGenerationProof(
  proof: GpuFlowPresentationGenerationProof,
): proof is GpuFlowDomPresentationGenerationProof {
  return "staged" in proof;
}

function isGpuFlowCanvasPresentationGenerationProof(
  proof: GpuFlowPresentationGenerationProof,
): proof is GpuFlowCanvasPresentationGenerationProof {
  return "prepared" in proof;
}

function areGpuFlowDomPresentationGenerationProofsEqual(
  left: GpuFlowDomPresentationGenerationProof,
  right: GpuFlowDomPresentationGenerationProof,
): boolean {
  return (
    left.browserVisualPreparedFrameId === right.browserVisualPreparedFrameId &&
    left.domControlPreparedFrameId === right.domControlPreparedFrameId &&
    left.domIslandPreparedFrameId === right.domIslandPreparedFrameId &&
    left.exposable === right.exposable &&
    left.presentationBatchId === right.presentationBatchId &&
    left.staged === right.staged
  );
}

function areGpuFlowCanvasPresentationGenerationProofsEqual(
  left: GpuFlowCanvasPresentationGenerationProof,
  right: GpuFlowCanvasPresentationGenerationProof,
): boolean {
  return (
    left.canvasRetainedFrameId === right.canvasRetainedFrameId &&
    left.debugSnapshotFrameId === right.debugSnapshotFrameId &&
    left.exposable === right.exposable &&
    left.gpuNativeVisualPreparedFrameId ===
      right.gpuNativeVisualPreparedFrameId &&
    left.htmlTextureOverlayPreparedFrameId ===
      right.htmlTextureOverlayPreparedFrameId &&
    left.prepared === right.prepared &&
    left.presentationBatchId === right.presentationBatchId
  );
}

export function createGpuFlowPresentationResourceProtectionDigestForFrame({
  frame,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
}): GpuFlowResourceProtectionDigest {
  const report =
    createGpuFlowVisibleFramePresentationResourceProtectionReport(frame);
  assertGpuFlowVisibleFramePresentationResourcesProtected(report);
  return createGpuFlowVisibleFramePresentationResourceProtectionDigest(report);
}

export function createGpuFlowActorManifestDigest(
  frame: GpuFlowPreparedContentFrame,
): GpuFlowActorManifestDigest {
  return createGpuFlowPreparedContentActorManifestDigest(
    frame.actorGenerations,
  );
}

export function createGpuFlowVisibleProofDigest(
  frame: GpuFlowPreparedContentFrame,
): GpuFlowVisibleProofDigest {
  const transaction = frame.surfaceTransaction;
  return createGpuFlowJsonDigest("visible-frame-presentation-proof", {
    blockingActorIds: frame.publishability.blockingActorIds,
    browserVisualCoverage: frame.projectionHorizon.textActorCoverage,
    kind: frame.publishability.kind,
    protectedResourceHandles: transaction?.protectedResourceHandles ?? [],
    surfaceCoverage: transaction
      ? {
          compatible: transaction.coverageProof.compatibleCoverage.length,
          exact: transaction.coverageProof.exactCoverage.length,
          trueHoles: transaction.coverageProof.trueHoleRects.length,
        }
      : null,
  });
}

export function createGpuFlowPresentationPairDigest({
  frame,
  presentationPairProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowPreparedContentFrame;
  readonly presentationPairProof: GpuFlowPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): GpuFlowPresentationPairDigest {
  return createGpuFlowJsonDigest("visible-presentation-pair", {
    actorManifestDigest: frame.presentationProof.actorManifestDigest,
    browserVisualFragmentDigest:
      frame.presentationProof.browserVisualFragmentDigest,
    canvasGenerationEvidence: presentationPairProof.canvasGenerationEvidence,
    canvasGeneration: frame.presentationProof.canvasGeneration,
    domTransformEvidence: presentationPairProof.domTransformEvidence,
    domGenerationEvidence: frame.presentationProof.domGenerationEvidence,
    domGeneration: frame.presentationProof.domGeneration,
    presentationBatchId: frame.presentationProof.batchId,
    presentationProofDigest: createGpuFlowPresentationProofDigest(frame),
    projectionSampleId,
    projectionTransactionKind: presentationPairProof.projectionTransactionKind,
    proofDigest: createGpuFlowVisibleProofDigest(frame),
    proofPresentationActorManifestDigest:
      frame.presentationProof.actorManifestDigest,
    surfaceTransactionDigest: frame.presentationProof.surfaceTransactionDigest,
    textureEvictionEvidence: presentationPairProof.textureEvictionEvidence,
  });
}

function createGpuFlowPresentationProofDigest(
  frame: GpuFlowPreparedContentFrame,
): string {
  return createGpuFlowJsonDigest("visible-presentation-proof", {
    actorManifestDigest: frame.presentationProof.actorManifestDigest,
    browserVisualFragmentDigest:
      frame.presentationProof.browserVisualFragmentDigest,
    canvasGeneration: frame.presentationProof.canvasGeneration,
    domGenerationEvidence: frame.presentationProof.domGenerationEvidence,
    domGeneration: frame.presentationProof.domGeneration,
    presentationBatchId: frame.presentationProof.batchId,
    surfaceTransactionDigest: frame.presentationProof.surfaceTransactionDigest,
  });
}
