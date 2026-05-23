import {
  assertGpuFlowCommittedSurfacePresentationProof,
  createGpuFlowCommittedSurfaceActorManifestDigest,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import { createGpuFlowJsonDigest } from "../gpuFlowDigest";
import type { GpuFlowProjectionTransaction } from "../projectionRuntime";
import {
  assertGpuFlowVisiblePublicationResourcesProtected,
  createGpuFlowVisiblePublicationResourceProtectionDigest,
  createGpuFlowVisiblePublicationResourceProtectionReport,
} from "./visibleFrameResourceRegistry";

type GpuFlowProjectionSampleId = number;
type GpuFlowActorManifestDigest = string;
type GpuFlowVisibleProofDigest = string;
type GpuFlowPresentationPairDigest = string;
type GpuFlowResourceProtectionDigest = string;

export type GpuFlowCommitPresentationPairProof = {
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
  readonly canvasGeneration: GpuFlowCommittedSurfaceFrame["presentationProof"]["canvasGeneration"];
  readonly domGenerationEvidence: GpuFlowCommittedSurfaceFrame["presentationProof"]["domGenerationEvidence"];
  readonly domGeneration: GpuFlowCommittedSurfaceFrame["presentationProof"]["domGeneration"];
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly surfaceTransactionDigest: string | null;
};

export type GpuFlowCommitAuthorityProof = {
  readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
  readonly presentationPairDigest: GpuFlowPresentationPairDigest;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly projectionTransactionId: GpuFlowProjectionTransaction["id"];
  readonly proofDigest: GpuFlowVisibleProofDigest;
  readonly resourceProtectionDigest: GpuFlowResourceProtectionDigest;
};

export function createGpuFlowCommitAuthorityProof({
  frame,
  presentationPairProof,
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly projectionTransactionId: GpuFlowProjectionTransaction["id"];
}): GpuFlowCommitAuthorityProof {
  assertGpuFlowCommitPresentationPairProof({
    frame,
    presentationPairProof,
    projectionSampleId,
    projectionTransactionId,
  });
  const resourceProtectionDigest =
    createGpuFlowCommitResourceProtectionDigestForFrame({ frame });
  return Object.freeze({
    expectedActorSetDigest: presentationPairProof.actorManifestDigest,
    presentationPairDigest: createGpuFlowPresentationPairDigest({
      frame,
      presentationPairProof,
      projectionSampleId,
    }),
    presentationPairProof,
    projectionTransactionId,
    proofDigest: createGpuFlowVisibleProofDigest(frame),
    resourceProtectionDigest,
  });
}

export function assertGpuFlowPresentableCommitFrame({
  frame,
  commitAuthorityProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): void {
  if (
    frame.publishability.kind !== "publishable" ||
    frame.publishability.blockingActorIds.length > 0
  ) {
    throw new Error(
      "GPU Flow commit publication authority requires a publishable committed surface frame.",
    );
  }
  assertGpuFlowPresentationPairFeasible({
    frame,
    commitAuthorityProof,
    projectionSampleId,
  });
}

function assertGpuFlowPresentationPairFeasible({
  frame,
  commitAuthorityProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): void {
  assertGpuFlowCommittedSurfacePresentationProof(frame);
  assertGpuFlowCommitAuthorityProofMatchesFrame({
    frame,
    commitAuthorityProof,
    projectionSampleId,
  });
}

export function assertGpuFlowCommitAuthorityProofMatchesFrame({
  frame,
  commitAuthorityProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): void {
  assertGpuFlowCommitPresentationPairProof({
    frame,
    presentationPairProof: commitAuthorityProof.presentationPairProof,
    projectionSampleId,
    projectionTransactionId: commitAuthorityProof.projectionTransactionId,
  });
  const resourceProtectionDigest =
    createGpuFlowCommitResourceProtectionDigestForFrame({ frame });
  if (
    commitAuthorityProof.resourceProtectionDigest !== resourceProtectionDigest
  ) {
    throw new Error(
      "GPU Flow commit publication authority requires the transaction proof resource protection proof for the selected frame.",
    );
  }
  if (
    commitAuthorityProof.expectedActorSetDigest !==
      frame.presentationProof.actorManifestDigest ||
    commitAuthorityProof.proofDigest !== createGpuFlowVisibleProofDigest(frame) ||
    commitAuthorityProof.presentationPairDigest !==
      createGpuFlowPresentationPairDigest({
        frame,
        presentationPairProof: commitAuthorityProof.presentationPairProof,
        projectionSampleId,
      })
  ) {
    throw new Error(
      "GPU Flow commit publication authority requires the transaction proof presentable commit proof for the selected frame.",
    );
  }
}

export function assertGpuFlowCommitPresentationPairProof({
  frame,
  presentationPairProof,
  projectionSampleId,
  projectionTransactionId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly projectionTransactionId: GpuFlowProjectionTransaction["id"];
}): void {
  const expected = frame.presentationProof;
  if (
    !isGpuFlowCommitPresentationPairProofHeaderValid({
      expected,
      presentationPairProof,
      projectionSampleId,
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
      "GPU Flow commit publication authority requires the transaction proof DOM/canvas presentation pair proof for the selected frame and projection sample.",
    );
  }
}

function isGpuFlowCommitPresentationPairProofHeaderValid({
  expected,
  presentationPairProof,
  projectionSampleId,
}: {
  readonly expected: GpuFlowCommittedSurfaceFrame["presentationProof"];
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): boolean {
  return (
    presentationPairProof.projectionSampleId === projectionSampleId &&
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
  left: GpuFlowCommitPresentationPairProof["domGenerationEvidence"],
  right: GpuFlowCommitPresentationPairProof["domGenerationEvidence"],
): boolean {
  return (
    left.browserVisualCandidateId === right.browserVisualCandidateId &&
    left.committedFrameId === right.committedFrameId &&
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
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
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

type GpuFlowPresentationGenerationProof =
  | GpuFlowCommitPresentationPairProof["domGeneration"]
  | GpuFlowCommitPresentationPairProof["canvasGeneration"];
type GpuFlowDomPresentationGenerationProof =
  GpuFlowCommitPresentationPairProof["domGeneration"];
type GpuFlowCanvasPresentationGenerationProof =
  GpuFlowCommitPresentationPairProof["canvasGeneration"];

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
    left.browserVisualCommittedFrameId ===
      right.browserVisualCommittedFrameId &&
    left.domControlCommittedFrameId === right.domControlCommittedFrameId &&
    left.domIslandCommittedFrameId === right.domIslandCommittedFrameId &&
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
    left.gpuNativeVisualCommittedFrameId ===
      right.gpuNativeVisualCommittedFrameId &&
    left.htmlTextureOverlayCommittedFrameId ===
      right.htmlTextureOverlayCommittedFrameId &&
    left.prepared === right.prepared &&
    left.presentationBatchId === right.presentationBatchId
  );
}

export function createGpuFlowCommitResourceProtectionDigestForFrame({
  frame,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): GpuFlowResourceProtectionDigest {
  const report = createGpuFlowVisiblePublicationResourceProtectionReport(frame);
  assertGpuFlowVisiblePublicationResourcesProtected(report);
  return createGpuFlowVisiblePublicationResourceProtectionDigest(report);
}

export function createGpuFlowActorManifestDigest(
  frame: GpuFlowCommittedSurfaceFrame,
): GpuFlowActorManifestDigest {
  return createGpuFlowCommittedSurfaceActorManifestDigest(
    frame.actorGenerations,
  );
}

export function createGpuFlowVisibleProofDigest(
  frame: GpuFlowCommittedSurfaceFrame,
): GpuFlowVisibleProofDigest {
  const transaction = frame.surfaceTransaction;
  return createGpuFlowJsonDigest("visible-publication-proof", {
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
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): GpuFlowPresentationPairDigest {
  return createGpuFlowJsonDigest("visible-presentation-pair", {
    actorManifestDigest: frame.presentationProof.actorManifestDigest,
    browserVisualFragmentDigest:
      frame.presentationProof.browserVisualFragmentDigest,
    canvasGenerationEvidence: presentationPairProof.canvasGenerationEvidence,
    canvasGeneration: frame.presentationProof.canvasGeneration,
    domGenerationEvidence: frame.presentationProof.domGenerationEvidence,
    domGeneration: frame.presentationProof.domGeneration,
    presentationBatchId: frame.presentationProof.batchId,
    presentationProofDigest: createGpuFlowPresentationProofDigest(frame),
    projectionSampleId,
    proofDigest: createGpuFlowVisibleProofDigest(frame),
    proofPresentationActorManifestDigest:
      frame.presentationProof.actorManifestDigest,
    surfaceTransactionDigest: frame.presentationProof.surfaceTransactionDigest,
  });
}

function createGpuFlowPresentationProofDigest(
  frame: GpuFlowCommittedSurfaceFrame,
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
